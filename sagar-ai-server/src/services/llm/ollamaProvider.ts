import { config } from "../../config";

import type {
  ChatCompletionMessage,
  LlmCompletionOptions,
} from "./llmProvider";

/**
 * Local Ollama chat completion.
 *
 * Requires no internet access and no API key - the server is expected to
 * already be running on `OLLAMA_BASE_URL`. Never throws to the caller:
 * on any failure (server down, timeout, non-2xx, unparseable body, empty
 * or reasoning-only output) this resolves to `null` so the caller falls
 * back to Sagar's deterministic narrator.
 *
 * Uses Ollama's native /api/chat rather than its OpenAI-compatible
 * /v1/chat/completions endpoint for one specific reason: thinking-capable
 * models (gemma4 among them) must be told not to reason, and only the
 * native endpoint honours that via `think: false`. On the compatible
 * endpoint the same model spends its whole token budget on hidden
 * reasoning and returns an EMPTY answer, which would make every chat
 * reply silently fall back to the deterministic template. The request and
 * response handled here are otherwise equivalent.
 */

interface OllamaChatResponse {
  message?: {
    content?: string;
    /*
     * Chain-of-thought, when a model emits it despite `think: false`.
     * Deliberately never read: only `content` is ever surfaced to a user.
     */
    thinking?: string;
  };
  done_reason?: string;
  error?: string;
}

/*
 * A thinking-capable model can spend its entire budget on reasoning
 * before emitting a single visible token. Narration and classification
 * both ask for small budgets, so this floor keeps an otherwise-valid
 * answer from being truncated mid-sentence - which matters most for
 * Tamil/Hindi, where a sentence costs far more tokens. Local tokens are
 * free, and the system prompts (not this cap) are what hold answers to
 * 1-2 sentences.
 */
const MIN_MAX_TOKENS = 256;

const PAIRED_REASONING_BLOCK =
  /<(think|thinking|reasoning|reflection|scratchpad)>[\s\S]*?<\/\1>/gi;

const UNPAIRED_REASONING_CLOSE =
  /<\/(?:think|thinking|reasoning|reflection|scratchpad)>/i;

const UNPAIRED_REASONING_OPEN =
  /<(?:think|thinking|reasoning|reflection|scratchpad)>/i;

const LEADING_ANSWER_LABEL =
  /^(?:\*{0,2}(?:final\s+)?(?:answer|response|reply|output)\*{0,2}\s*[:\-]\s*)/i;

const CODE_FENCE = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/;

/**
 * Removes any chain-of-thought the model leaked into `content`, so only
 * the final answer can ever reach a user. Returns `null` when nothing
 * but reasoning is left, which the caller treats as a failed call.
 */
export function stripReasoning(raw: string): string | null {
  let text = raw.replace(PAIRED_REASONING_BLOCK, "");

  // Reasoning emitted before a stray closing tag: keep only what
  // follows the last one.
  if (UNPAIRED_REASONING_CLOSE.test(text)) {
    const parts = text.split(UNPAIRED_REASONING_CLOSE);
    text = parts[parts.length - 1];
  }

  // An opening tag that never closed means the response was cut off
  // mid-thought - everything from it onward is reasoning.
  const openMatch = text.match(UNPAIRED_REASONING_OPEN);

  if (openMatch?.index !== undefined) {
    text = text.slice(0, openMatch.index);
  }

  text = text.trim();

  const fenced = text.match(CODE_FENCE);

  if (fenced) {
    text = fenced[1].trim();
  }

  text = text.replace(LEADING_ANSWER_LABEL, "").trim();

  return text.length > 0 ? text : null;
}

export async function requestOllamaCompletion(
  messages: ChatCompletionMessage[],
  options: LlmCompletionOptions = {}
): Promise<string | null> {
  const { baseUrl, model, timeoutMs, enabled } = config.llm.ollama;

  if (!enabled) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        // Suppresses chain-of-thought generation entirely on
        // thinking-capable models; ignored by models without it. The
        // output is defensively stripped below either way.
        think: false,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: Math.max(options.maxTokens ?? 350, MIN_MAX_TOKENS),
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(
        `[llm] Ollama request failed with status ${response.status}`
      );
      return null;
    }

    const data = (await response.json()) as OllamaChatResponse;

    if (data.error) {
      console.warn(`[llm] Ollama returned an error: ${data.error}`);
      return null;
    }

    const content = data.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      console.warn(
        `[llm] Ollama returned no answer text (done_reason: ${
          data.done_reason ?? "unknown"
        }) - falling back to the deterministic response.`
      );
      return null;
    }

    const answer = stripReasoning(content);

    if (!answer) {
      console.warn(
        "[llm] Ollama returned reasoning only - falling back to the deterministic response."
      );
    }

    return answer;
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");

    console.warn(
      "[llm] Ollama request failed:",
      aborted
        ? `timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : "unknown error"
    );

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export default requestOllamaCompletion;
