import type { LanguageModelV4, LanguageModelV4GenerateResult } from "@ai-sdk/provider";

declare global {
  // Register the sole application provider with AI SDK v7. This also keeps the
  // Agent's model type independent of the unrelated gateway model catalogue.
  interface RegisteredProviderModels { mubit: "gpt-6-luna" }
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const tokens = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Text-only AI SDK adapter. The destination is fixed; secrets and upstream
 * bodies never enter errors, telemetry, or the public game transcript. */
export function createMubitModel(apiKey: string): LanguageModelV4 {
  return {
    specificationVersion: "v4", provider: "mubit", modelId: "gpt-6-luna", supportedUrls: {},
    async doGenerate(options): Promise<LanguageModelV4GenerateResult> {
      if (!apiKey || options.tools?.length) throw new Error("Mubit chat is unavailable.");
      const messages = options.prompt.map(message => {
        if (message.role === "system") return { role: "system", content: message.content };
        if (message.role === "tool" || message.content.some(part => part.type !== "text")) throw new Error("Mubit chat accepts text only.");
        return { role: message.role, content: message.content.map(part => part.type === "text" ? part.text : "").join("") };
      });
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.abortSignal?.addEventListener("abort", abort, { once: true });
      if (options.abortSignal?.aborted) controller.abort();
      const timeout = setTimeout(abort, 10_000);
      try {
        const response = await fetch("https://api.mubit.ai/openai/v1/chat/completions", {
          method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: "gpt-6-luna", messages, max_completion_tokens: Math.min(options.maxOutputTokens ?? 384, 384), reasoning_effort: "low" }),
          signal: controller.signal, redirect: "error",
        });
        if (!response.ok) throw new Error("Mubit chat is unavailable.");
        const data = record(await response.json());
        const choices = Array.isArray(data.choices) ? data.choices : [];
        const choice = record(choices[0]);
        const content = record(choice.message).content;
        if (typeof content !== "string" || !content.trim() || choice.finish_reason !== "stop") throw new Error("Mubit returned an unusable reply.");
        const usage = record(data.usage);
        const input = tokens(usage.prompt_tokens);
        const output = tokens(usage.completion_tokens);
        const reasoning = tokens(record(usage.completion_tokens_details).reasoning_tokens);
        return {
          content: [{ type: "text", text: content.trim() }], finishReason: { unified: "stop", raw: "stop" }, warnings: [],
          usage: {
            inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: output, text: output === undefined ? undefined : output - (reasoning ?? 0), reasoning },
          },
        };
      } catch {
        // Do not propagate fetch errors, headers, or provider response bodies.
        throw new Error("Mubit chat is unavailable.");
      } finally {
        clearTimeout(timeout);
        options.abortSignal?.removeEventListener("abort", abort);
      }
    },
    async doStream() { throw new Error("Streaming is not enabled for game bots."); },
  };
}
