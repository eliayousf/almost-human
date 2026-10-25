#!/usr/bin/env python3
"""Validate public judging summaries and local links, without contacting services.

Consistency and redaction checks do not authenticate the original service records.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = re.compile(r'(?<![A-Za-z0-9_-])(?:mbt_|sk-)[A-Za-z0-9_-]{12,}|Bearer\s+\S+|__client\s*=|/Users/|/home/|file://|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', re.I)
RAW_KEYS = {'request', 'response', 'reply', 'messages', 'email', 'cookie', 'authorization', 'feedback', 'metadata', 'transcript', 'key_id'}
SECTIONS = {
    'correction': 'mode origin reviewer original_request_id revised_request_id trace_id system_sha256 original_reply_sha256 revised_reply_sha256 saved_rating separate_replacement_field in_internal_holdout exact_training_row_membership',
    'dataset': 'id task_id accepted_examples accepted_sessions rejected_examples full_row_manifest_public',
    'training': 'job_id status error adapter_id version base_model version_created_at',
    'evaluation': 'dataset_id held_out_cases check_kinds semantic_judgements passed length_compliant quality_improvement_established',
    'serving': 'status serving rollout_percent fresh_live_answer_verified console_message',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sanitised(value):
    if isinstance(value, dict):
        require(not RAW_KEYS.intersection(value), 'Raw/private field in public evidence')
        for key, child in value.items():
            require(not FORBIDDEN.search(key), 'Private-looking field name')
            sanitised(child)
    elif isinstance(value, list):
        for child in value:
            sanitised(child)
    elif isinstance(value, str):
        require(not FORBIDDEN.search(value), 'Credential/account/local-path pattern in public evidence')


def validate_mubit(data):
    sanitised(data)
    expected = set(SECTIONS) | {'schema_version', 'evidence_kind', 'observed_on', 'independent_service_attestation', 'sanitisation', 'source_sha256'}
    require(set(data) == expected and data['schema_version'] == 1, 'Unexpected evidence schema')
    for name, fields in SECTIONS.items():
        require(set(data[name]) == set(fields.split()), f'Unexpected {name} fields')
    require(data['independent_service_attestation'] is False, 'Snapshot is not a service-signed attestation')
    c, d, t, e, s = (data[k] for k in ['correction', 'dataset', 'training', 'evaluation', 'serving'])
    require(c['mode'] == 'conversational_followup_then_reviewed_good_rating' and c['origin'] == 'synthetic', 'Correction provenance changed')
    require(c['saved_rating'] == 'up' and c['separate_replacement_field'] is None, 'Do not claim replacement-target submission')
    require(c['exact_training_row_membership'] == 'inferred_not_directly_read', 'Dataset membership must retain its limitation')
    for name in ['system_sha256', 'original_reply_sha256', 'revised_reply_sha256']:
        require(bool(re.fullmatch('[a-f0-9]{64}', c[name])), 'Invalid content fingerprint')
    require(c['original_reply_sha256'] != c['revised_reply_sha256'], 'Correction did not change the response')
    require(t['status'] == 'completed' and t['error'] == '', 'Completed training evidence missing')
    require(e['dataset_id'] == d['id'], 'Evaluation dataset mismatch')
    require(d['accepted_examples'] >= d['accepted_sessions'] > 0 and d['rejected_examples'] >= 0, 'Invalid example counts')
    n = e['held_out_cases']
    require(n > 0 and sum(e['check_kinds'].values()) == n, 'Incomplete check counts')
    for counts in [e['passed'], e['length_compliant']]:
        require(set(counts) == {'adapter', 'base', 'frontier'}, 'Missing comparison arm')
        require(all(type(v) is int and 0 <= v <= n for v in counts.values()), 'Invalid evaluation count')
    require(e['semantic_judgements'] == 0 and e['quality_improvement_established'] is False, 'Do not turn literal checks into quality improvement')
    require(s['status'] == 'rules_only' and s['serving'] is None and s['rollout_percent'] == 0 and s['fresh_live_answer_verified'] is False, 'Serving blocker must remain explicit; review changed evidence before updating')
    require(data['source_sha256'] and all(re.fullmatch('[a-f0-9]{64}', h) for h in data['source_sha256'].values()), 'Invalid source hashes')


def validate_criteria(data):
    sanitised(data)
    require(data['schema_version'] == 1, 'Unknown criteria schema')
    require({c['id'] for c in data['criteria']} == {'mubit', 'usefulness', 'technical_execution', 'demo'}, 'Four criteria required')
    require(len(data['criteria']) == 4 and all(c['weight'] == 0.25 for c in data['criteria']), 'Criteria must be weighted equally')
    for criterion in data['criteria']:
        require(criterion['status'] in {'partial', 'implemented_with_limits', 'prepared_not_rehearsed'}, 'Unsupported scoring claim')
        require(criterion['evidence'] and criterion['limitations'], 'Each criterion needs evidence and limits')
        for link in criterion['evidence']:
            require(not link.startswith('/') and '..' not in Path(link).parts and (ROOT / link).is_file(), f'Missing evidence: {link}')


def check_links():
    for path in [ROOT / 'JUDGING.md', *sorted((ROOT / 'judging').glob('*.md'))]:
        text = path.read_text()
        require(not FORBIDDEN.search(text), f'Private content in {path.name}')
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if target.startswith(('https://', 'http://', '#')):
                continue  # Remote links are references, not a live availability check.
            target = target.split('#')[0]
            resolved = (path.parent / target).resolve()
            require(resolved.is_relative_to(ROOT) and resolved.exists(), f'Broken local link in {path.name}: {target}')


def main():
    validate_mubit(json.loads((ROOT / 'judging/evidence/mubit-run.json').read_text()))
    validate_criteria(json.loads((ROOT / 'judging/evidence/criteria.json').read_text()))
    for path in (ROOT / 'judging/evidence').glob('*.json'):
        sanitised(json.loads(path.read_text()))
    check_links()
    print('Judging summaries, redaction boundaries and local links checked. Remote service truth was not re-queried.')


if __name__ == '__main__':
    main()
