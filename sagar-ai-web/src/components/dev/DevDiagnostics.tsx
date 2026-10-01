import { useCallback, useEffect, useState } from "react";

import { API_BASE_URL, apiBase } from "../../services/api/apiConfig";
import {
  describeApiFailure,
  useApiDiagnostics,
  type ApiRequestOutcome,
} from "../../services/api/apiDiagnostics";
import {
  fetchBackendHealth,
  fetchLlmHealth,
  type BackendHealth,
  type LlmHealth,
} from "../../services/api/sagarApiClient";
import {
  getVoiceCapabilities,
  watchMicrophonePermission,
  type MicPermissionState,
} from "../../utils/voiceCapabilities";

import "./DevDiagnostics.css";

/**
 * Development-only connection/voice diagnostics (App.tsx renders it only
 * when SHOW_DIAGNOSTICS is on). Every value is read from a real check or
 * a real request outcome - nothing here is assumed.
 */

type Tone = "ok" | "warn" | "bad" | "muted";

type HealthState =
  | { state: "checking" }
  | { state: "ok"; data: BackendHealth }
  | { state: "failed"; reason: string };

type LlmState = { state: "idle" } | { state: "ok"; data: LlmHealth } | { state: "failed"; reason: string };

let consoleSummaryLogged = false;

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour12: false });
}

function describeOutcome(outcome: ApiRequestOutcome): string {
  const result = outcome.ok
    ? `HTTP ${outcome.status ?? "?"}`
    : (outcome.reason ?? outcome.failure ?? "failed");
  return `${outcome.method} ${outcome.path} · ${result} · ${formatTime(outcome.at)}`;
}

function describeLlm(llm: LlmState): { text: string; tone: Tone } {
  if (llm.state === "idle") return { text: "—", tone: "muted" };
  if (llm.state === "failed") return { text: `check failed: ${llm.reason}`, tone: "bad" };

  const { data } = llm;
  const name = [data.llmProvider, data.model].filter(Boolean).join(" · ");

  switch (data.status) {
    case "ok":
      return { text: `${name} · reachable (${data.latencyMs ?? "?"} ms)`, tone: "ok" };
    case "model_missing":
      return { text: `${name} · running, model not installed`, tone: "bad" };
    case "unreachable":
      return { text: `${name} · NOT reachable (${data.error ?? "error"})`, tone: "bad" };
    case "disabled":
      return { text: "disabled - deterministic replies", tone: "warn" };
    default:
      return { text: `${name} · not probed`, tone: "muted" };
  }
}

function Row({ label, value, tone = "muted", detail }: {
  label: string;
  value: string;
  tone?: Tone;
  detail?: string;
}) {
  return (
    <div className="dev-diag-row">
      <span className="dev-diag-label">{label}</span>
      <span className={`dev-diag-value is-${tone}`}>
        {value}
        {detail && <small>{detail}</small>}
      </span>
    </div>
  );
}

