#!/usr/bin/env python3
"""Export an allowlisted, content-free summary of existing local Mubit receipts.

Reads no credentials, makes no service calls, and exports no request/reply text.
The output is a maintainer-collected snapshot, not a service-signed attestation.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    'receipts/candidate-01.json', 'receipts/candidate-01-revised.json',
    'service-traces/candidate-01-revised.json', 'verified-service-ratings.json',
    'task-training-started.json', 'jobs-latest.json', 'trained-adapter.json',
    'evaluation-v1.json', 'evaluation-v1-results.json',
]


def project_evidence(directory):
    data = {name: json.loads((directory / name).read_text()) for name in SOURCES}
    original = data[SOURCES[0]]
    revised = data[SOURCES[1]]
    trace = data[SOURCES[2]]
    ratings = data[SOURCES[3]]
    lane = data[SOURCES[4]]['lane']
    training = lane['first_train']
    job = next(j for j in data[SOURCES[5]]['jobs'] if j['job_id'] == training['job_id'])
    adapter = data[SOURCES[6]]
    evaluation = data[SOURCES[7]]
    results = data[SOURCES[8]]
    version = next(v for v in adapter['versions'] if v['version'] == evaluation['version'])
    def require(condition, message):
        if not condition:
            raise ValueError(message)
    require(job['adapter_id'] == adapter['adapter_id'] == training['adapter_id'] == evaluation['adapter_id'] == results['adapter_id'], 'Adapter lineage mismatch')
    require(evaluation['dataset_id'] == training['dataset_id'] and version['job_id'] == job['job_id'], 'Dataset/job lineage mismatch')
    require(trace['routing']['relay']['request_id'] == revised['mubit_request_id'], 'Correction request mismatch')
    require(trace['request']['messages'] == revised['request']['messages'], 'Correction context mismatch')
    require(trace['response']['choices'][0]['message']['content'] == revised['reply'], 'Corrected response mismatch')
    require(revised['original_reply_sha256'] == original['reply_sha256'], 'Original response mismatch')
    require(hashlib.sha256(trace['request']['messages'][0]['content'].encode()).hexdigest() == revised['system_sha256'], 'Prompt fingerprint mismatch')
    require(trace['feedback'][-1]['rating'] == 'up' and trace['trainable'], 'Correction is not approved/trainable')
    require(trace['feedback'][-1]['correction'] is None, 'Replacement field is no longer null; review rather than export its content')
    require(any(r['trace_id'] == trace['trace_id'] and r['rating'] == 'up' for r in ratings), 'Correction absent from rating verification')
    positive = [r for r in ratings if r['rating'] == 'up']
    require(len(positive) == lane['counts']['rated_up'] == training['rated_up'], 'Accepted example count mismatch')
    require(len(results['results']) == results['total'], 'Incomplete evaluation results')
    require(job['status'] == 'completed' and not job['error'], 'Training not completed')
    require(version['serving'] is None and version['rollout_percent'] == 0, 'Serving state changed; review the blocker before exporting')
    format_counts = {}
    for arm in ['adapter', 'base', 'frontier']:
        format_counts[arm] = sum(3 <= len(r[arm]['reply'].split()) <= 12 and len(r[arm]['reply'].strip()) <= 80 for r in results['results'])
    return {
        'schema_version': 1,
        'evidence_kind': 'maintainer_observed_service_snapshot',
        'observed_on': '2026-10-25',
        'independent_service_attestation': False,
        'sanitisation': 'Allowlisted identifiers, counts, states and content hashes only; no account identity, cookies, keys, prompts, replies, transcripts or raw service records.',
        'correction': {
            'mode': 'conversational_followup_then_reviewed_good_rating',
            'origin': 'synthetic', 'reviewer': 'assistant_for_project_owner',
            'original_request_id': original['mubit_request_id'],
            'revised_request_id': revised['mubit_request_id'], 'trace_id': trace['trace_id'],
            'system_sha256': revised['system_sha256'],
            'original_reply_sha256': original['reply_sha256'],
            'revised_reply_sha256': revised['reply_sha256'],
            'saved_rating': trace['feedback'][-1]['rating'],
            'separate_replacement_field': trace['feedback'][-1]['correction'],
            'in_internal_holdout': any(r['check_id'] == trace['trace_id'] for r in results['results']),
            'exact_training_row_membership': 'inferred_not_directly_read',
        },
        'dataset': {'id': training['dataset_id'], 'task_id': lane['id'],
                    'accepted_examples': len(positive), 'accepted_sessions': len({r['session'] for r in positive}),
                    'rejected_examples': sum(r['rating'] == 'down' for r in ratings),
                    'full_row_manifest_public': False},
        'training': {'job_id': job['job_id'], 'status': job['status'], 'error': job['error'],
                     'adapter_id': adapter['adapter_id'], 'version': version['version'],
                     'base_model': version['base_model'], 'version_created_at': version['created_at']},
        'evaluation': {'dataset_id': evaluation['dataset_id'], 'held_out_cases': results['total'],
                       'check_kinds': evaluation['checks']['by_kind'],
                       'semantic_judgements': evaluation['arms']['adapter']['judged'],
                       'passed': {a: evaluation['arms'][a]['passed'] for a in ['adapter', 'base', 'frontier']},
                       'length_compliant': format_counts, 'quality_improvement_established': False},
        'serving': {'status': version['status'], 'serving': version['serving'],
                    'rollout_percent': version['rollout_percent'], 'fresh_live_answer_verified': False,
                    'console_message': 'Not in Try models: prompt only'},
        'source_sha256': {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in SOURCES},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'artifacts/learning-proof')
    parser.add_argument('--output', type=Path, default=ROOT / 'judging/evidence/mubit-run.json')
    args = parser.parse_args()
    result = project_evidence(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print('Exported content-free Mubit summary; raw records remain private.')


if __name__ == '__main__':
    main()
