#!/usr/bin/env node
// Prepare synthetic cases with the real game prompt. No network/model calls.
import { build } from "../backend/node_modules/esbuild/lib/main.js";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = path.join(root, "artifacts/learning-proof");
const manifestPath = path.join(directory, "manifest.json");
await mkdir(path.join(directory, "runtime"), { recursive: true, mode: 0o700 });
try {
  await access(manifestPath);
  throw new Error("An experiment already exists. Preserve its manifest and receipts; use the Python commands to continue it.");
} catch (error) { if (error.code !== "ENOENT") throw error; }
const bundle = path.join(directory, "runtime/botlogic.mjs");
await build({ entryPoints: [path.join(root, "backend/convex/botlogic.ts")], outfile: bundle,
  bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "silent" });
const { buildBotMessages, BOT_PERSONAS } = await import(pathToFileURL(bundle).href);

// Authored synthetic fixtures, not player conversations. Evaluation cases are
// disjoint and the runner refuses to capture or correct them for training.
const scenarios = [
  ["candidate-01", "candidate", "Useless talents", "what's your most useless talent?"],
  ["candidate-02", "candidate", "Unpopular food opinions", "defend a terrible pizza topping"],
  ["candidate-03", "candidate", "A boring evening", "it's raining and i'm bored. what would you do?"],
  ["candidate-04", "candidate", "Imaginary inventions", "invent something useless that i'd still buy"],
  ["candidate-05", "candidate", "Small victories", "i finally folded my laundry. where's my medal?"],
  ["candidate-06", "candidate", "Odd superpowers", "pick a superpower with a really annoying downside"],
  ["eval-01", "evaluation", "Tiny complaints", "why do socks disappear but never the annoying ones?"],
  ["eval-02", "evaluation", "Bad business ideas", "pitch me the worst cafe idea you've got"],
  ["eval-03", "evaluation", "Unexpected opinions", "which household object would be the worst flatmate?"],
  ["eval-04", "evaluation", "A tiny holiday", "you've got one free hour and no money. what's the plan?"],
];
const cases = scenarios.map(([id, purpose, topic, text]) => ({ id, purpose, origin: "synthetic",
  messages: buildBotMessages({ topic: { id, text: topic }, selfAlias: "Mango",
    persona: BOT_PERSONAS[0], difficulty: "medium", participantAliases: ["Mango", "Pebble"],
    transcript: [{ senderAlias: "Pebble", text }], lessons: { passed: [], caught: [] } }) }));
const hashes = new Set(cases.map(c => createHash("sha256").update(c.messages[0].content).digest("hex")));
if (hashes.size !== 1) throw new Error("The task instructions must stay identical across all cases.");
const { stdout: sourceCommit } = await promisify(execFile)("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
const manifest = { schema: 1, created_at: new Date().toISOString(),
  source_commit: sourceCommit.trim(),
  model: "gpt-6-luna", system_sha256: [...hashes][0], lessons_enabled: false, cases };
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600, flag: "wx" });
console.log(JSON.stringify({ manifest: manifestPath, candidates: 6, held_out_cases: 4,
  system_sha256: manifest.system_sha256, model_calls: 0 }));
