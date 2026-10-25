import type { LanguageModelV4, LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { MUBIT_TIMEOUT_MS } from "./botTiming";

class MubitError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); }
}

export function isTransientMubitError(error: unknown): boolean {
  return error instanceof MubitError && error.retryable;
}

declare global {
  // Register the sole application provider with AI SDK v7. This also keeps the
  // Agent's model type independent of the unrelated gateway model catalogue.
  interface RegisteredProviderModels { mubit: "gpt-6-luna" }
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const tokens = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Text-only AI SDK adapter. The destination is fixed; secrets and upstream
 * bodies never enter errors, telemetry, or the public game transcript.
 * `onRequestId` receives Mubit's call ID (mreq_...) for each usable reply, so
 * the round's verdict can later be sent to Mubit as a rating for that call. */
export function createMubitModel(apiKey: string, onRequestId?: (requestId: string) => void, recording: { mode: "full" | "metadata"; sessionId: string } = { mode: "metadata", sessionId: "unassigned" }): LanguageModelV4 {
  return {
    specificationVersion: "v4", provider: "mubit", modelId: "gpt-6-luna", supportedUrls: {},
    async doGenerate(options): Promise<LanguageModelV4GenerateResult> {
      if (!apiKey || options.tools?.length) throw new Error("Mubit chat is unavailable.");
      const messages = options.prompt.map(message => {
        if (message.role === "system") return { role: "system", content: message.content };
        if (message.role === "tool" || message.content.some(part => part.type !== "text")) throw new Error("Mubit chat accepts text only.");
        return { role: message.role, content: message.content.map(part => part.type === "text" ? part.text : "").join("") };
      });
      // Mubit also groups sessions by the first user message. Keep that message
      // stable per round: the provider rejects metadata unless store is enabled,
      // and grouping must not require enabling additional provider storage.
      const firstUser = messages.findIndex(message => message.role === "user");
      if (firstUser >= 0 && recording.sessionId !== "unassigned") {
        messages.splice(firstUser, 0, { role: "user", content: `Game conversation ID: ${recording.sessionId}` });
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.abortSignal?.addEventListener("abort", abort, { once: true });
      if (options.abortSignal?.aborted) controller.abort();
      let timedOut = false;
      let receivedResponse = false;
      let readingBody = false;
      const timeout = setTimeout(() => { timedOut = true; abort(); }, MUBIT_TIMEOUT_MS);
      try {
        const response = await fetch("https://api.mubit.ai/openai/v1/chat/completions", {
          method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-middleware-record": recording.mode },
          body: JSON.stringify({ model: "gpt-6-luna", messages, max_completion_tokens: Math.min(options.maxOutputTokens ?? 384, 384), reasoning_effort: "low" }),
          signal: controller.signal, redirect: "error",
        });
        receivedResponse = true;
        if (!response.ok) {
          // Rate limiting is the sole retryable 4xx response.
          const retryable = response.status === 429 || (response.status >= 500 && response.status < 600);
          throw new MubitError(`Mubit chat is unavailable (upstream status ${response.status}).`, retryable);
        }
        readingBody = true;
        const payload: unknown = await response.json();
        readingBody = false;
        const data = record(payload);
        const choices = Array.isArray(data.choices) ? data.choices : [];
        const choice = record(choices[0]);
        const content = record(choice.message).content;
        if (typeof content !== "string" || !content.trim() || choice.finish_reason !== "stop") throw new Error("Mubit returned an unusable reply.");
        const requestId = response.headers.get("x-middleware-request-id");
        if (requestId && /^mreq_[A-Za-z0-9_-]{1,64}$/.test(requestId)) onRequestId?.(requestId);
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
      } catch (error) {
        // Do not propagate fetch errors, headers, or provider response bodies.
        // This trusted error contains only our text and the numeric HTTP status.
        if (error instanceof MubitError) throw error;
        // Only transport failures and our timeout qualify. Malformed or unusable
        // successful responses and caller cancellations are not retryable.
        const transportFailure = !receivedResponse || (readingBody && error instanceof TypeError);
        throw new MubitError("Mubit chat is unavailable.", !options.abortSignal?.aborted && (transportFailure || timedOut));
      } finally {
        clearTimeout(timeout);
        options.abortSignal?.removeEventListener("abort", abort);
      }
    },
    async doStream() { throw new Error("Streaming is not enabled for game bots."); },
  };
}
