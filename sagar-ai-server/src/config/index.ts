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

const openRouterApiKey = process.env.OPENROUTER_API_KEY;

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
} as const;

export default config;
