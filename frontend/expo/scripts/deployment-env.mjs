import { readFileSync } from 'node:fs';

/** Preview branches share the repository's public development backend unless overridden. */
export function deploymentEnvironment(environment) {
  if (environment.EXPO_PUBLIC_CONVEX_URL?.trim() || environment.VERCEL_ENV !== 'preview') return { ...environment };
  const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const value = example.match(/^EXPO_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]?.trim();
  if (!value) throw new Error('The preview development backend is missing from .env.example.');
  return { ...environment, EXPO_PUBLIC_CONVEX_URL: value };
}
