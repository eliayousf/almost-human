#!/usr/bin/env python3
"""Small, auditable Mubit experiment. Never treats a local correction as training."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIRECTORY = ROOT / "artifacts/learning-proof"
GATEWAY = "https://api.mubit.ai/openai/v1/chat/completions"
MAX_ATTEMPTS = 3
SECRET = re.compile(r"(?:mbt_|mubit_|sk-)[A-Za-z0-9_-]{12,}|__client\s*=|Bearer\s+\S+", re.I)


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def load(filename):
    with open(filename, encoding="utf-8") as file:
        return json.load(file)


def save(filename, value):
    filename = Path(filename)
    filename.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(dir=filename.parent, prefix=".writing-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(value, file, ensure_ascii=False, indent=2, allow_nan=False)
            file.write("\n")
        os.replace(temporary, filename)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def manifest(directory):
    data = load(directory / "manifest.json")
    if data.get("schema") != 1 or data.get("model") != "gpt-6-luna" or data.get("lessons_enabled") is not False:
        raise ValueError("Unsupported experiment manifest.")
    limit = data.get("request_limit", MAX_ATTEMPTS)
    if (type(limit) is not int or not 1 <= limit <= 48
            or (limit != MAX_ATTEMPTS and data.get("mode") != "reviewed-training-batch")):
        raise ValueError("Expanded capture requires a bounded reviewed-training-batch manifest.")
    ids, evaluation_inputs, candidate_inputs = set(), set(), set()
    for case in data["cases"]:
        identifier = case.get("id", "")
        if not re.fullmatch(r"(?:candidate|eval)-[0-9]{2}", identifier) or identifier in ids:
            raise ValueError("Invalid or duplicate case ID.")
        ids.add(identifier)
        messages = case["messages"]
        if (case.get("origin") != "synthetic" or case.get("purpose") not in ("candidate", "evaluation")
                or len(messages) != 2 or [m.get("role") for m in messages] != ["system", "user"]
                or not all(isinstance(m.get("content"), str) and m["content"] for m in messages)
                or digest(messages[0]["content"]) != data["system_sha256"]):
            raise ValueError("Cases must be synthetic and share frozen production instructions.")
        if SECRET.search(json.dumps(messages)):
            raise ValueError("Credential-like content is forbidden in experiment prompts.")
        destination = evaluation_inputs if case["purpose"] == "evaluation" else candidate_inputs
        destination.add(messages[1]["content"])
    if evaluation_inputs & candidate_inputs:
        raise ValueError("Training candidates and evaluation inputs overlap.")
    return data


def reserve(directory, case_id, limit=MAX_ATTEMPTS):
    """A failed or interrupted network request still consumes its reservation."""
    lock = directory / ".request.lock"
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise ValueError("Another reservation is active. Inspect it; never reset the request ledger.") from None
    try:
        ledger_path = directory / "ledger.json"
        ledger = load(ledger_path) if ledger_path.exists() else {"limit": limit, "attempts": []}
        if ledger.get("limit") != limit or not isinstance(ledger.get("attempts"), list):
            raise ValueError("Invalid request ledger.")
        attempts = ledger["attempts"]
        if any(row["case_id"] == case_id for row in attempts):
            raise ValueError("This case already has a reserved request. Inspect its receipt; it will not be sent twice.")
        if len(attempts) >= limit:
            raise ValueError("The experiment request budget is exhausted. Do not reset it.")
        row = {"attempt": len(attempts) + 1, "case_id": case_id, "reserved_at": now()}
        attempts.append(row)
        save(ledger_path, ledger)
        return row
    finally:
        os.close(fd)
        lock.unlink()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "Redirect refused", headers, fp)


def generate(directory, case_id, capture=False, opener=None):
    data = manifest(directory)
    case = next((c for c in data["cases"] if c["id"] == case_id), None)
    if not case:
        raise ValueError("Unknown case.")
    if capture and case["purpose"] != "candidate":
        raise ValueError("Evaluation conversations must never be captured for training.")
    return send_request(directory, data, case_id, case["messages"], case["purpose"], capture, opener)


def revise(directory, case_id, feedback, opener=None):
    """Capture a conversational correction, not a replacement-target API call."""
    data = manifest(directory)
    case = next((c for c in data["cases"] if c["id"] == case_id), None)
    if not case or case["purpose"] != "candidate":
        raise ValueError("Only synthetic training candidates may receive corrective follow-ups.")
    original = load(directory / "receipts" / f"{case_id}.json")
    feedback = feedback.strip()
    if (original.get("state") != "answered" or original.get("system_sha256") != data["system_sha256"]
            or original.get("request", {}).get("messages") != case["messages"]):
        raise ValueError("A successful original reply with unchanged instructions is required.")
    if not 10 <= len(feedback) <= 500 or SECRET.search(feedback) or any(ord(c) < 32 for c in feedback):
        raise ValueError("Supply specific corrective feedback without secrets or control characters.")
    messages = case["messages"] + [
        {"role": "assistant", "content": original["reply"]},
        {"role": "user", "content": feedback},
    ]
    lineage = {"workflow": "conversational_correction", "original_case_id": case_id,
               "original_mubit_request_id": original.get("mubit_request_id"),
               "original_reply_sha256": original["reply_sha256"],
               "feedback": feedback, "feedback_author": "codex_assistant_for_project_owner",
               "replacement_target_api_used": False}
    return send_request(directory, data, case_id + "-revised", messages, "candidate", True, opener, lineage)


def send_request(directory, data, case_id, messages, purpose, capture, opener=None, lineage=None):
    key = os.environ.get("MUBIT_API_KEY")
    if not key:
        raise ValueError("MUBIT_API_KEY is not configured.")
    # Accept environment-injected credentials, including proxy placeholders.
    body = {"model": data["model"], "messages": messages,
            "max_completion_tokens": 384, "reasoning_effort": "low"}
    request_bytes = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
    reservation = reserve(directory, case_id, data.get("request_limit", MAX_ATTEMPTS))
    receipt_path = directory / "receipts" / f"{case_id}.json"
    receipt = {**reservation, "state": "pending", "source_commit": data["source_commit"],
               "system_sha256": data["system_sha256"], "request_sha256": hashlib.sha256(request_bytes).hexdigest(),
               "case_id": case_id, "origin": "synthetic", "purpose": purpose,
               "capture": "full" if capture else "off", "request": body,
               "served_by": "unverified", "training_inclusion": "unverified", **(lineage or {})}
    save(receipt_path, receipt)
    request = urllib.request.Request(GATEWAY, data=request_bytes, method="POST", headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json",
        "x-middleware-record": receipt["capture"],
    })
    opener = opener or urllib.request.build_opener(NoRedirect())
    started = time.monotonic()
    try:
        with opener.open(request, timeout=30) as response:
            receipt["http_status"] = response.status
            request_id = response.headers.get("x-middleware-request-id", "")
            if re.fullmatch(r"mreq_[A-Za-z0-9_-]{1,64}", request_id):
                receipt["mubit_request_id"] = request_id
            raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ValueError("Response too large.")
            result = json.loads(raw)
            choice = result["choices"][0]
            reply = choice["message"]["content"]
            if (response.status != 200 or choice.get("finish_reason") != "stop"
                    or not isinstance(reply, str) or not reply.strip() or len(reply) > 400
                    or key in reply or SECRET.search(reply)):
                raise ValueError("Unusable response.")
            receipt.update(state="answered", reply=reply.strip(), reply_sha256=digest(reply.strip()))
            usage = result.get("usage", {})
            receipt["tokens"] = {k: usage[k] for k in ("prompt_tokens", "completion_tokens", "total_tokens")
                                 if type(usage.get(k)) is int and usage[k] >= 0}
    except urllib.error.HTTPError as error:
        receipt.update(state="failed", http_status=error.code, error="http_error_no_retry")
    except (TimeoutError, urllib.error.URLError):
        receipt.update(state="failed", error="transport_error_no_retry")
    except (ValueError, KeyError, IndexError, TypeError):
        receipt.update(state="failed", error="unusable_response_no_retry")
    receipt.update(finished_at=now(), elapsed_ms=round((time.monotonic() - started) * 1000))
    save(receipt_path, receipt)
    return receipt


def correct(directory, case_id, replacement, reason):
    data = manifest(directory)
    case = next((c for c in data["cases"] if c["id"] == case_id), None)
    if not case or case["purpose"] != "candidate":
        raise ValueError("Only training candidates may be corrected.")
    receipt = load(directory / "receipts" / f"{case_id}.json")
    if receipt.get("state") != "answered" or receipt.get("system_sha256") != data["system_sha256"]:
        raise ValueError("A successful reply from this frozen experiment is required.")
    replacement, reason = replacement.strip(), reason.strip()
    if (not 3 <= len(replacement.split()) <= 12 or len(replacement) > 80 or not 10 <= len(reason) <= 500
            or any(ord(c) < 32 for c in replacement + reason) or SECRET.search(replacement + reason)
            or re.search(r"https?://|\bwww\.|[\w.+-]+@[\w.-]+\.[A-Za-z]+", replacement)
            or replacement == receipt["reply"]):
        raise ValueError("Supply a distinct, short game reply and a specific review reason without secrets/contact details.")
    filename = directory / "corrections" / f"{case_id}.json"
    if filename.exists():
        raise ValueError("This correction already exists. Preserve its provenance.")
    correction = {"schema": 1, "case_id": case_id, "reviewed_at": now(),
                  "origin": "synthetic", "reviewer": "project_operator",
                  "system_sha256": data["system_sha256"], "original_request_sha256": receipt["request_sha256"],
                  "mubit_request_id": receipt.get("mubit_request_id"), "original_reply": receipt["reply"],
                  "original_reply_sha256": receipt["reply_sha256"], "replacement": replacement,
                  "replacement_sha256": digest(replacement), "reason": reason,
                  "submitted_to_mubit": False, "accepted_training_target": False}
    save(filename, correction)
    return correction


def status(directory):
    data = manifest(directory)
    receipts = [load(p) for p in sorted((directory / "receipts").glob("*.json"))]
    corrections = [load(p) for p in sorted((directory / "corrections").glob("*.json"))]
    return {"source_commit": data["source_commit"], "system_sha256": data["system_sha256"],
            "candidate_cases": sum(c["purpose"] == "candidate" for c in data["cases"]),
            "held_out_cases": sum(c["purpose"] == "evaluation" for c in data["cases"]),
            "requests_reserved": len(load(directory / "ledger.json")["attempts"]) if (directory / "ledger.json").exists() else 0,
            "answered": sum(r.get("state") == "answered" for r in receipts), "corrections_prepared": len(corrections),
            "conversational_corrections_captured": sum(r.get("workflow") == "conversational_correction" and r.get("state") == "answered" for r in receipts),
            "mubit_correction_acceptance": "not_verified", "adapter_training": "not_verified",
            "fresh_adapter_response": "not_verified", "judging_use_of_mubit_complete": False,
            "receipts": receipts, "corrections": corrections}


def capture_batch(directory, opener=None):
    data = manifest(directory)
    if data.get("mode") != "reviewed-training-batch":
        raise ValueError("Batch capture requires its own explicit training manifest and ledger.")
    existing = load(directory / "ledger.json")["attempts"] if (directory / "ledger.json").exists() else []
    reserved = {row["case_id"] for row in existing}
    failures = 0
    for case in data["cases"]:
        if case["purpose"] != "candidate" or case["id"] in reserved:
            continue
        receipt = generate(directory, case["id"], True, opener)
        print(json.dumps({k: receipt[k] for k in ("case_id", "state", "reply", "mubit_request_id", "error") if k in receipt}), flush=True)
        if receipt["state"] != "answered":
            failures += 1
            if failures >= 3:
                raise ValueError("Stopped after three failures. Inspect receipts; no automatic retries.")
    return failures


def report(directory):
    result = status(directory)
    # Export is our review packet, NOT a claim of a supported Mubit upload format.
    data = manifest(directory)
    review = {"format": "almost-human-local-review-v1", "mubit_upload_format": False,
              "source_commit": data["source_commit"], "examples": []}
    for correction in result["corrections"]:
        case = next(c for c in data["cases"] if c["id"] == correction["case_id"])
        review["examples"].append({"messages": case["messages"], **correction})
    save(directory / "correction-review.json", review)
    save(directory / "status.json", {k: v for k, v in result.items() if k not in ("receipts", "corrections")})
    esc = html.escape
    cards = "".join(f'<article><h3>{esc(c["case_id"])}</h3><p><b>Original:</b> {esc(c["original_reply"])}</p>'
                    f'<p><b>Reviewed correction:</b> {esc(c["replacement"])}</p><p>{esc(c["reason"])}</p>'
                    '<p class="pending">Prepared locally. Not submitted or accepted by Mubit.</p></article>'
                    for c in result["corrections"])
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Almost Human — learning proof</title><style>
body{font:17px/1.55 system-ui,sans-serif;background:#f5f3ec;color:#152a2c;max-width:1000px;margin:40px auto;padding:0 24px}
h1{font-size:38px;line-height:1.15}h2{margin-top:36px}article,table,.flow{background:white;border:1px solid #d6ddd8;border-radius:12px;padding:20px;margin:16px 0}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:14px;border-bottom:1px solid #ddd}.pending{color:#8c4a08;font-weight:600}
.flow{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.step{padding:12px;border:1px solid #999;border-radius:8px}.waiting{border:2px dashed #b76b19}small{color:#536464}
</style><h1>Teach the next bot</h1><p>Improve short game-character replies using reviewed feedback.</p>
<p class="pending">Model update not yet verified. This page never treats a saved correction as completed training.</p>
<div class="flow"><span class="step">Bot writes a reply</span>→<span class="step">Review a better reply</span>→<span class="step waiting">Mubit accepts it</span>→<span class="step waiting">Mubit trains a version</span>→<span class="step waiting">Test a fresh reply</span></div>
'''
    page += f'<p>{result["answered"]} real replies received · {result["corrections_prepared"]} local corrections · {result["held_out_cases"]} held-out test cases prepared</p>' + cards
    conversations = [r for r in result["receipts"] if r.get("workflow") == "conversational_correction"]
    if conversations:
        page += '<h2>Conversational corrections captured through Mubit</h2><p>These preserve the original answer and add editorial feedback as the next user turn. They do not use a replacement-target API.</p>'
        for receipt in conversations:
            original = next((r for r in result["receipts"] if r["case_id"] == receipt["original_case_id"]), {})
            page += (f'<article><h3>{esc(receipt["case_id"])}</h3>'
                     f'<p><b>Original:</b> {esc(original.get("reply", "Unavailable"))}</p>'
                     f'<p><b>Correction:</b> {esc(receipt["feedback"])}</p>'
                     f'<p><b>Revised answer:</b> {esc(receipt.get("reply", "No usable reply"))}</p>'
                     '<p class="pending">Saved ratings, dataset inclusion, training completion and adapter serving each require separate service evidence.</p></article>')
    page += '<h2>Live request receipts</h2>'
    for receipt in result["receipts"]:
        page += (f'<article><h3>{esc(receipt["case_id"])}: {esc(receipt["state"])}</h3>'
                 f'<p>{esc(receipt.get("reply", "No usable reply recorded."))}</p>'
                 f'<p>Recording: {esc(receipt["capture"])} · Time: {receipt.get("elapsed_ms", 0)} ms</p>'
                 f'<small>Request: {esc(receipt.get("mubit_request_id", "unavailable"))}</small>'
                 '<p class="pending">Which model version served this reply is unverified.</p></article>')
    page += '''<h2>Evidence for the judges</h2><table><tr><th>Criterion</th><th>What we must show</th><th>Current state</th></tr>
<tr><td>Use of Mubit</td><td>Accepted correction → completed training version → new answer</td><td class="pending">Training evidence missing</td></tr>
<tr><td>Usefulness</td><td>Repeated NPC dialogue, tested by players; explain the developer benefit</td><td>Product rationale prepared; user benefit still needs demonstration</td></tr>
<tr><td>Technical execution</td><td>Real prompts, request receipts, fixed comparisons, held-out cases and honest failures</td><td>Experiment runner implemented; trained-model path pending</td></tr>
<tr><td>Demo</td><td>Play, show correction, show completed version, ask a fresh question live</td><td class="pending">Rehearse after training works</td></tr></table>
<h2>Submission video</h2><p>The hard limit is two minutes and 300 MB. Target 1:45–1:50 and follow judging/DEMO.md in the repository. Show real game interaction and label these saved training receipts as recorded evidence. Never present a provider reply as a trained-adapter response.</p>
<p>Dashed boxes still need service evidence. The local review file is not a Mubit API payload.</p>'''
    page += f'<small>Frozen source: {esc(result["source_commit"])} · Task fingerprint: {esc(result["system_sha256"])}</small></html>'
    (directory / "report.html").write_text(page, encoding="utf-8")
    return directory / "report.html"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status")
    commands.add_parser("report")
    commands.add_parser("capture-batch", help="Capture only synthetic candidates in an explicit bounded training batch; never rates them automatically.")
    call = commands.add_parser("generate")
    call.add_argument("case_id")
    call.add_argument("--capture-training-candidate", action="store_true", help="Allow Mubit to record this synthetic candidate; does not prove acceptance.")
    edit = commands.add_parser("correct")
    edit.add_argument("case_id")
    edit.add_argument("--replacement", required=True)
    edit.add_argument("--reason", required=True)
    followup = commands.add_parser("revise", help="Send corrective conversational feedback; acceptance and training still require service evidence.")
    followup.add_argument("case_id")
    followup.add_argument("--feedback", required=True)
    args = parser.parse_args()
    try:
        if args.command == "capture-batch":
            return 1 if capture_batch(args.directory) else 0
        if args.command in ("generate", "revise"):
            value = (generate(args.directory, args.case_id, args.capture_training_candidate)
                     if args.command == "generate" else revise(args.directory, args.case_id, args.feedback))
            print(json.dumps({k: value[k] for k in ("case_id", "state", "mubit_request_id", "reply", "http_status", "error", "elapsed_ms") if k in value}, indent=2))
            return 0 if value["state"] == "answered" else 1
        if args.command == "correct":
            value = correct(args.directory, args.case_id, args.replacement, args.reason)
            print(json.dumps({"case_id": value["case_id"], "prepared_locally": True, "submitted_to_mubit": False}))
        elif args.command == "report":
            print(report(args.directory))
        else:
            print(json.dumps({k: v for k, v in status(args.directory).items() if k not in ("receipts", "corrections")}, indent=2))
        return 0
    except (ValueError, FileNotFoundError) as error:
        print(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
