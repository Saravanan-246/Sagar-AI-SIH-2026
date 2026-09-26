import fs from "fs";
import path from "path";

import replayData from "../../data/decisionReplay.json";
import { getMarineModelGrid } from "../data/sourceAdapters/openMeteoAdapter";
import { getRouteById, getRoutes } from "../routes/routeService";
import type { RoutePlan } from "../../types/route";
import {
  bindRoute,
  cellId,
  diffSnapshots,
  evaluateDependencies,
  haversineKm,
  proposeRepair,
  type CellChange,
  type CellDependency,
  type DataSnapshot,
  type DecisionConstraints,
  type GridCell,
  type RepairProposal,
  type Violation,
} from "./decisionEngine";

/*
 * Versioned decision store. A decision's versions are immutable; a new
 * version (V1 -> V2) exists only when the user accepts a repair, and the
 * audit trail records the data cycle, changed values and violated
 * constraints that caused it. State is kept in memory and written
 * through to a JSON file so a server restart doesn't lose the demo.
 */

const STORE_FILE = path.resolve(__dirname, "../../../.data/decisions.json");

export interface DecisionVersion {
  version: number;
  createdAt: string;
  routeId: string;
  routeName: string;
  route: RoutePlan;
  constraints: DecisionConstraints;
  dependencies: CellDependency[];
  uncoveredSegments: number[];
  /** Data cycle the version was bound against. */
  boundToCycleId: string;
  /** Why this version exists (V1: committed by user). */
  reason: string;
  hold?: boolean;
}

export type DecisionState = "valid" | "invalidated" | "active-with-warning";

export interface PendingInvalidation {
  cycleId: string;
  detectedAt: string;
  changes: CellChange[];
  violations: Violation[];
  repair: RepairProposal;
}

export interface AuditEvent {
  at: string;
  type:
    | "committed"
    | "skipped"
    | "revalidated"
    | "invalidated"
    | "repair-accepted"
    | "repair-declined"
    | "renamed";
  cycleId?: string;
  version: number;
  summary: string;
}

export interface Decision {
  id: string;
  /** User-chosen display name. Renaming never creates a version. */
  name: string;
  createdAt: string;
  updatedAt?: string;
  state: DecisionState;
  activeVersion: number;
  versions: DecisionVersion[];
  pending?: PendingInvalidation;
  /** Kept after a decline so the warning can still show what's wrong. */
  warning?: PendingInvalidation;
  history: AuditEvent[];
}

export type CycleOutcome =
  | { decisionId: string; name: string; version: number; result: "skipped"; reason: string }
  | {
      decisionId: string;
      name: string;
      version: number;
      result: "revalidated" | "invalidated";
      changedDependencies: CellChange[];
      violations: Violation[];
    };

export interface CycleReport {
  cycleId: string;
  source: DataSnapshot["source"];
  label: string;
  at: string;
  changedCells: CellChange[];
  outcomes: CycleOutcome[];
}

interface StoreState {
  decisions: Decision[];
  snapshot: DataSnapshot | null;
  previousSnapshot: DataSnapshot | null;
  lastReport: CycleReport | null;
  sequence: number;
}

let state: StoreState = load();

function load(): StoreState {
  try {
    const loaded = JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as StoreState;
    // Records saved before decisions had their own name show the route
    // name of their first version, which is what they displayed before.
    for (const decision of loaded.decisions) {
      decision.name ??= decision.versions[0]?.routeName ?? "Route decision";
    }
    return loaded;
  } catch {
    return { decisions: [], snapshot: null, previousSnapshot: null, lastReport: null, sequence: 0 };
  }
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.warn("Decision store could not be written:", error);
  }
}

const now = () => new Date().toISOString();

function toCells(
  points: { latitude: number; longitude: number; waveHeightM?: number | null; windSpeedKnots?: number | null }[]
): GridCell[] {
  return points.map((p) => ({
    id: cellId(p.latitude, p.longitude),
    latitude: p.latitude,
    longitude: p.longitude,
    waveHeightM: typeof p.waveHeightM === "number" ? p.waveHeightM : undefined,
    windSpeedKnots: typeof p.windSpeedKnots === "number" ? p.windSpeedKnots : undefined,
  }));
}

function nextCycleId(prefix: string): { id: string; sequence: number } {
  state.sequence += 1;
  return { id: `${prefix}-${state.sequence}`, sequence: state.sequence };
}

