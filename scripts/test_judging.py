"""Check the public evidence boundary and accidental-network-call guard."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('judging', Path(__file__).with_name('check-judging-evidence.py'))
judging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(judging)


class JudgingTests(unittest.TestCase):
    def setUp(self):
        self.evidence = json.loads((ROOT / 'judging/evidence/mubit-run.json').read_text())

    def test_public_snapshot_and_criteria_are_consistent(self):
        judging.validate_mubit(self.evidence)
        judging.validate_criteria(json.loads((ROOT / 'judging/evidence/criteria.json').read_text()))
        judging.check_links()

    def test_raw_fields_and_credentials_are_rejected(self):
        for value in [{'reply': 'synthetic but raw'}, {'extra': 'mbt_synthetic_secret_example'}, {'extra': 'person@example.com'}, {'extra': '/Users/example/private'}]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                judging.sanitised(value)

    def test_serving_and_quality_overclaims_are_rejected(self):
        for section, field in [('serving', 'fresh_live_answer_verified'), ('evaluation', 'quality_improvement_established')]:
            changed = copy.deepcopy(self.evidence)
            changed[section][field] = True
            with self.assertRaises(ValueError):
                judging.validate_mubit(changed)
        changed = copy.deepcopy(self.evidence)
        changed['evaluation']['dataset_id'] = 'different'
        with self.assertRaises(ValueError):
            judging.validate_mubit(changed)

    def test_network_guard_refuses_fetch_and_sockets(self):
        code = """
const assert = require('node:assert/strict');
(async () => {
  await assert.rejects(fetch('https://example.invalid'), /Judging checks forbid network/);
  assert.throws(() => require('node:https').get('https://example.invalid'), /Judging checks forbid network/);
  assert.throws(() => require('node:net').connect(443, 'example.invalid'), /Judging checks forbid network/);
})().catch(() => process.exit(1));
"""
        result = subprocess.run(['node', '--require', str(ROOT / 'scripts/judging-no-network.cjs'), '-e', code], env={k: v for k, v in os.environ.items() if k != 'NODE_OPTIONS'}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_guard_allows_only_the_named_local_metro_logging_socket(self):
        code = """
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const socket = path.join(require('node:os').tmpdir(), `event-log-${process.getuid?.() ?? 0}`, `${process.pid}-qa`, 'ipc.sock');
fs.mkdirSync(path.dirname(socket), {recursive:true});
process.env.__eventLogIpc = socket;
assert.throws(() => net.connect(path.join(require('node:os').tmpdir(), 'unrelated.sock')), /forbid network/);
assert.throws(() => net.connect({path:socket, host:'example.invalid', port:443}), /forbid network/);
const server = net.createServer(stream => stream.end('local IPC only'));
server.listen(socket, () => {
  let text = '';
  const client = net.connect(socket);
  client.on('data', data => text += data);
  client.on('end', () => { assert.equal(text, 'local IPC only'); server.close(() => fs.rmSync(path.dirname(socket), {recursive:true,force:true})); });
  client.on('error', () => process.exit(1));
});
"""
        result = subprocess.run(['node', '--require', str(ROOT / 'scripts/judging-no-network.cjs'), '-e', code], env={k: v for k, v in os.environ.items() if k != 'NODE_OPTIONS'}, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
