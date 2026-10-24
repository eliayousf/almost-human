#!/usr/bin/env node
// Server-side capability probe. Only the fixed synthetic conversation is sent.
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'artifacts/mubit-chat-verification');
const gateway = 'https://api.mubit.ai/openai/v1';
const model = 'gpt-6-luna';
// Supply an existing console adapter selector only for an explicit access check.
// This command is not evidence of Almost Human chat training.
const diagnosticAdapter = process.env.MUBIT_DIAGNOSTIC_ADAPTER;
const callLimit = 3;
const instructions =
  'Almost Human integration verification v1. Reply to the next message as a ' +
  'friendly conversational AI in a disclosed human-or-AI guessing game. ' +
  'Keep the reply short and natural. Do not claim to be a real person, invent ' +
  'personal experiences, or ask for identifying information.';
const message = "What's a small way to rescue a boring evening?";
const correctedReply =
  "Put on a terrible film and make overly ambitious snacks. What kind of mood are you in?";

function readKey(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?MUBIT_API_KEY\s*=\s*(.*?)\s*$/);
    if (match) {
      const value = match[1];
      return /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value;
    }
  }
  throw new Error('The supplied environment file has no MUBIT_API_KEY.');
}

async function reserveCall() {
  // Count attempts before sending. A timeout may still be billed upstream.
  const lock = await open(path.join(output, '.call-budget.lock'), 'wx');
  try {
    const filename = path.join(output, 'chat-call-budget.json');
    let budget;
    try {
      budget = JSON.parse(await readFile(filename, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      budget = { limit: callLimit, attempts: 0 };
    }
    if (budget.limit !== callLimit || !Number.isInteger(budget.attempts)) {
      throw new Error('Invalid call budget; review the saved file before continuing.');
    }
    if (budget.attempts >= callLimit) throw new Error('Preflight call limit reached.');
    budget.attempts += 1;
    budget.updated_at = new Date().toISOString();
    await writeFile(filename, JSON.stringify(budget, null, 2) + '\n', { mode: 0o600 });
    return budget.attempts;
  } finally {
    await lock.close();
    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(output, '.call-budget.lock'));
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!['models', 'chat', 'adapter-access'].includes(command)) {
    console.log('Usage: node scripts/mubit-preflight.mjs models|chat|adapter-access [--env-file PATH]');
    console.log('chat and adapter-access each send one synthetic request, with no retry; maximum 3 attempts total.');
    return;
  }
  if (command === 'adapter-access' && !/^adapter:ad_[A-Za-z0-9_]+@v[1-9][0-9]*$/.test(diagnosticAdapter ?? '')) {
    throw new Error('Set MUBIT_DIAGNOSTIC_ADAPTER to an existing console selector: adapter:ADAPTER_ID@vVERSION.');
  }
  let key = process.env.MUBIT_API_KEY;
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--env-file') throw new Error('Invalid arguments.');
    key = readKey(await readFile(path.resolve(args[1]), 'utf8'));
  }
  if (!key?.startsWith('mbt_') || /\s/.test(key)) throw new Error('A valid Mubit key is required.');
  await mkdir(output, { recursive: true, mode: 0o700 });

  const session = `almost-human-preflight-${randomUUID()}`;
  const body = command === 'adapter-access' ? {
    model: diagnosticAdapter,
    message: JSON.stringify({
      case_id: 'almost-human-authentication-probe',
      legal_actions: ['guard'],
      coaching: [],
    }),
  } : command === 'chat' ? {
    model,
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content: message },
    ],
    max_completion_tokens: 384,
    reasoning_effort: 'low',
  } : undefined;
  const attempt = body ? await reserveCall() : null;
  const receipt = {
    at: new Date().toISOString(),
    method: body ? 'POST' : 'GET',
    url: command === 'adapter-access'
      ? 'https://app.mubit.ai/mapi/playground/chat'
      : `${gateway}/${body ? 'chat/completions' : 'models'}`,
    attempt,
    request: body ?? null,
    local_session_id: session,
    session_note: command === 'adapter-access'
      ? 'Console comparison calls are not stored and do not train adapters.'
      : 'No metadata sent: provider rejected it without provider-side storage. Mubit can derive a session from the conversation prefix.',
    adapter_serving_verified: false,
    ...(command === 'adapter-access' ? {
      purpose: 'Test whether the console adapter route accepts an application inference key. Uses a pre-existing unrelated adapter, not an Almost Human model.',
    } : {}),
  };
  const filename = path.join(output, `${command}-${Date.now()}.json`);
  const started = performance.now();
  try {
    const response = await fetch(receipt.url, {
      method: receipt.method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(body ? { 'content-type': 'application/json', 'x-middleware-record': 'full' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60_000),
    });
    receipt.status = response.status;
    receipt.headers = Object.fromEntries([...response.headers]
      .filter(([name]) => name.startsWith('x-middleware-')));
    const raw = await response.text();
    try { receipt.response = JSON.parse(raw); }
    catch { receipt.response = { text: raw.slice(0, 1000) }; }
    if (command === 'chat' && response.ok) {
      receipt.correction_candidate = {
        original_reply: receipt.response.choices?.[0]?.message?.content ?? null,
        corrected_reply: correctedReply,
        submitted_as_training_target: false,
        training_inclusion_verified: false,
        note: 'Synthetic, author-reviewed correction. A local file is not training evidence.',
      };
    }
  } catch (error) {
    // Never serialize request objects, headers, or stack traces containing credentials.
    receipt.error = error.name === 'TimeoutError' ? 'timeout_no_retry' : 'network_error_no_retry';
  }
  receipt.duration_ms = Math.round(performance.now() - started);
  await writeFile(filename, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({
    status: receipt.status ?? null,
    request_id: receipt.headers?.['x-middleware-request-id'] ?? null,
    model: receipt.response?.model ?? null,
    reply: body ? receipt.response?.choices?.[0]?.message?.content ?? receipt.response?.reply ?? null : undefined,
    model_count: !body ? receipt.response?.data?.length ?? null : undefined,
    error: receipt.error ?? receipt.response?.error ?? null,
    adapter_serving_verified: false,
    evidence: filename,
  }, null, 2));
  if (receipt.status !== 200) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message.replace(/mbt_[A-Za-z0-9_-]+/g, '[redacted]'));
  process.exitCode = 1;
});