async function fetchLiveSnapshot(): Promise<DataSnapshot | null> {
  const grid = await getMarineModelGrid();
  if (grid.status !== "success" || grid.points.length === 0) return null;

  const { id, sequence } = nextCycleId("live");
  return {
    cycleId: id,
    sequence,
    source: "live-model",
    label: "Open-Meteo marine model (forecast model output, not an observation)",
    validAt: grid.generatedAt ?? undefined,
    createdAt: now(),
    cells: toCells(
      grid.points.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        waveHeightM: p.waveHeight,
        windSpeedKnots: p.windSpeed,
      }))
    ),
  };
}

function replayBaselineSnapshot(): DataSnapshot {
  const { id, sequence } = nextCycleId("replay");
  return {
    cycleId: id,
    sequence,
    source: "replay",
    label: `Replay baseline: ${replayData.baseline.label} (valid ${replayData.baseline.validAt})`,
    validAt: replayData.baseline.validAt,
    createdAt: now(),
    cells: toCells(replayData.baseline.cells),
  };
}

/** The snapshot decisions are bound against. First use tries the live
 * model and falls back to the recorded replay baseline, labelled. */
export async function getCurrentSnapshot(): Promise<DataSnapshot> {
  if (state.snapshot) return state.snapshot;
  state.snapshot = (await fetchLiveSnapshot().catch(() => null)) ?? replayBaselineSnapshot();
  save();
  return state.snapshot;
}

export function listReplayCycles() {
  return replayData.cycles.map(({ id, label, description }) => ({ id, label, description }));
}

function routeLabel(version: DecisionVersion): string {
  return `${version.routeName} (V${version.version})`;
}

function activeVersionOf(decision: Decision): DecisionVersion {
  return decision.versions.find((v) => v.version === decision.activeVersion)!;
}

function cellsText(changes: CellChange[]): string {
  return changes
    .map((c) => `${c.field === "waveHeightM" ? "wave" : "wind"} @ ${c.cellId}: ${c.previousValue ?? "n/a"} → ${c.newValue ?? "n/a"}`)
    .join("; ");
}

export const MAX_DECISION_NAME_LENGTH = 80;

