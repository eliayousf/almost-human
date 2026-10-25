import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deploymentEnvironment } from './deployment-env.mjs';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = deploymentEnvironment(process.env);
for (const script of ['typecheck', 'test', 'build:web']) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
