import axios from "axios";
import { useSyncExternalStore } from "react";

/**
 * Real outcomes of real backend requests, shared app-wide. Fed by the
 * apiClient interceptors (sagarApiClient.ts) and by the hooks that fall
 * back to local data, so a fallback can never hide the failure that
 * caused it: the request, its reason and the feature that fell back are
 * all recorded here and logged in development.
 */

export type ApiFailureKind = "network" | "timeout" | "http" | "parse" | "unknown";

export interface ApiRequestOutcome {
  method: string;
  /** Path only - the query string can carry coordinates. */
  path: string;
  ok: boolean;
  status?: number;
  failure?: ApiFailureKind;
  /** Short, non-sensitive reason ("network error - no response"). */
  reason?: string;
  durationMs?: number;
  at: number;
}

export interface FallbackRecord {
  reason: string;
  at: number;
}

export interface ApiDiagnosticsState {
  lastRequest: ApiRequestOutcome | null;
  lastFailure: ApiRequestOutcome | null;
  /** From the latest request that either got a response (true) or got
   * none at all (false). Undefined until one has been made. */
  backendReachable: boolean | undefined;
  /** Features currently serving local/offline data, with the reason. */
  fallbacks: Record<string, FallbackRecord>;
}

/** Thrown when a 2xx response isn't the JSON Sagar returns (e.g. a proxy
 * or captive-portal HTML page) - never rendered as data. */
export class ApiResponseParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiResponseParseError";
  }
}

export interface ApiFailureInfo {
  kind: ApiFailureKind;
  status?: number;
  reason: string;
}

/** Null for a deliberate cancellation, which is not a failure. */
export function classifyApiError(error: unknown): ApiFailureInfo | null {
  if (axios.isCancel(error)) {
    return null;
  }

  if (error instanceof ApiResponseParseError) {
    return { kind: "parse", reason: `unreadable response - ${error.message}` };
  }

  if (axios.isAxiosError(error)) {
    if (error.response) {
      return {
        kind: "http",
        status: error.response.status,
        reason: `HTTP ${error.response.status}`,
      };
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      const timeout = error.config?.timeout;
      return {
        kind: "timeout",
        reason: timeout ? `timed out after ${Math.round(timeout / 1000)} s` : "timed out",
      };
    }

    if (error.code === "ERR_NETWORK") {
      return {
        kind: "network",
        reason:
          "network error - no response (backend not running, wrong address, firewall, CORS rejection or mixed content)",
      };
    }
  }

  return {
    kind: "unknown",
    reason: error instanceof Error ? error.message : "unknown error",
  };
}

/** Developer-facing reason, recorded with a fallback. */
export function describeApiFailure(error: unknown): string {
  return classifyApiError(error)?.reason ?? "request cancelled";
}

/** User-facing reason for an offline notice - plain words, no internals. */
export function summarizeApiFailure(error: unknown): string {
  const info = classifyApiError(error);

  switch (info?.kind) {
    case "network":
      return "no response from the Sagar server";
    case "timeout":
      return "the Sagar server took too long to answer";
    case "http":
      return `the Sagar server returned an error (HTTP ${info.status})`;
    case "parse":
      return "the Sagar server sent an unreadable response";
    default:
      return "the request to the Sagar server failed";
  }
}

let state: ApiDiagnosticsState = {
  lastRequest: null,
  lastFailure: null,
  backendReachable: undefined,
  fallbacks: {},
};

const listeners = new Set<() => void>();

function update(next: Partial<ApiDiagnosticsState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function recordApiOutcome(outcome: ApiRequestOutcome) {
  // A response of any status proves the backend is reachable; only "no
  // response at all" (network error / timeout) says it isn't.
  const reachable =
    outcome.ok || outcome.failure === "http" || outcome.failure === "parse"
      ? true
      : outcome.failure === "network" || outcome.failure === "timeout"
        ? false
        : state.backendReachable;

  update({
    lastRequest: outcome,
    lastFailure: outcome.ok ? state.lastFailure : outcome,
    backendReachable: reachable,
  });

  if (!outcome.ok && import.meta.env.DEV) {
    console.warn(
      `[sagar-api] API request failed: ${outcome.method} ${outcome.path}\n` +
        `  Reason: ${outcome.reason ?? outcome.failure}`
    );
  }
}

/** Explicit reachability report from a caller that knows better. */
export function reportBackendReachable(reachable: boolean) {
  update({ backendReachable: reachable });
}

/** Marks a feature as serving fallback data (reason) or live data (null). */
export function setFallback(feature: string, reason: string | null) {
  const current = state.fallbacks[feature];

  if (reason === null) {
    if (!current) return;
    const rest = { ...state.fallbacks };
    delete rest[feature];
    update({ fallbacks: rest });
    return;
  }

  if (current?.reason === reason) return;

  update({ fallbacks: { ...state.fallbacks, [feature]: { reason, at: Date.now() } } });

  if (import.meta.env.DEV) {
    console.warn(`[sagar-api] Fallback activated for ${feature}: ${reason}`);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getApiDiagnostics(): ApiDiagnosticsState {
  return state;
}

export function useApiDiagnostics(): ApiDiagnosticsState {
  return useSyncExternalStore(subscribe, getApiDiagnostics, getApiDiagnostics);
}
