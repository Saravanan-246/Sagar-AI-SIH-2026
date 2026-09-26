import { GitBranch, MoreVertical, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import {
  commitDecisionRemote,
  deleteDecisionRemote,
  fetchDecisionState,
  fetchRoutes,
  renameDecisionRemote,
  resetDecisionsRemote,
  resolveDecisionRepair,
  runDecisionCycle,
  type DecisionCellChange,
  type DecisionCycleReport,
  type DecisionInvalidation,
  type DecisionState,
  type MarineDecision,
} from "../services/api/sagarApiClient";
import type { RoutePlan } from "../types/route";

import "./Decisions.css";

function errorMessage(error: unknown): string {
  const response = (error as { response?: { data?: { message?: string } } })?.response;
  return response?.data?.message ?? (error instanceof Error ? error.message : "Request failed.");
}

const FIELD_LABEL = { waveHeightM: "Wave height", windSpeedKnots: "Wind" } as const;
const FIELD_UNIT = { waveHeightM: "m", windSpeedKnots: "kn" } as const;
const CONSTRAINT_LABEL = {
  "max-wave-height": "Wave height too high",
  "max-wind": "Wind too strong",
  "data-available": "No data for this area",
} as const;

const fmt = (value: number | undefined, unit: string) =>
  typeof value === "number" ? `${value} ${unit}` : "n/a";

const segmentsText = (segments: number[]) =>
  segments.map((s) => s + 1).join(", ");

const formatTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

function SourceBadge({ source }: { source: "live-model" | "replay" }) {
  return source === "replay" ? (
    <Badge tone="warning" size="sm">Scenario (not live)</Badge>
  ) : (
    <Badge tone="success" size="sm">Live forecast</Badge>
  );
}

function ChangeRows({ changes }: { changes: DecisionCellChange[] }) {
  return (
    <>
      {changes.map((c) => (
        <tr key={`${c.cellId}-${c.field}`}>
          <td>{c.cellId}</td>
          <td>{FIELD_LABEL[c.field]}</td>
          <td>{fmt(c.previousValue, FIELD_UNIT[c.field])}</td>
          <td>{fmt(c.newValue, FIELD_UNIT[c.field])}</td>
        </tr>
      ))}
    </>
  );
}

function CycleReport({ report }: { report: DecisionCycleReport }) {
  return (
    <section className="dec-panel">
      <div className="dec-panel-head">
        <h2>Latest conditions update · {report.cycleId}</h2>
        <SourceBadge source={report.source} />
      </div>
      <p className="dec-muted">
        {report.label} · {formatTime(report.at)} · {report.changedCells.length} wave/wind reading(s) changed
      </p>

      <ul className="dec-outcomes">
        {report.outcomes.length === 0 && <li className="dec-muted">No saved routes to check.</li>}
        {report.outcomes.map((o) => (
          <li key={o.decisionId} className={`dec-outcome dec-outcome-${o.result}`}>
            <span className="dec-outcome-tag">
              {o.result === "skipped"
                ? "No action needed"
                : o.result === "revalidated"
                  ? "Checked · still safe · no alert"
                  : "ROUTE NO LONGER SAFE"}
            </span>
            <span className="dec-outcome-name">
              {o.name} V{o.version}
            </span>
            <span className="dec-muted">
              {o.result === "skipped"
                ? `Conditions on this route did not change, so it was not re-checked. (${o.reason})`
                : o.result === "revalidated"
                  ? `${o.changedDependencies?.length ?? 0} reading(s) on this route changed, but all stay within your limits.`
                  : `${o.changedDependencies?.length ?? 0} reading(s) on this route changed and crossed your limits.`}
            </span>
          </li>
        ))}
      </ul>

      {report.changedCells.length > 0 && (
        <details className="dec-details">
          <summary>Every wave/wind reading that changed in this update</summary>
          <table className="dec-table">
            <thead>
              <tr><th>Marine area (lat, lon)</th><th>Condition</th><th>Before</th><th>Now</th></tr>
            </thead>
            <tbody><ChangeRows changes={report.changedCells} /></tbody>
          </table>
        </details>
      )}
    </section>
  );
}

function InvalidationDetail({ inv }: { inv: DecisionInvalidation }) {
  return (
    <table className="dec-table">
      <thead>
        <tr>
          <th>Safety limit crossed</th><th>Marine area (lat, lon)</th><th>Before</th><th>Now</th><th>Your limit</th><th>Route legs</th>
        </tr>
      </thead>
      <tbody>
        {inv.violations.map((v) => (
          <tr key={`${v.cellId}-${v.constraint}`}>
            <td>{CONSTRAINT_LABEL[v.constraint]}</td>
            <td>{v.cellId}</td>
            <td>{fmt(v.previousValue, FIELD_UNIT[v.field])}</td>
            <td className="dec-bad">{fmt(v.value, FIELD_UNIT[v.field])}</td>
            <td>{fmt(v.limit, FIELD_UNIT[v.field])}</td>
            <td>{segmentsText(v.segments)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const STATE_LABEL: Record<MarineDecision["state"], string> = {
  valid: "Safe to proceed",
  invalidated: "No longer safe",
  "active-with-warning": "Kept, with warning",
};

const CONDITION_LABEL: Record<MarineDecision["state"], string> = {
  valid: "Current marine conditions are within your limits.",
  invalidated: "Current marine conditions crossed your limits — review the suggested option below.",
  "active-with-warning": "Current marine conditions are still beyond your limits.",
};

const MAX_NAME_LENGTH = 80;

function DecisionItem({
  decision,
  busy,
  onResolve,
  onRename,
  onRequestDelete,
}: {
  decision: MarineDecision;
  busy: boolean;
  onResolve: (id: string, action: "accept" | "decline") => void;
  /** Resolves to an error message, or null when the rename was saved. */
  onRename: (id: string, name: string) => Promise<string | null>;
  onRequestDelete: (decision: MarineDecision) => void;
}) {
  const active = decision.versions.find((v) => v.version === decision.activeVersion)!;
  const repair = decision.pending?.repair;

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(decision.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const startEditing = () => {
    setMenuOpen(false);
    setDraftName(decision.name);
    setRenameError(null);
    setEditing(true);
  };

  const submitRename = async (event: FormEvent) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      setRenameError("Enter a name for this decision.");
      return;
    }
    if (name === decision.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const error = await onRename(decision.id, name);
    setSaving(false);
    if (error) {
      // The existing name stays on the card; the draft is kept to retry.
      setRenameError(error);
    } else {
      setEditing(false);
    }
  };

  return (
    <article className={`dec-item dec-item-${decision.state}`}>
      <header className="dec-item-head">
        <div className="dec-item-title">
          {editing ? (
            <form className="dec-rename" onSubmit={submitRename}>
              <label className="dec-sr-only" htmlFor={`rename-${decision.id}`}>
                Decision Name
              </label>
              <input
                id={`rename-${decision.id}`}
                className="dec-input dec-input-grow"
                value={draftName}
                maxLength={MAX_NAME_LENGTH}
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
                disabled={saving}
              />
              <Button size="sm" type="submit" disabled={saving}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </form>
          ) : (
            <h3>
              {decision.name} <span className="dec-version">V{active.version}</span>
              {active.hold && <span className="dec-version">on hold</span>}
            </h3>
          )}
          {renameError && <p className="dec-inline-error" role="alert">{renameError}</p>}
          <p className="dec-muted">
            Route: {active.routeName} · {active.route.origin.name} → {active.route.destination.name} ·{" "}
            {active.route.distanceKm} km
          </p>
          <p className="dec-muted">
            Your limits: waves up to {active.constraints.maxWaveHeightM} m, wind up to{" "}
            {active.constraints.maxWindKnots} kn · {CONDITION_LABEL[decision.state]}
          </p>
        </div>

        <div className="dec-item-side">
          <Badge
            tone={decision.state === "valid" ? "success" : decision.state === "invalidated" ? "danger" : "warning"}
            size="sm"
          >
            {STATE_LABEL[decision.state]}
          </Badge>
          <div className="dec-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="dec-menu-button"
              aria-label={`More actions for ${decision.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              disabled={busy}
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <div className="dec-menu" role="menu">
                <button type="button" role="menuitem" onClick={startEditing}>
                  Edit Name
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="dec-menu-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onRequestDelete(decision);
                  }}
                >
                  Delete Decision
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <details className="dec-details">
        <summary>Conditions Being Monitored · {active.dependencies.length} marine areas</summary>
        <p className="dec-muted">Marine areas along this route, recorded in conditions update {active.boundToCycleId}.</p>
        <table className="dec-table">
          <thead>
            <tr><th>Marine area (lat, lon)</th><th>Route legs</th><th>Wave when saved</th><th>Wind when saved</th></tr>
          </thead>
          <tbody>
            {active.dependencies.map((d) => (
              <tr key={d.cellId}>
                <td>{d.cellId}</td>
                <td>{segmentsText(d.segments)}</td>
                <td>{fmt(d.boundWaveHeightM, "m")}</td>
                <td>{fmt(d.boundWindSpeedKnots, "kn")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {active.uncoveredSegments.length > 0 && (
          <p className="dec-muted">
            Parts of route legs {segmentsText(active.uncoveredSegments)} are more than 40 km from any forecast point, so conditions there are not being watched.
          </p>
        )}
      </details>

      {decision.pending && repair && (
        <div className="dec-alert">
          <p className="dec-alert-title">
            V{active.version} is no longer safe: conditions changed in update {decision.pending.cycleId}
          </p>
          <InvalidationDetail inv={decision.pending} />

          <div className="dec-repair">
            <p className="dec-alert-title">Suggested safer option</p>
            {repair.type === "alternative-route" ? (
              <p>
                Switch to <strong>{repair.route.name}</strong> ({repair.route.origin.name} →{" "}
                {repair.route.destination.name}) · {repair.distanceDeltaKm >= 0 ? "+" : ""}
                {repair.distanceDeltaKm} km, {repair.durationDeltaHours >= 0 ? "+" : ""}
                {repair.durationDeltaHours} h
                {repair.route.destination.name !== active.route.destination.name && (
                  <span className="dec-bad"> · goes to a different destination</span>
                )}
              </p>
            ) : (
              <p>No safer saved route was found. Wait before departing and check again at the next conditions update.</p>
            )}
            <p className="dec-muted">How this was chosen: {repair.rule}</p>
            <div className="dec-actions">
              <Button size="sm" onClick={() => onResolve(decision.id, "accept")} disabled={busy}>
                Accept · save as V{active.version + 1}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onResolve(decision.id, "decline")} disabled={busy}>
                Decline · keep V{active.version}
              </Button>
            </div>
          </div>
        </div>
      )}

      {decision.state === "active-with-warning" && decision.warning && (
        <div className="dec-warning">
          <p className="dec-alert-title">
            {active.hold ? "Departure on hold" : `You kept V${active.version} of this route`} · conditions are still beyond your limits
          </p>
          <InvalidationDetail inv={decision.warning} />
        </div>
      )}

      <details className="dec-details">
        <summary>Decision History · {decision.versions.length} {decision.versions.length === 1 ? "version" : "versions"}</summary>
        <ol className="dec-history">
          {decision.history
            .filter((h) => h.type !== "skipped")
            .map((h, i) => (
              <li key={`${h.at}-${h.type}-${i}`}>
                <span className="dec-muted">{formatTime(h.at)}</span>{" "}
                <span className={`dec-history-type dec-history-${h.type}`}>{h.type}</span> V{h.version}
                <div>{h.summary}</div>
              </li>
            ))}
        </ol>
        <p className="dec-muted">
          {decision.history.some((h) => h.type === "skipped")
            ? `No action needed in ${decision.history.filter((h) => h.type === "skipped").length} update(s) — the conditions affecting this route did not change.`
            : "No action needed — the conditions affecting this route have not changed."}
        </p>
      </details>
    </article>
  );
}

export default function Decisions() {
  const [state, setState] = useState<DecisionState | null>(null);
  const [routes, setRoutes] = useState<RoutePlan[]>([]);
  const [routeId, setRouteId] = useState("");
  const [maxWave, setMaxWave] = useState("2.0");
  const [maxWind, setMaxWind] = useState("20");
  const [replayId, setReplayId] = useState("");
  const [decisionName, setDecisionName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MarineDecision | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Synchronous guard: `busy` only disables buttons after a re-render,
  // so two quick taps could both start a request before it lands.
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    const next = await fetchDecisionState();
    // One entry per decision id, whatever the server sends.
    const unique = new Map(next.decisions.map((d) => [d.id, d]));
    setState({ ...next, decisions: [...unique.values()] });
    setReplayId((current) => current || next.replayCycles[0]?.id || "");
  }, []);

  useEffect(() => {
    reload().catch((e) => setError(errorMessage(e)));
    fetchRoutes()
      .then((list) => {
        setRoutes(list);
        setRouteId((current) => current || list[0]?.id || "");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [reload]);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await reload();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const saveRoute = async () => {
    const name = decisionName.trim() || routes.find((r) => r.id === routeId)?.name || "";
    const saved = await run(() =>
      commitDecisionRemote({
        routeId,
        name,
        maxWaveHeightM: Number(maxWave),
        maxWindKnots: Number(maxWind),
      })
    );
    if (saved) {
      setDecisionName("");
      setNotice(`Saved "${name}". Sagar is now watching its conditions.`);
    }
  };

  const renameDecision = async (id: string, name: string): Promise<string | null> => {
    if (!id) return "This decision could not be found. Refresh the page and try again.";
    try {
      const updated = await renameDecisionRemote(id, name);
      setState((current) =>
        current && {
          ...current,
          decisions: current.decisions.map((d) => (d.id === updated.id ? updated : d)),
        }
      );
      return null;
    } catch (e) {
      return `Couldn't rename: ${errorMessage(e)}`;
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteDecisionRemote(pendingDelete.id);
      setNotice(`Deleted "${pendingDelete.name}".`);
      setPendingDelete(null);
      await reload().catch((e) => setError(errorMessage(e)));
    } catch (e) {
      // The decision stays in the list; the dialog shows why.
      setDeleteError(`Couldn't delete: ${errorMessage(e)}`);
    }
  };

  return (
    <AppShell>
      <PageContainer className="dec-page">
        <header className="dec-header">
          <div>
            <div className="dec-eyebrow">
              <GitBranch size={14} />
              <span>Marine Decision Watch</span>
            </div>
            <h1>My Marine Decisions</h1>
            <p>
              Save a route with your wave and wind limits. When marine conditions update, Sagar re-checks
              only the routes whose sea areas changed, and alerts you only if a limit is crossed.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => run(resetDecisionsRemote)} disabled={busy}>
            <RotateCcw size={14} /> Reset demo
          </Button>
        </header>

        <p className="dec-notice">
          Sagar gives advice only. Always follow official INCOIS / IMD warnings first. The limits here are
          your own, not official safety thresholds. Wave and wind values are Open-Meteo forecasts, not
          measurements at sea.
        </p>

        {error && <p className="dec-error" role="alert">{error}</p>}
        {notice && <p className="dec-success" role="status">{notice}</p>}

        {state && (
          <section className="dec-panel">
            <div className="dec-panel-head">
              <h2>Current Marine Conditions · {state.snapshot.cycleId}</h2>
              <SourceBadge source={state.snapshot.source} />
            </div>
            <p className="dec-muted">
              {state.snapshot.label} · forecast for {formatTime(state.snapshot.validAt)} · {state.snapshot.cellCount} marine areas
            </p>
            <div className="dec-row">
              <Button size="sm" variant="secondary" onClick={() => run(() => runDecisionCycle({ mode: "live" }))} disabled={busy}>
                <RefreshCw size={14} /> Refresh Marine Conditions
              </Button>
              <select className="dec-input" value={replayId} onChange={(e) => setReplayId(e.target.value)} aria-label="Scenario">
                {state.replayCycles.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => run(() => runDecisionCycle({ mode: "replay", replayId }))}
                disabled={busy || !replayId}
              >
                Apply Scenario
              </Button>
            </div>
            <p className="dec-muted">
              {state.replayCycles.find((c) => c.id === replayId)?.description}
            </p>
          </section>
        )}

        <section className="dec-panel">
          <div className="dec-panel-head">
            <h2>Plan a Route</h2>
          </div>
          <div className="dec-row">
            <label className="dec-field dec-field-grow">
              Decision Name
              <input
                className="dec-input"
                value={decisionName}
                maxLength={MAX_NAME_LENGTH}
                placeholder={routes.find((r) => r.id === routeId)?.name ?? "e.g. Morning Fishing Route"}
                onChange={(e) => setDecisionName(e.target.value)}
              />
            </label>
          </div>
          <div className="dec-row">
            <select className="dec-input dec-input-grow" value={routeId} onChange={(e) => setRouteId(e.target.value)} aria-label="Route">
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.origin.name} → {r.destination.name})</option>
              ))}
            </select>
            <label className="dec-field">
              Max wave height (m)
              <input className="dec-input dec-input-num" type="number" step="0.1" min="0.1" value={maxWave} onChange={(e) => setMaxWave(e.target.value)} />
            </label>
            <label className="dec-field">
              Max wind speed (knots)
              <input className="dec-input dec-input-num" type="number" step="1" min="1" value={maxWind} onChange={(e) => setMaxWind(e.target.value)} />
            </label>
            <Button
              size="sm"
              onClick={saveRoute}
              disabled={busy || !routeId}
            >
              Save Route
            </Button>
          </div>
        </section>

        {state?.lastReport && <CycleReport report={state.lastReport} />}

        <section className="dec-list">
          {state?.decisions.length === 0 && (
            <p className="dec-muted">No saved routes yet. Plan a route above and Sagar will watch its conditions for you.</p>
          )}
          {state?.decisions.map((d) => (
            <DecisionItem
              key={d.id}
              decision={d}
              busy={busy}
              onResolve={(id, action) => run(() => resolveDecisionRepair(id, action))}
              onRename={renameDecision}
              onRequestDelete={(decision) => {
                setDeleteError(null);
                setPendingDelete(decision);
              }}
            />
          ))}
        </section>
      </PageContainer>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete decision?"
        size="sm"
        footer={
          <div className="dec-actions">
            <Button size="sm" variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="dec-modal-text">
          <strong>{pendingDelete?.name}</strong> and its saved decision record, all{" "}
          {pendingDelete?.versions.length} version(s) and its full history will be permanently removed.
          Sagar will stop watching its conditions. Other decisions are not affected.
        </p>
        {deleteError && <p className="dec-inline-error" role="alert">{deleteError}</p>}
      </Modal>
    </AppShell>
  );
}
