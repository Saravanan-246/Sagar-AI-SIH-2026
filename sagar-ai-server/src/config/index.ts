const DEFAULT_PORT = 4000;

function parsePort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

function parseOrigins(value: string | undefined): string[] {
  if (!value) {
    return [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isConfiguredKey(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Guards against the checked-in .env.example placeholder being used as-is.
  if (/^(YOUR_KEY_HERE|CHANGE_ME|REPLACE_ME)$/i.test(trimmed)) return false;
  return true;
}

function parseTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Which LLM narrates Sagar's already-computed answers. Only ever
 * affects the wording layer - every number, route, zone and alert
 * still comes from the deterministic services, and an unset/unknown
 * value simply leaves the original OpenRouter behaviour in place.
 */
type LlmProviderName = "ollama" | "openrouter";

function parseLlmProvider(value: string | undefined): LlmProviderName {
  const normalized = value?.trim().toLowerCase();
  return normalized === "ollama" ? "ollama" : "openrouter";
}

const openRouterApiKey = process.env.OPENROUTER_API_KEY;

// Ollama runs locally and needs no key, so it is "configured" as soon
// as it is selected - reachability is a per-request concern that falls
// back to the deterministic narrator, not a startup gate.
const llmProvider = parseLlmProvider(process.env.LLM_PROVIDER);

export const config = {
  port: parsePort(process.env.PORT),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),

  ai: {
    provider: "openrouter" as const,
    apiKey: openRouterApiKey,
    baseUrl:
      process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    model: process.env.OPENROUTER_MODEL ?? "openai/gpt-chat-latest",
    enabled: isConfiguredKey(openRouterApiKey),
    timeoutMs: 9000,
  },

  llm: {
    provider: llmProvider,

    ollama: {
      baseUrl: (
        process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"
      ).replace(/\/+$/, ""),
      model: process.env.OLLAMA_MODEL ?? "gemma4:latest",
      // Local generation is slower than a hosted API; the 9s cloud
      // timeout would abort valid answers on first (cold) load.
      timeoutMs: parseTimeout(process.env.OLLAMA_TIMEOUT_MS, 30000),
      enabled: llmProvider === "ollama",
    },
  },
} as const;

export default config;
