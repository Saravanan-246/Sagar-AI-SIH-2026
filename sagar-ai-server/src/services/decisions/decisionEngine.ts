import boundariesData from "../../data/boundaries.json";
import { checkGeofence } from "../safety/geofenceEngine";
import { MODEL_POINT_MAX_DISTANCE_KM } from "../marine/marineDecisionInputs";
import type { RoutePlan, RoutePoint } from "../../types/route";

/*
 * Deterministic core of dependency-bound marine decisions.
 *
 * A committed route decision is bound to the marine-model grid cells its
 * track actually passes through. When a new data cycle arrives, only
 * decisions whose bound cells changed are re-evaluated, and validity is
 * decided purely by the explicit numeric constraints below - never by
 * the LLM. Everything here is a pure function of (route, constraints,
 * snapshot) so the same inputs always give the same verdict.
 */

/** Spacing of the points sampled along each segment when binding it to
 * grid cells - so a segment depends on every cell it crosses, not only
 * the cells at its two ends. */
const SEGMENT_SAMPLE_KM = 5;

export interface DecisionConstraints {
  /** Operator-set limits for this decision. They are not official
   * INCOIS/IMD thresholds. */
  maxWaveHeightM: number;
  maxWindKnots: number;
}

export const DEFAULT_CONSTRAINTS: DecisionConstraints = {
  maxWaveHeightM: 2.0,
  maxWindKnots: 20,
};

export interface GridCell {
  id: string;
  latitude: number;
  longitude: number;
  waveHeightM?: number;
  windSpeedKnots?: number;
}

export type SnapshotSource = "live-model" | "replay";

export interface DataSnapshot {
  cycleId: string;
  sequence: number;
  source: SnapshotSource;
  label: string;
  /** Model valid time (live) or the recorded valid time (replay). */
  validAt?: string;
  createdAt: string;
  cells: GridCell[];
}

export interface CellDependency {
  cellId: string;
  latitude: number;
  longitude: number;
  /** Route segments (0-based: segment i runs waypoint i -> i+1) whose
   * sampled track binds to this cell. */
  segments: number[];
  /** Values when this version was bound. */
  boundWaveHeightM?: number;
  boundWindSpeedKnots?: number;
}

export type ConstraintId = "max-wave-height" | "max-wind" | "data-available";

export interface Violation {
  cellId: string;
  segments: number[];
  constraint: ConstraintId;
  field: "waveHeightM" | "windSpeedKnots";
  limit?: number;
  value?: number;
  /** Value in the previous data cycle, when known. */
  previousValue?: number;
  message: string;
}

export interface CellChange {
  cellId: string;
  latitude: number;
  longitude: number;
  field: "waveHeightM" | "windSpeedKnots";
  previousValue?: number;
  newValue?: number;
}

export function cellId(latitude: number, longitude: number): string {
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Same rule as marineDecisionInputs' nearestWavePoint: nearest cell with
 * a wave value within MODEL_POINT_MAX_DISTANCE_KM, never interpolated. */
function nearestWaveCell(cells: GridCell[], point: RoutePoint): GridCell | null {
  let best: { cell: GridCell; d: number } | null = null;
  for (const cell of cells) {
    if (typeof cell.waveHeightM !== "number") continue;
    const d = haversineKm(cell, point);
    if (d <= MODEL_POINT_MAX_DISTANCE_KM && (!best || d < best.d)) {
      best = { cell, d };
    }
  }
  return best?.cell ?? null;
}

function sampleSegment(a: RoutePoint, b: RoutePoint): RoutePoint[] {
  const steps = Math.max(1, Math.ceil(haversineKm(a, b) / SEGMENT_SAMPLE_KM));
  const points: RoutePoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push({
      latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t,
    });
  }
  return points;
}

/** Transit is blocked only by no-entry boundaries. no_fishing sectors
 * (e.g. the nearshore sector every Thoothukudi departure crosses)
 * restrict fishing, not passage. */
const NO_ENTRY_BOUNDARY_IDS = new Set(
  (boundariesData as { id: string; restriction?: string }[])
    .filter((b) => b.restriction === "no_entry")
    .map((b) => b.id)
);

function insideNoEntryBoundary(point: RoutePoint): boolean {
  return checkGeofence(point, { radiusKm: 0 }).some(
    (result) => result.inside && NO_ENTRY_BOUNDARY_IDS.has(result.boundaryId)
  );
}

export function routeTrack(route: RoutePlan): RoutePoint[] {
  return route.waypoints.length >= 2 ? route.waypoints : [route.origin, route.destination];
}

export interface BindingResult {
  dependencies: CellDependency[];
  /** Sampled points with no model cell within range - the decision has
   * no data dependency there and it is reported, not hidden. */
  uncoveredSegments: number[];
  restrictedSegments: number[];
}

