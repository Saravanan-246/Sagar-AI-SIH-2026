// Checks for the backend URL rules (desktop, phone on the LAN, https).
// Usage (from sagar-ai-web): npm run test:api-config

import { resolveApiBaseUrl } from "../src/services/api/apiBaseUrl";

let passCount = 0;
let failCount = 0;

function ok(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passCount += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failCount += 1;
    console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`);
  }
}

const page = (url: string) => {
  const parsed = new URL(url);
  return { protocol: parsed.protocol, hostname: parsed.hostname, origin: parsed.origin };
};

const desktop = page("http://localhost:5173/");
const phone = page("http://192.168.1.34:5173/chat");
const phoneHttps = page("https://192.168.1.34:5173/");

console.log("\n[development, VITE_API_BASE_URL unset]");
{
  const r = resolveApiBaseUrl(undefined, desktop, true);
  ok("desktop -> localhost:4000", r.baseUrl === "http://localhost:4000", r.baseUrl);
}
{
  const r = resolveApiBaseUrl(undefined, phone, true);
  ok("phone -> PC LAN IP :4000, never localhost", r.baseUrl === "http://192.168.1.34:4000", r.baseUrl);
}
{
  const r = resolveApiBaseUrl(undefined, phoneHttps, true);
  ok("https page -> same-origin dev proxy (no mixed content)",
    r.baseUrl === "https://192.168.1.34:5173" && r.source === "dev-proxy", r.baseUrl);
}

console.log("\n[development, VITE_API_BASE_URL=http://localhost:4000 (the old .env)]");
{
  const r = resolveApiBaseUrl("http://localhost:4000", desktop, true);
  ok("desktop keeps localhost:4000", r.baseUrl === "http://localhost:4000", r.baseUrl);
}
{
  const r = resolveApiBaseUrl("http://localhost:4000", phone, true);
  ok("phone rewritten to the PC's address",
    r.baseUrl === "http://192.168.1.34:4000" && r.source === "env-loopback-rewritten", r.baseUrl);
}
{
  const r = resolveApiBaseUrl("http://127.0.0.1:4000/", phone, true);
  ok("127.0.0.1 with trailing slash also rewritten", r.baseUrl === "http://192.168.1.34:4000", r.baseUrl);
}

console.log("\n[development, explicit LAN URL]");
{
  const r = resolveApiBaseUrl("http://192.168.1.34:4000", desktop, true);
  ok("explicit LAN URL used as-is on desktop", r.baseUrl === "http://192.168.1.34:4000", r.baseUrl);
}
{
  const r = resolveApiBaseUrl("http://192.168.1.34:4000", phoneHttps, true);
  ok("explicit http URL on an https page -> proxy instead", r.source === "dev-proxy", r.baseUrl);
}
{
  const r = resolveApiBaseUrl("https://api.example.com/sagar", phoneHttps, true);
  ok("explicit https URL kept, path included", r.baseUrl === "https://api.example.com/sagar", r.baseUrl);
}

console.log("\n[production]");
{
  const r = resolveApiBaseUrl("https://api.example.com/", page("https://sagar.example.com/"), false);
  ok("configured URL used, trailing slash trimmed", r.baseUrl === "https://api.example.com", r.baseUrl);
}
{
  let threw = false;
  try {
    resolveApiBaseUrl(undefined, page("https://sagar.example.com/"), false);
  } catch {
    threw = true;
  }
  ok("missing VITE_API_BASE_URL fails loudly", threw);
}
{
  const r = resolveApiBaseUrl("http://localhost:4000", page("https://sagar.example.com/"), false);
  ok("production never rewrites a configured URL", r.baseUrl === "http://localhost:4000", r.baseUrl);
}

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount > 0 ? 1 : 0);
