import assert from 'node:assert/strict';
import { deploymentEnvironment } from './deployment-env.mjs';

const preview = deploymentEnvironment({ VERCEL_ENV: 'preview' });
assert.equal(preview.EXPO_PUBLIC_CONVEX_URL, 'https://original-buzzard-860.eu-west-1.convex.cloud');
assert.equal(deploymentEnvironment({ VERCEL_ENV: 'production' }).EXPO_PUBLIC_CONVEX_URL, undefined);
assert.equal(deploymentEnvironment({}).EXPO_PUBLIC_CONVEX_URL, undefined);
const configured = { VERCEL_ENV: 'preview', EXPO_PUBLIC_CONVEX_URL: 'https://explicit.example' };
assert.deepEqual(deploymentEnvironment(configured), configured);
assert.equal(configured.EXPO_PUBLIC_CONVEX_URL, 'https://explicit.example');
console.log('Deployment environment passed: preview default, explicit override, production fail-closed.');
