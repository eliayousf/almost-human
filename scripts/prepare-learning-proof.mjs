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
const trainingBatch = process.argv.length === 3 && process.argv[2] === "--training-batch";
if (process.argv.length > 2 && !trainingBatch) throw new Error("Usage: prepare-learning-proof.mjs [--training-batch]");
const directory = path.join(root, trainingBatch ? "artifacts/learning-training-batch" : "artifacts/learning-proof");
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
if (trainingBatch) {
  scenarios[0] = ["candidate-01", "candidate", "Unexpected collections", "what would a pigeon collect if it had a hobby?"];
  // Independent, authored situations. No player text, prompt lessons or copied
  // target answers. Every returned candidate needs explicit editorial review.
  const extra = [
    ["Tiny luxuries", "what tiny luxury would you refuse to give up?"],
    ["Kitchen debates", "is cereal a soup? defend yourself"],
    ["Unhelpful robots", "what chore would a really lazy robot avoid?"],
    ["Bad museum ideas", "name an exhibit for the world's most boring museum"],
    ["Odd competitions", "what ridiculous competition could you actually win?"],
    ["Rainy holidays", "our imaginary beach holiday has nonstop rain. salvage it"],
    ["Household drama", "the kettle and toaster are arguing. what's it about?"],
    ["Pet complaints", "what would a cat put in its one-star review?"],
    ["Invented sports", "invent a sport for people who hate running"],
    ["Time travel", "you can time travel ten seconds. how do you waste it?"],
    ["Magic with limits", "your magic wand only works on sandwiches. now what?"],
    ["Space snacks", "which snack causes the most chaos in zero gravity?"],
    ["Unwanted awards", "what should the trophy for procrastination look like?"],
    ["Minor rebellions", "describe the smallest possible act of rebellion"],
    ["Pointless gadgets", "would you buy a toaster that gives pep talks?"],
    ["Fictional menus", "what's the worst name for a fancy pasta dish?"],
    ["Board game rules", "add one terrible rule to chess"],
    ["Small disasters", "the last biscuit broke in my tea. say something comforting"],
    ["Cartoon villains", "give a villain a really minor evil plan"],
    ["Absurd bargains", "what's something nobody needs two of?"],
    ["Book titles", "name a detective novel about missing teaspoons"],
    ["Imaginary jobs", "what job would a retired dragon take?"],
    ["Ordinary mysteries", "why does the remote hide when the adverts start?"],
    ["Party tricks", "suggest a party trick that clears the room"],
    ["Wrong forecasts", "give me a weather forecast for inside a fridge"],
    ["Bad motivational advice", "give my houseplant a terrible pep talk"],
    ["Silly arguments", "defend wearing socks with sandals in one sentence"],
    ["Unexpected teams", "which kitchen utensils would make the worst band?"],
    ["Pointless records", "invent a world record nobody should attempt"],
    ["Fake festivals", "what happens at the annual cushion festival?"],
    ["Unlikely heroes", "a spoon saves the world. how?"],
    ["Mild disappointment", "describe a surprise party organised by a printer"],
    ["Ridiculous lessons", "what would they teach at a school for clouds?"],
    ["Tiny adventures", "make walking to the bin sound heroic"],
  ];
  scenarios.push(...extra.map(([topic, text], i) => [`candidate-${String(i + 7).padStart(2,"0")}`, "candidate", topic, text]));
}
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
if (trainingBatch) Object.assign(manifest, {
  mode: "reviewed-training-batch", request_limit: 44,
  design: "40 distinct synthetic candidates plus 4 held-out questions. Review each answer before rating. Existing discovery ledger is preserved. Same production system prompt; no prompt lessons.",
});
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600, flag: "wx" });
console.log(JSON.stringify({ manifest: manifestPath, candidates: cases.filter(c => c.purpose === "candidate").length, held_out_cases: 4,
  system_sha256: manifest.system_sha256, model_calls: 0 }));