function cleanName(name: string | undefined): string | undefined {
  const trimmed = name?.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_DECISION_NAME_LENGTH) {
    throw new Error(`Decision name must be ${MAX_DECISION_NAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

export async function commitDecision(
  routeId: string,
  constraints: DecisionConstraints,
  requestedName?: string
): Promise<Decision> {
  const route = getRouteById(routeId);
  if (!route) throw new Error(`Unknown route ${routeId}.`);

  const name = cleanName(requestedName) ?? route.name;

  // Several decisions may share a route (e.g. a morning and an evening
  // trip), but not the same route under the same name - that is the
  // same decision saved twice, which is how repeated taps on Save
  // previously produced a stack of identical records.
  const duplicate = state.decisions.find(
    (d) => activeVersionOf(d).routeId === route.id && d.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`"${name}" is already saved for this route. Give the new decision a different name.`);
  }

  const snapshot = await getCurrentSnapshot();
  const binding = bindRoute(route, snapshot);

  if (binding.dependencies.length === 0) {
    throw new Error(`${route.name} is outside the marine-model grid - it has no data dependencies to bind, so it can't be monitored.`);
  }
  if (binding.restrictedSegments.length > 0) {
    throw new Error(`${route.name} crosses a no-entry boundary (segments ${binding.restrictedSegments.map((s) => s + 1).join(", ")}).`);
  }

  const violations = evaluateDependencies(binding.dependencies, constraints, snapshot);
  if (violations.length > 0) {
    throw new Error(`${route.name} already violates its constraints in the current data cycle: ${violations.map((v) => v.message).join(" ")}`);
  }

  const at = now();
  const decision: Decision = {
    id: `dec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    createdAt: at,
    state: "valid",
    activeVersion: 1,
    versions: [
      {
        version: 1,
        createdAt: at,
        routeId: route.id,
        routeName: route.name,
        route,
        constraints,
        dependencies: binding.dependencies,
        uncoveredSegments: binding.uncoveredSegments,
        boundToCycleId: snapshot.cycleId,
        reason: "Committed by user.",
      },
    ],
    history: [
      {
        at,
        type: "committed",
        cycleId: snapshot.cycleId,
        version: 1,
        summary: `V1 committed as "${name}": ${route.name}, bound to ${binding.dependencies.length} model cell(s); limits wave ≤ ${constraints.maxWaveHeightM} m, wind ≤ ${constraints.maxWindKnots} kn.`,
      },
    ],
  };

  state.decisions.unshift(decision);
  save();
  return decision;
}

function applySnapshot(next: DataSnapshot): CycleReport {
  const previous = state.snapshot!;
  const changedCells = diffSnapshots(previous, next);
  const at = now();
  const outcomes: CycleOutcome[] = [];

  for (const decision of state.decisions) {
    const version = activeVersionOf(decision);
    const depIds = new Set(version.dependencies.map((d) => d.cellId));
    const relevant = changedCells.filter((c) => depIds.has(c.cellId));

    // Selective invalidation: a decision is only re-evaluated when a
    // cell it depends on changed in this cycle.
    if (relevant.length === 0) {
      const reason = changedCells.length
        ? `${changedCells.length} value(s) changed, none in this decision's ${depIds.size} dependency cell(s).`
        : "No values changed in this cycle.";
      outcomes.push({ decisionId: decision.id, name: decision.name, version: version.version, result: "skipped", reason });
      decision.history.push({ at, type: "skipped", cycleId: next.cycleId, version: version.version, summary: `Not re-evaluated: ${reason}` });
      continue;
    }

    const violations = evaluateDependencies(version.dependencies, version.constraints, next, previous);

    if (violations.length === 0) {
      outcomes.push({ decisionId: decision.id, name: decision.name, version: version.version, result: "revalidated", changedDependencies: relevant, violations });
      decision.history.push({
        at,
        type: "revalidated",
        cycleId: next.cycleId,
        version: version.version,
        summary: `Re-evaluated after ${cellsText(relevant)} - all constraints still satisfied. No alert.`,
      });
      // Conditions recovered: an open invalidation or a declined
      // warning no longer applies.
      if (decision.state !== "valid") {
        decision.state = "valid";
        decision.pending = undefined;
        decision.warning = undefined;
      }
      continue;
    }

    const repair = proposeRepair(version.route, version.constraints, getRoutes(), next);
    decision.state = "invalidated";
    decision.warning = undefined;
    decision.pending = { cycleId: next.cycleId, detectedAt: at, changes: relevant, violations, repair };
    outcomes.push({ decisionId: decision.id, name: decision.name, version: version.version, result: "invalidated", changedDependencies: relevant, violations });
    decision.history.push({
      at,
      type: "invalidated",
      cycleId: next.cycleId,
      version: version.version,
      summary: `${routeLabel(version)} invalidated: ${violations.map((v) => v.message).join(" ")} Proposed repair: ${
        repair.type === "alternative-route" ? `switch to ${repair.route.name}` : "hold departure"
      }.`,
    });
  }

  state.previousSnapshot = previous;
  state.snapshot = next;
  state.lastReport = { cycleId: next.cycleId, source: next.source, label: next.label, at, changedCells, outcomes };
  save();
  return state.lastReport;
}

export async function runLiveCycle(): Promise<CycleReport> {
  await getCurrentSnapshot();
  const next = await fetchLiveSnapshot().catch(() => null);
  if (!next) throw new Error("Open-Meteo marine model is unavailable right now - no live data cycle was applied.");
  return applySnapshot(next);
}

export async function runReplayCycle(replayId: string): Promise<CycleReport> {
  const cycle = replayData.cycles.find((c) => c.id === replayId);
  if (!cycle) throw new Error(`Unknown replay cycle ${replayId}.`);

  const current = await getCurrentSnapshot();
  const cells = current.cells.map((c) => ({ ...c }));

  // Overrides target the nearest cell within 5 km, so they apply whether
  // the current snapshot came from the live model or the recorded one.
  for (const o of cycle.overrides) {
    const target = cells
      .map((c) => ({ c, d: haversineKm(c, o) }))
      .filter(({ d }) => d <= 5)
      .sort((a, b) => a.d - b.d)[0]?.c;
    if (!target) continue;
    target.waveHeightM = o.waveHeightM;
    target.windSpeedKnots = o.windSpeedKnots;
  }

  const { id, sequence } = nextCycleId("replay");
  return applySnapshot({
    cycleId: id,
    sequence,
    source: "replay",
    label: cycle.label,
    validAt: current.validAt,
    createdAt: now(),
    cells,
  });
}

