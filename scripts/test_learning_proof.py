"""Network-free checks for the experiment's isolation and evidence boundaries."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location("learning", Path(__file__).with_name("mubit-learning-proof.py"))
learning = importlib.util.module_from_spec(spec)
spec.loader.exec_module(learning)


class Response(io.BytesIO):
    status = 200
    headers = {"x-middleware-request-id": "mreq_test123"}


class Opener:
    def __init__(self, failure=None, reply="a very small synthetic reply"):
        self.failure, self.reply, self.requests = failure, reply, []

    def open(self, request, timeout):
        self.requests.append(request)
        if self.failure:
            raise self.failure
        return Response(json.dumps({"choices": [{"message": {"content": self.reply}, "finish_reason": "stop"}],
                                    "usage": {"prompt_tokens": 100, "completion_tokens": 7}}).encode())


class LearningProofTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.data = {"schema": 1, "model": "gpt-6-luna", "lessons_enabled": False,
                     "source_commit": "a" * 40, "system_sha256": learning.digest("fixed instructions"),
                     "cases": [{"id": name, "purpose": purpose, "origin": "synthetic",
                                "messages": [{"role": "system", "content": "fixed instructions"},
                                             {"role": "user", "content": name}]}
                               for name, purpose in [("candidate-01", "candidate"), ("candidate-02", "candidate"),
                                                     ("candidate-03", "candidate"), ("candidate-04", "candidate"),
                                                     ("eval-01", "evaluation")]]}
        learning.save(self.directory / "manifest.json", self.data)
        key = patch.dict(os.environ, {"MUBIT_API_KEY": "injected-test-placeholder"})
        key.start()
        self.addCleanup(key.stop)

    def test_success_is_a_real_receipt_not_adapter_evidence(self):
        opener = Opener()
        result = learning.generate(self.directory, "candidate-01", True, opener)
        self.assertEqual(result["state"], "answered")
        self.assertEqual(result["mubit_request_id"], "mreq_test123")
        self.assertEqual(result["served_by"], "unverified")
        self.assertEqual(opener.requests[0].full_url, learning.GATEWAY)
        self.assertEqual(opener.requests[0].get_header("X-middleware-record"), "full")
        saved = (self.directory / "receipts/candidate-01.json").read_text()
        self.assertNotIn("injected-test-placeholder", saved)

    def test_evaluation_cannot_enter_capture_or_corrections(self):
        opener = Opener()
        with self.assertRaises(ValueError):
            learning.generate(self.directory, "eval-01", True, opener)
        with self.assertRaises(ValueError):
            learning.correct(self.directory, "eval-01", "a better answer", "a specific review reason")
        self.assertFalse(opener.requests)
        self.assertFalse((self.directory / "ledger.json").exists())
        learning.generate(self.directory, "eval-01", False, opener)
        self.assertEqual(opener.requests[0].get_header("X-middleware-record"), "off")

    def test_overlap_and_prompt_drift_are_rejected_before_network(self):
        self.data["cases"][-1]["messages"][1]["content"] = "candidate-01"
        learning.save(self.directory / "manifest.json", self.data)
        with self.assertRaises(ValueError):
            learning.manifest(self.directory)
        self.data["cases"][-1]["messages"][1]["content"] = "different"
        self.data["cases"][0]["messages"][0]["content"] = "changed instructions"
        learning.save(self.directory / "manifest.json", self.data)
        with self.assertRaises(ValueError):
            learning.manifest(self.directory)

    def test_timeouts_consume_budget_and_are_not_retried(self):
        opener = Opener(urllib.error.URLError("sensitive upstream diagnostic"))
        result = learning.generate(self.directory, "candidate-01", opener=opener)
        self.assertEqual(result["error"], "transport_error_no_retry")
        with self.assertRaises(ValueError):
            learning.generate(self.directory, "candidate-01", opener=opener)
        learning.generate(self.directory, "candidate-02", opener=opener)
        learning.generate(self.directory, "candidate-03", opener=opener)
        with self.assertRaises(ValueError):
            learning.generate(self.directory, "candidate-04", opener=opener)
        self.assertEqual(len(opener.requests), 3)
        self.assertNotIn("sensitive upstream", json.dumps(result))

    def test_http_error_bodies_are_not_saved(self):
        error = urllib.error.HTTPError(learning.GATEWAY, 403, "secret upstream text", {}, io.BytesIO(b"private"))
        result = learning.generate(self.directory, "candidate-01", opener=Opener(error))
        self.assertEqual(result["http_status"], 403)
        self.assertNotIn("private", json.dumps(result))
        self.assertNotIn("secret upstream", json.dumps(result))

    def test_redirects_never_forward_the_key(self):
        with self.assertRaises(urllib.error.HTTPError):
            learning.NoRedirect().redirect_request(
                urllib.request.Request(learning.GATEWAY), None, 302, "Found", {}, "https://unrelated.example/")

    def test_local_correction_keeps_lineage_without_claiming_acceptance(self):
        receipt = learning.generate(self.directory, "candidate-01", True, Opener())
        correction = learning.correct(self.directory, "candidate-01", "my socks have a secret escape tunnel",
                                      "Make the response concrete and less generic.")
        self.assertEqual(correction["original_request_sha256"], receipt["request_sha256"])
        self.assertEqual(correction["original_reply_sha256"], receipt["reply_sha256"])
        self.assertFalse(correction["submitted_to_mubit"])
        self.assertFalse(correction["accepted_training_target"])
        learning.report(self.directory)
        state = learning.load(self.directory / "status.json")
        self.assertFalse(state["judging_use_of_mubit_complete"])
        self.assertEqual(state["adapter_training"], "not_verified")
        self.assertEqual(learning.load(self.directory / "correction-review.json")["mubit_upload_format"], False)
        with self.assertRaises(ValueError):
            learning.correct(self.directory, "candidate-01", "a completely different reviewed answer", "Preserve prior review evidence.")

    def test_html_output_escapes_model_and_review_text(self):
        learning.generate(self.directory, "candidate-01", True, Opener(reply="<script>alert('synthetic')</script>"))
        learning.correct(self.directory, "candidate-01", "a safer plain text reply", "Remove <script> markup from the reply.")
        output = learning.report(self.directory).read_text()
        self.assertNotIn("<script>", output)
        self.assertIn("&lt;script&gt;", output)

    def test_missing_key_does_not_spend_a_reservation(self):
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(ValueError):
            learning.generate(self.directory, "candidate-01", opener=Opener())
        self.assertFalse((self.directory / "ledger.json").exists())

    def test_secret_echo_is_rejected(self):
        result = learning.generate(self.directory, "candidate-01", opener=Opener(reply="injected-test-placeholder"))
        self.assertEqual(result["state"], "failed")
        self.assertNotIn("reply", result)

    def test_concurrent_reservation_is_refused(self):
        (self.directory / ".request.lock").touch()
        with self.assertRaises(ValueError):
            learning.reserve(self.directory, "candidate-01")
        self.assertTrue((self.directory / ".request.lock").exists())


if __name__ == "__main__":
    unittest.main()
