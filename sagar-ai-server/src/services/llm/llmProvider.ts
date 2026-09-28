import { config } from "../../config";
import { requestChatCompletion as requestOpenRouterCompletion } from "../ai/openRouterClient";
import { requestOllamaCompletion } from "./ollamaProvider";

/**
 * Provider-neutral seam between Sagar's narration/classification callers
 * and whichever LLM is configured.
 *
 * Everything above this file (responseNarrator, intentClassifier, the
 * chat route) only ever sees `requestLlmCompletion` / `isLlmEnabled`, so
 * swapping OpenRouter for a local Ollama server - or running with no LLM
 * at all - never reaches the marine, risk, route or zone logic. Those
 * deterministic services remain the sole source of truth; an LLM only
 * ever rephrases facts they already produced.
 *
 * Like the OpenRouter client it wraps, this never throws: every failure
 * path resolves to `null` so callers fall back to Sagar's deterministic
 * narrator.
 */

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  /** Overrides the provider's configured timeout for this call only.
   * Narration/classification calls ask for 1-2 sentences or one small
   * JSON object, so they set a much tighter bound than the provider
   * default - a slow/local model degrades to the deterministic fallback
   * quickly instead of leaving the user's chat message waiting for the
   * provider's full configured timeout (e.g. 30s). */
  timeoutMs?: number;
}

export interface LlmProvider {
  /** Stable identifier, surfaced on /api/health and the startup log. */
  readonly name: "ollama" | "openrouter";
  /** Model identifier for diagnostics - never sent to the client as an answer. */
  readonly model: string;
  /** Whether this provider is configured enough to be worth calling. */
  isEnabled(): boolean;
  /** Resolves to the final answer text, or `null` on any failure. */
  complete(
    messages: ChatCompletionMessage[],
    options?: LlmCompletionOptions
  ): Promise<string | null>;
}

const ollamaProvider: LlmProvider = {
  name: "ollama",
  model: config.llm.ollama.model,
  isEnabled: () => config.llm.ollama.enabled,
  complete: (messages, options) => requestOllamaCompletion(messages, options),
};

/*
 * Adapter over the pre-existing OpenRouter client rather than a
 * reimplementation - the cloud path keeps its own key handling,
 * timeout and failure logging exactly as before.
 */
const openRouterProvider: LlmProvider = {
  name: "openrouter",
  model: config.ai.model,
  isEnabled: () => config.ai.enabled,
  complete: (messages, options) =>
    requestOpenRouterCompletion(messages, options),
};

export function getLlmProvider(): LlmProvider {
  return config.llm.provider === "ollama"
    ? ollamaProvider
    : openRouterProvider;
}

/**
 * True when an LLM is configured for narration/classification. When
 * false, callers skip the LLM entirely and use Sagar's deterministic
 * responses - the same behaviour as before any provider existed.
 */
export function isLlmEnabled(): boolean {
  return getLlmProvider().isEnabled();
}

// Models trained mainly on code. Their Tamil/Hindi output reads as
// fluent script but often means something else entirely.
const CODE_SPECIALISED_MODEL = /coder|codellama|starcoder|codegemma|codestral|deepseek-code/i;

/**
 * True when the configured LLM may write non-English replies (see
 * config.llm.multilingualNarration). English narration is unaffected.
 */
export function supportsMultilingualNarration(): boolean {
  if (!isLlmEnabled()) return false;

  const mode = config.llm.multilingualNarration;
  if (mode !== "auto") return mode === "on";

  const provider = getLlmProvider();
  return provider.name === "openrouter" || !CODE_SPECIALISED_MODEL.test(provider.model);
}

export async function requestLlmCompletion(
  messages: ChatCompletionMessage[],
  options: LlmCompletionOptions = {}
): Promise<string | null> {
  const provider = getLlmProvider();

  if (!provider.isEnabled()) {
    return null;
  }

  return provider.complete(messages, options);
}

export default requestLlmCompletion;
