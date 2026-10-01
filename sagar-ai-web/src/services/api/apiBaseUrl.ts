/**
 * The rules for where Sagar's backend lives. Pure - no Vite env, no
 * window - so they can be tested directly (scripts/api-config-test.ts);
 * apiConfig.ts applies them once at startup.
 *
 * Production: VITE_API_BASE_URL is required and used as-is.
 *
 * Development (VITE_API_BASE_URL normally left unset):
 *   - http page  -> same host as the page, port 4000. Desktop at
 *     localhost:5173 gets localhost:4000; a phone at 192.168.1.34:5173
 *     gets 192.168.1.34:4000.
 *   - https page -> the page's own origin, which the Vite dev server
 *     proxies to the backend (vite.config.js). An http:// backend would be
 *     blocked as mixed content on an https page, so the proxy is the only
 *     secure route without also giving the backend a certificate.
 *   - VITE_API_BASE_URL pointing at localhost/127.0.0.1 while the page is
 *     open on another device: "localhost" there is the phone itself, so
 *     the dev machine's address (the page's host) is used instead.
 */

export const DEV_API_PORT = 4000;

export type ApiBaseSource =
  | "env"
  | "env-loopback-rewritten"
  | "page-host"
  | "dev-proxy"
  | "default";

export interface ApiBaseResolution {
  baseUrl: string;
  source: ApiBaseSource;
  /** Why this URL was chosen - shown in dev logs and diagnostics. */
  note: string;
}

export interface PageLocation {
  protocol: string;
  hostname: string;
  origin: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function resolveApiBaseUrl(
  configured: string | undefined,
  page: PageLocation | null,
  isDev: boolean
): ApiBaseResolution {
  const explicit = configured?.trim().replace(/\/+$/, "") || undefined;

  if (!isDev) {
    if (!explicit) {
      /*
       * A production build must never silently talk to localhost:4000 -
       * only reachable from the machine that built the bundle, never
       * from a real user's browser - so a missing config fails loudly.
       */
      throw new Error(
        "Sagar AI configuration error: VITE_API_BASE_URL is not set for this production build. " +
          "Refusing to fall back to http://localhost:4000, which is not reachable from a deployed app. " +
          "Set VITE_API_BASE_URL to the deployed backend's URL and rebuild."
      );
    }
    return { baseUrl: explicit, source: "env", note: "VITE_API_BASE_URL (production build)" };
  }

  if (!page) {
    return explicit
      ? { baseUrl: explicit, source: "env", note: "VITE_API_BASE_URL" }
      : { baseUrl: `http://localhost:${DEV_API_PORT}`, source: "default", note: "no page location available" };
  }

  const explicitUrl = explicit ? parseUrl(explicit) : null;

  if (page.protocol === "https:") {
    if (explicitUrl?.protocol === "https:") {
      return { baseUrl: explicit!, source: "env", note: "VITE_API_BASE_URL (https)" };
    }
    return {
      baseUrl: page.origin,
      source: "dev-proxy",
      note: "page is https, so /api goes through the Vite dev proxy (an http:// backend would be blocked as mixed content)",
    };
  }

  if (explicitUrl) {
    if (isLoopbackHost(explicitUrl.hostname) && !isLoopbackHost(page.hostname)) {
      explicitUrl.hostname = page.hostname;
      return {
        baseUrl: explicitUrl.href.replace(/\/+$/, ""),
        source: "env-loopback-rewritten",
        note: `VITE_API_BASE_URL is ${explicit}, but "localhost" on this device is the device itself - using the dev machine's address instead`,
      };
    }
    return { baseUrl: explicit!, source: "env", note: "VITE_API_BASE_URL" };
  }

  return {
    baseUrl: `${page.protocol}//${page.hostname}:${DEV_API_PORT}`,
    source: "page-host",
    note: `same host as this page, port ${DEV_API_PORT}`,
  };
}
