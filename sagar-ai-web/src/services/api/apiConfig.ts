import { resolveApiBaseUrl, type ApiBaseResolution } from "./apiBaseUrl";

/*
 * The frontend's single backend URL, resolved once from Vite's env and
 * the page location (rules in apiBaseUrl.ts). apiClient
 * (sagarApiClient.ts) is created from this - nothing else may build a
 * backend URL.
 */
export const apiBase: ApiBaseResolution = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL as string | undefined,
  typeof window !== "undefined" ? window.location : null,
  import.meta.env.DEV
);

export const API_BASE_URL = apiBase.baseUrl;

/** Dev diagnostics are on in development, or in a build made with
 * VITE_SHOW_DIAGNOSTICS=true. Never in a normal production build. */
export const SHOW_DIAGNOSTICS =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DIAGNOSTICS === "true";

if (SHOW_DIAGNOSTICS && typeof window !== "undefined") {
  console.info(
    `[sagar] Frontend origin: ${window.location.origin}\n` +
      `[sagar] API base URL:    ${API_BASE_URL} (${apiBase.note})`
  );
}
