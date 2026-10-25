#!/usr/bin/env python3
"""Run judge-facing checks. Install dependencies with --install on a fresh clone.

The checks run without live service access. Installation may use the npm registry.
Reports describe local verification only; they never mark Mubit serving complete.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_RECEIPT = 'judging/evidence/checks.json'


def source_fingerprint():
    paths = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    entries = []
    for name in sorted(set(paths) - {'', PUBLIC_RECEIPT}):
        path = ROOT / name
        if path.is_file():
            entries.append([name, hashlib.sha256(path.read_bytes()).hexdigest()])
    return hashlib.sha256(json.dumps(entries, separators=(',', ':')).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true', help='Install the locked backend dependencies; uses the npm registry.')
    parser.add_argument('--write-receipt', type=Path, help='Also write a sanitised summary here (maintainer publishing only).')
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    output = ROOT / 'artifacts/judging-checks' / now.strftime('%Y%m%dT%H%M%S%fZ')
    output.mkdir(parents=True)
    # These commands do not load .env files. The explicit inert build address
    # prevents the diagnostic bundler from reading backend/.env.local.
    env = {k: v for k, v in os.environ.items() if not k.startswith(('MUBIT_', 'CONVEX_', 'VITE_', 'EXPO_PUBLIC_')) and k != 'NODE_OPTIONS'}
    env.update(CONVEX_URL='https://judging.invalid', VITE_CONVEX_URL='https://judging.invalid', VITE_STRICT_PAIR='true', EXPO_PUBLIC_CONVEX_URL='https://judging.invalid', EXPO_OFFLINE='1', EXPO_NO_TELEMETRY='1', CI='true', NO_COLOR='1', PYTHONDONTWRITEBYTECODE='1')
    guarded = {**env, 'NODE_OPTIONS': '--require ' + json.dumps(str(ROOT / 'scripts/judging-no-network.cjs'))}
    report = {
        'schema_version': 1, 'checked_at': now.isoformat(), 'status': 'running',
        'source_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(),
        'source_fingerprint_sha256': source_fingerprint(),
        'fingerprint_scope': 'Git-listed and nonignored files, excluding this public checks receipt; file names and content hashes in sorted order.',
        'nix_shell': bool(os.environ.get('IN_NIX_SHELL')),
        'scope': 'Local code, fixtures, builds and sanitised summary consistency. Does not verify current deployment, remote Mubit state, user demand or live demo success.',
        'dependency_install_requested': args.install, 'steps': [],
        'mubit_live_serving_verified': False,
    }
    def step(name, command, process_env=guarded):
        print(f'Checking {name}…', flush=True)
        result = subprocess.run(command, cwd=ROOT, env=process_env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        (output / f'{name}.log').write_text(result.stdout)
        report['steps'].append({'name': name, 'exit_code': result.returncode, 'status': 'passed' if result.returncode == 0 else 'failed'})
        if result.returncode != 0:
            raise RuntimeError(f'{name} failed; inspect its local log in {output.relative_to(ROOT)}')
        return result.stdout
    try:
        node = subprocess.check_output(['node', '--version'], env=env, text=True).strip()
        if not node.startswith('v22.'):
            raise RuntimeError('Use Node 22 from the pinned Nix devShell.')
        report['runtime'] = {'node': node, 'python': sys.version.split()[0]}
        if args.install:
            step('locked_dependencies', ['npm', '--prefix', 'backend', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], env)
            if (ROOT / 'frontend/package-lock.json').exists():
                step('frontend_dependencies', ['npm', '--prefix', 'frontend', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], env)
            if (ROOT / 'frontend/expo/package-lock.json').exists():
                step('expo_dependencies', ['npm', '--prefix', 'frontend/expo', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], env)
        elif not (ROOT / 'backend/node_modules/.package-lock.json').exists():
            raise RuntimeError('Dependencies are missing. Repeat with --install.')
        step('evidence', ['python3', 'scripts/check-judging-evidence.py'])
        step('typescript', ['npm', '--prefix', 'backend', 'run', 'check'])
        vitest_output = output / 'vitest.json'
        step('backend_tests', ['npm', '--prefix', 'backend', 'test', '--', '--maxWorkers=1', '--reporter=json', f'--outputFile={vitest_output}'])
        tests = json.loads(vitest_output.read_text())
        if tests.get('success') is not True or tests.get('numFailedTests') != 0 or tests.get('numTotalTests', 0) <= 0:
            raise RuntimeError('Backend test receipt does not establish a passing suite.')
        report['backend_tests'] = {k: tests[k] for k in ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests']}
        python_output = step('python_tests', ['python3', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_*.py', '-v'])
        count = re.search(r'Ran (\d+) tests?', python_output)
        if not count:
            raise RuntimeError('Python test count missing.')
        report['python_tests'] = {'passed': int(count.group(1))}
        step('diagnostic_builds', ['npm', '--prefix', 'backend', 'run', 'build:playtest'])
        for name in ['app.js', 'index.html', 'react-app.js', 'react.html']:
            if not (ROOT / 'backend/build' / name).stat().st_size:
                raise RuntimeError('A diagnostic build output is empty.')
        fixture_output = step('shared_contract', ['node', '--experimental-strip-types', 'scripts/check-shared-contract.mjs'])
        fixture_count = re.search(r'checked: (\d+) round views', fixture_output)
        if not fixture_count:
            raise RuntimeError('Shared-fixture count missing.')
        report['shared_round_fixtures'] = int(fixture_count.group(1))
        report['diagnostic_bundles'] = 2
        if (ROOT / 'frontend/package.json').exists():
            step('frontend_live_build', ['npm', '--prefix', 'frontend', 'run', 'build'])
            if not (ROOT / 'frontend/dist/index.html').stat().st_size:
                raise RuntimeError('The player frontend build is empty.')
            report['frontend_live_bundles'] = 1
        if (ROOT / 'frontend/expo/package.json').exists():
            step('expo_typecheck', ['npm', '--prefix', 'frontend/expo', 'run', 'typecheck'])
            step('expo_asset_and_state_checks', ['npm', '--prefix', 'frontend/expo', 'test'])
            step('expo_web_build', ['npm', '--prefix', 'frontend/expo', 'run', 'build:web'])
            if not (ROOT / 'frontend/expo/dist/index.html').stat().st_size:
                raise RuntimeError('The Expo web build is empty.')
            report['expo_web_bundles'] = 1
        step('diff_whitespace', ['git', 'diff', '--check'])
        if source_fingerprint() != report['source_fingerprint_sha256']:
            raise RuntimeError('Inputs changed during verification; repeat on a stable tree.')
        report['status'] = 'passed'
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        report['status'] = 'failed'
        # Do not put exception bodies, absolute local paths or upstream logs in
        # the public receipt. Full command logs remain in ignored artifacts.
        report['failure'] = 'Verification did not finish successfully; inspect local step logs.'
        print(str(error), file=sys.stderr)
    finally:
        text = json.dumps(report, indent=2) + '\n'
        (output / 'summary.json').write_text(text)
        if args.write_receipt:
            args.write_receipt.parent.mkdir(parents=True, exist_ok=True)
            temporary = args.write_receipt.with_suffix('.tmp')
            temporary.write_text(text)
            temporary.replace(args.write_receipt)
    print(f"{report['status'].upper()}: local verification. Mubit live serving remains blocked.")
    print(f'Local logs: {output.relative_to(ROOT)}')
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
