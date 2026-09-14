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

export const config = {
  port: parsePort(process.env.PORT),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
} as const;

export default config;
