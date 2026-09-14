import { config } from "../../config";

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Minimal OpenRouter (OpenAI-compatible) chat completion call.
 *
 * Never throws to the caller: on any failure (missing/placeholder key,
 * network error, timeout, non-2xx response, unparseable body) this
 * resolves to `null` so callers fall back to Sagar's deterministic
 * response. The API key is read only from server-side config and is
 * never logged or echoed back.
 */
export async function requestChatCompletion(
  messages: ChatCompletionMessage[],
  options: CompletionOptions = {}
): Promise<string | null> {
  if (!config.ai.enabled) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.ai.timeoutMs
  );

  try {
    const response = await fetch(
      `${config.ai.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.ai.apiKey}`,
        },
        body: JSON.stringify({
          model: config.ai.model,
          messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 350,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      console.warn(
        `[ai] OpenRouter request failed with status ${response.status}`
      );
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;

    return typeof content === "string" && content.trim()
      ? content.trim()
      : null;
  } catch (error) {
    console.warn(
      "[ai] OpenRouter request failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function isAiEnabled(): boolean {
  return config.ai.enabled;
}

export default requestChatCompletion;