function findDecision(id: string): Decision {
  const decision = state.decisions.find((d) => d.id === id);
  if (!decision) throw new Error(`Unknown decision ${id}.`);
  return decision;
}

/** Changes only the display name - route, dependencies, constraints,
 * versions and state are untouched, and no new version is created. */
export function renameDecision(id: string, requestedName: string): Decision {
  const decision = findDecision(id);
  const name = cleanName(requestedName);
  if (!name) throw new Error("Decision name can't be empty.");
  if (name === decision.name) return decision;

  const at = now();
  decision.history.push({
    at,
    type: "renamed",
    version: decision.activeVersion,
    summary: `Renamed from "${decision.name}" to "${name}".`,
  });
  decision.name = name;
  decision.updatedAt = at;

  save();
  return decision;
}

/** Removes the decision record and its history. Other decisions and
 * the current data cycle are untouched. */
export function deleteDecision(id: string): void {
  findDecision(id);
  state.decisions = state.decisions.filter((d) => d.id !== id);
  if (state.lastReport) {
    state.lastReport.outcomes = state.lastReport.outcomes.filter((o) => o.decisionId !== id);
  }
  save();
}

export function acceptRepair(id: string): Decision {
  const decision = findDecision(id);
  const pending = decision.pending;
  if (!pending) throw new Error("This decision has no pending repair.");

  const from = activeVersionOf(decision);
  const version = from.version + 1;
  const at = now();
  const why = `V${from.version} invalidated in cycle ${pending.cycleId}: ${pending.violations.map((v) => v.message).join(" ")} (changed: ${cellsText(pending.changes)}).`;

  const next: DecisionVersion =
    pending.repair.type === "alternative-route"
      ? {
          version,
          createdAt: at,
          routeId: pending.repair.route.id,
          routeName: pending.repair.route.name,
          route: pending.repair.route,
          constraints: from.constraints,
          dependencies: pending.repair.binding.dependencies,
          uncoveredSegments: pending.repair.binding.uncoveredSegments,
          boundToCycleId: pending.cycleId,
          reason: `${why} User accepted constrained repair: switch to ${pending.repair.route.name} (${pending.repair.distanceDeltaKm >= 0 ? "+" : ""}${pending.repair.distanceDeltaKm} km).`,
        }
      : {
          ...from,
          version,
          createdAt: at,
          boundToCycleId: pending.cycleId,
          hold: true,
          reason: `${why} User accepted constrained repair: hold departure on the same route.`,
        };

  decision.versions.push(next);
  decision.activeVersion = version;
  decision.state = "valid";
  decision.pending = undefined;
  decision.history.push({ at, type: "repair-accepted", cycleId: pending.cycleId, version, summary: `V${from.version} → V${version}. ${next.reason}` });

  // A held route is still exposed to the violating conditions.
  if (next.hold) {
    decision.state = "active-with-warning";
    decision.warning = pending;
  }

  save();
  return decision;
}

export function declineRepair(id: string): Decision {
  const decision = findDecision(id);
  const pending = decision.pending;
  if (!pending) throw new Error("This decision has no pending repair.");

  const version = activeVersionOf(decision);
  decision.state = "active-with-warning";
  decision.warning = pending;
  decision.pending = undefined;
  decision.history.push({
    at: now(),
    type: "repair-declined",
    cycleId: pending.cycleId,
    version: version.version,
    summary: `Repair declined. V${version.version} stays active WITH WARNING: ${pending.violations.map((v) => v.message).join(" ")}`,
  });

  save();
  return decision;
}

export async function getDecisionState() {
  const snapshot = await getCurrentSnapshot();
  return {
    decisions: state.decisions,
    snapshot: {
      cycleId: snapshot.cycleId,
      source: snapshot.source,
      label: snapshot.label,
      validAt: snapshot.validAt,
      createdAt: snapshot.createdAt,
      cellCount: snapshot.cells.length,
    },
    lastReport: state.lastReport,
    replayCycles: listReplayCycles(),
  };
}

export function resetDecisions(): void {
  state = { decisions: [], snapshot: null, previousSnapshot: null, lastReport: null, sequence: 0 };
  save();
}