export default function DevDiagnostics() {
  const diagnostics = useApiDiagnostics();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<HealthState>({ state: "checking" });
  const [llm, setLlm] = useState<LlmState>({ state: "idle" });
  const [micPermission, setMicPermission] = useState<MicPermissionState>("unknown");

  const capabilities = getVoiceCapabilities();
  const voiceBlocker = !capabilities.speechRecognition
    ? "browser has no SpeechRecognition"
    : !capabilities.secureContext
      ? "page is not https/localhost"
      : null;

  const runChecks = useCallback(async () => {
    setHealth({ state: "checking" });

    let backendLine: string;
    let llmLine = "—";

    try {
      const data = await fetchBackendHealth();
      setHealth({ state: "ok", data });
      backendLine = `YES (${data.service})`;

      try {
        const llmData = await fetchLlmHealth();
        setLlm({ state: "ok", data: llmData });
        llmLine = describeLlm({ state: "ok", data: llmData }).text;
      } catch (err) {
        setLlm({ state: "failed", reason: describeApiFailure(err) });
        llmLine = `check failed: ${describeApiFailure(err)}`;
      }
    } catch (err) {
      const reason = describeApiFailure(err);
      setHealth({ state: "failed", reason });
      setLlm({ state: "idle" });
      backendLine = `NO - GET /api/health: ${reason}`;
    }

    if (!consoleSummaryLogged) {
      consoleSummaryLogged = true;
      const caps = getVoiceCapabilities();
      console.info(
        `[sagar] Backend reachable: ${backendLine}\n` +
          `[sagar] LLM (via backend): ${llmLine}\n` +
          `[sagar] Voice: ${caps.speechRecognition && caps.secureContext ? "SUPPORTED" : "UNSUPPORTED"}` +
          ` · secure context: ${caps.secureContext ? "YES" : "NO"}` +
          ` · SpeechRecognition: ${caps.speechRecognition ? "YES" : "NO"}` +
          ` · microphone API: ${caps.microphoneApi ? "YES" : "NO"}`
      );
    }
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  useEffect(() => watchMicrophonePermission(setMicPermission), []);

  const fallbackEntries = Object.entries(diagnostics.fallbacks);
  const reachable =
    health.state === "ok" ? true : health.state === "failed" ? false : diagnostics.backendReachable;

  const summaryTone: Tone =
    reachable === false ? "bad" : fallbackEntries.length > 0 ? "warn" : reachable ? "ok" : "muted";

  if (!open) {
    return (
      <button
        type="button"
        className="dev-diag-tab"
        onClick={() => setOpen(true)}
        aria-label="Open developer diagnostics"
      >
        <i className={`is-${summaryTone}`} aria-hidden="true" />
        DEV
      </button>
    );
  }

  const llmView = describeLlm(llm);
  const { lastRequest, lastFailure } = diagnostics;

  return (
    <aside className="dev-diag-panel" aria-label="Developer diagnostics">
      <header>
        <strong>Sagar diagnostics</strong>
        <span>development only</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close diagnostics">
          ×
        </button>
      </header>

      <div className="dev-diag-body">
        <Row label="Frontend" value={window.location.origin} />
        <Row label="Backend" value={API_BASE_URL} detail={apiBase.note} />
        <Row
          label="Backend reachable"
          value={health.state === "checking" ? "CHECKING…" : health.state === "ok" ? "YES" : "NO"}
          tone={health.state === "checking" ? "muted" : health.state === "ok" ? "ok" : "bad"}
          detail={health.state === "failed" ? `GET /api/health: ${health.reason}` : undefined}
        />
        <Row label="LLM via backend" value={llmView.text} tone={llmView.tone} />
        <Row
          label="API request"
          value={lastRequest ? (lastRequest.ok ? "SUCCESS" : "FAILED") : "none yet"}
          tone={lastRequest ? (lastRequest.ok ? "ok" : "bad") : "muted"}
          detail={lastRequest ? describeOutcome(lastRequest) : undefined}
        />
        {lastFailure && lastFailure !== lastRequest && (
          <Row label="Last failure" value={describeOutcome(lastFailure)} tone="bad" />
        )}
        <Row
          label="Fallback activated"
          value={fallbackEntries.length > 0 ? `YES (${fallbackEntries.length})` : "NO"}
          tone={fallbackEntries.length > 0 ? "warn" : "ok"}
          detail={
            fallbackEntries.length > 0
              ? fallbackEntries.map(([feature, record]) => `${feature}: ${record.reason}`).join("\n")
              : undefined
          }
        />
        <Row
          label="Voice"
          value={voiceBlocker ? "UNSUPPORTED" : "SUPPORTED"}
          tone={voiceBlocker ? "bad" : "ok"}
          detail={voiceBlocker ?? undefined}
        />
        <Row
          label="Secure context"
          value={capabilities.secureContext ? "YES" : "NO"}
          tone={capabilities.secureContext ? "ok" : "bad"}
        />
        <Row
          label="SpeechRecognition"
          value={capabilities.speechRecognition ? "YES" : "NO"}
          tone={capabilities.speechRecognition ? "ok" : "bad"}
        />
        <Row
          label="Microphone API"
          value={capabilities.microphoneApi ? "YES" : "NO"}
          tone={capabilities.microphoneApi ? "ok" : "warn"}
        />
        <Row
          label="Mic permission"
          value={micPermission.toUpperCase()}
          tone={micPermission === "granted" ? "ok" : micPermission === "denied" ? "bad" : "muted"}
          detail={
            !capabilities.secureContext && micPermission === "denied"
              ? "browsers always deny the mic on http pages - not a user choice"
              : undefined
          }
        />
      </div>

      <footer>
        <button type="button" onClick={() => void runChecks()}>
          Re-check
        </button>
        <a href={`${API_BASE_URL}/api/health`} target="_blank" rel="noreferrer">
          Open /api/health
        </a>
      </footer>
    </aside>
  );
}
