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