export function bindRoute(route: RoutePlan, snapshot: DataSnapshot): BindingResult {
  const track = routeTrack(route);
  const byCell = new Map<string, CellDependency>();
  const uncovered = new Set<number>();
  const restricted = new Set<number>();

  for (let seg = 0; seg < track.length - 1; seg += 1) {
    for (const point of sampleSegment(track[seg], track[seg + 1])) {
      if (insideNoEntryBoundary(point)) restricted.add(seg);

      const cell = nearestWaveCell(snapshot.cells, point);
      if (!cell) {
        uncovered.add(seg);
        continue;
      }

      const dep = byCell.get(cell.id) ?? {
        cellId: cell.id,
        latitude: cell.latitude,
        longitude: cell.longitude,
        segments: [],
        boundWaveHeightM: cell.waveHeightM,
        boundWindSpeedKnots: cell.windSpeedKnots,
      };
      if (!dep.segments.includes(seg)) dep.segments.push(seg);
      byCell.set(cell.id, dep);
    }
  }

  return {
    dependencies: [...byCell.values()].sort((a, b) => a.segments[0] - b.segments[0]),
    uncoveredSegments: [...uncovered].sort((a, b) => a - b),
    restrictedSegments: [...restricted].sort((a, b) => a - b),
  };
}

export function evaluateDependencies(
  dependencies: CellDependency[],
  constraints: DecisionConstraints,
  snapshot: DataSnapshot,
  previous?: DataSnapshot
): Violation[] {
  const cells = new Map(snapshot.cells.map((c) => [c.id, c]));
  const prevCells = new Map((previous?.cells ?? []).map((c) => [c.id, c]));
  const violations: Violation[] = [];

  for (const dep of dependencies) {
    const cell = cells.get(dep.cellId);
    const prev = prevCells.get(dep.cellId);

    if (!cell || typeof cell.waveHeightM !== "number") {
      violations.push({
        cellId: dep.cellId,
        segments: dep.segments,
        constraint: "data-available",
        field: "waveHeightM",
        previousValue: prev?.waveHeightM,
        message: `No wave value for cell ${dep.cellId} in this data cycle - the decision can no longer be verified there.`,
      });
      continue;
    }

    if (cell.waveHeightM > constraints.maxWaveHeightM) {
      violations.push({
        cellId: dep.cellId,
        segments: dep.segments,
        constraint: "max-wave-height",
        field: "waveHeightM",
        limit: constraints.maxWaveHeightM,
        value: cell.waveHeightM,
        previousValue: prev?.waveHeightM,
        message: `Wave height ${cell.waveHeightM} m exceeds the ${constraints.maxWaveHeightM} m limit.`,
      });
    }

    if (typeof cell.windSpeedKnots === "number" && cell.windSpeedKnots > constraints.maxWindKnots) {
      violations.push({
        cellId: dep.cellId,
        segments: dep.segments,
        constraint: "max-wind",
        field: "windSpeedKnots",
        limit: constraints.maxWindKnots,
        value: cell.windSpeedKnots,
        previousValue: prev?.windSpeedKnots,
        message: `Wind ${cell.windSpeedKnots} kn exceeds the ${constraints.maxWindKnots} kn limit.`,
      });
    }
  }

  return violations;
}

export function diffSnapshots(previous: DataSnapshot, next: DataSnapshot): CellChange[] {
  const prevCells = new Map(previous.cells.map((c) => [c.id, c]));
  const changes: CellChange[] = [];

  for (const cell of next.cells) {
    const prev = prevCells.get(cell.id);
    for (const field of ["waveHeightM", "windSpeedKnots"] as const) {
      if (prev?.[field] !== cell[field]) {
        changes.push({
          cellId: cell.id,
          latitude: cell.latitude,
          longitude: cell.longitude,
          field,
          previousValue: prev?.[field],
          newValue: cell[field],
        });
      }
    }
  }

  return changes;
}

export type RepairProposal =
  | {
      type: "alternative-route";
      route: RoutePlan;
      binding: BindingResult;
      distanceDeltaKm: number;
      durationDeltaHours: number;
      rule: string;
    }
  | { type: "hold"; rule: string };

/**
 * Constrained repair: among the stored corridors leaving the same origin
 * (within 5 km), keep only those whose every bound cell satisfies the
 * decision's own constraints in the current cycle, that have full model
 * coverage and cross no restricted boundary; then take the shortest.
 * "Shortest among stored feasible corridors" is the whole objective -
 * it is not a minimal-change search over all possible tracks.
 * If none qualifies, the repair is to hold departure.
 */
export function proposeRepair(
  current: RoutePlan,
  constraints: DecisionConstraints,
  candidates: RoutePlan[],
  snapshot: DataSnapshot
): RepairProposal {
  const rule =
    "Stored corridors from the same origin (≤5 km), full model coverage, no no-entry boundary, every bound cell within this decision's limits; shortest distance wins.";

  const feasible = candidates
    .filter((r) => r.id !== current.id && haversineKm(r.origin, current.origin) <= 5)
    .map((route) => ({ route, binding: bindRoute(route, snapshot) }))
    .filter(
      ({ binding }) =>
        binding.dependencies.length > 0 &&
        binding.uncoveredSegments.length === 0 &&
        binding.restrictedSegments.length === 0 &&
        evaluateDependencies(binding.dependencies, constraints, snapshot).length === 0
    )
    .sort((a, b) => a.route.distanceKm - b.route.distanceKm);

  const best = feasible[0];
  if (!best) {
    return {
      type: "hold",
      rule: `${rule} No stored corridor qualified, so the constrained repair is to hold departure and re-check at the next data cycle.`,
    };
  }

  return {
    type: "alternative-route",
    route: best.route,
    binding: best.binding,
    distanceDeltaKm: Number((best.route.distanceKm - current.distanceKm).toFixed(1)),
    durationDeltaHours: Number(
      (best.route.estimatedDurationHours - current.estimatedDurationHours).toFixed(1)
    ),
    rule,
  };
}
