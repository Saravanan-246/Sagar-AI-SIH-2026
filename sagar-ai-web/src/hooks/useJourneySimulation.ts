import { useCallback, useEffect, useRef, useState } from "react";

import type { RoutePlan } from "../types/route";

export type JourneyStatus = "idle" | "running" | "paused" | "finished";

export interface JourneyState {
  status: JourneyStatus;
  progress: number;
  position: { latitude: number; longitude: number } | null;
  bearingDeg: number;
  etaMinutesRemaining: number | null;
}

interface Point {
  latitude: number;
  longitude: number;
}

// Wall-clock duration for the demo simulation to cross the whole route,
// independent of the route's real estimated travel time.
const SIMULATION_DURATION_MS = 24000;
const TICK_MS = 150;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function haversineDistanceKm(a: Point, b: Point): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function bearingBetween(a: Point, b: Point): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function interpolateAlongPath(
  waypoints: Point[],
  progress: number
): { position: Point; bearingDeg: number } | null {
  if (waypoints.length === 0) {
    return null;
  }

  if (waypoints.length === 1) {
    return { position: waypoints[0], bearingDeg: 0 };
  }

  const segmentLengths: number[] = [];
  let totalDistance = 0;

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const length = haversineDistanceKm(
      waypoints[index],
      waypoints[index + 1]
    );
    segmentLengths.push(length);
    totalDistance += length;
  }

  const targetDistance = Math.min(1, Math.max(0, progress)) * totalDistance;
  let covered = 0;

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentStart = waypoints[index];
    const segmentEnd = waypoints[index + 1];
    const segmentLength = segmentLengths[index];

    const isLastSegment = index === segmentLengths.length - 1;

    if (covered + segmentLength >= targetDistance || isLastSegment) {
      const segmentProgress =
        segmentLength > 0
          ? Math.min(
              1,
              Math.max(0, (targetDistance - covered) / segmentLength)
            )
          : 1;

      return {
        position: {
          latitude:
            segmentStart.latitude +
            (segmentEnd.latitude - segmentStart.latitude) * segmentProgress,
          longitude:
            segmentStart.longitude +
            (segmentEnd.longitude - segmentStart.longitude) *
              segmentProgress,
        },
        bearingDeg: bearingBetween(segmentStart, segmentEnd),
      };
    }

    covered += segmentLength;
  }

  return { position: waypoints[waypoints.length - 1], bearingDeg: 0 };
}

const IDLE_STATE: JourneyState = {
  status: "idle",
  progress: 0,
  position: null,
  bearingDeg: 0,
  etaMinutesRemaining: null,
};

export function useJourneySimulation(route: RoutePlan | null) {
  const [state, setState] = useState<JourneyState>(IDLE_STATE);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const baseProgressRef = useRef(0);

  const waypoints = route?.waypoints ?? [];

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const applyProgress = useCallback(
    (progress: number, status: JourneyStatus) => {
      const clamped = Math.min(1, Math.max(0, progress));
      const interpolated = interpolateAlongPath(waypoints, clamped);
      const totalEtaMinutes = (route?.estimatedDurationHours ?? 0) * 60;

      setState({
        status,
        progress: clamped,
        position: interpolated?.position ?? null,
        bearingDeg: interpolated?.bearingDeg ?? 0,
        etaMinutesRemaining: Math.max(
          0,
          Math.round(totalEtaMinutes * (1 - clamped))
        ),
      });
    },
    [waypoints, route?.estimatedDurationHours]
  );

  const stop = useCallback(() => {
    clearTimer();
    startedAtRef.current = null;
    baseProgressRef.current = 0;

    const start = waypoints[0] ?? null;

    setState({
      status: "idle",
      progress: 0,
      position: start,
      bearingDeg: 0,
      etaMinutesRemaining: route
        ? Math.round((route.estimatedDurationHours ?? 0) * 60)
        : null,
    });
  }, [clearTimer, waypoints, route]);

  const runTimer = useCallback(() => {
    clearTimer();
    startedAtRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - (startedAtRef.current ?? Date.now());
      const progress =
        baseProgressRef.current + elapsed / SIMULATION_DURATION_MS;

      if (progress >= 1) {
        applyProgress(1, "finished");
        clearTimer();
        return;
      }

      applyProgress(progress, "running");
    }, TICK_MS);
  }, [applyProgress, clearTimer]);

  const start = useCallback(() => {
    if (waypoints.length < 2) {
      return;
    }

    baseProgressRef.current = 0;
    runTimer();
  }, [runTimer, waypoints]);

  const pause = useCallback(() => {
    setState((current) => {
      baseProgressRef.current = current.progress;
      return { ...current, status: "paused" };
    });
    clearTimer();
  }, [clearTimer]);

  const resume = useCallback(() => {
    setState((current) => {
      if (current.status !== "paused") {
        return current;
      }

      runTimer();
      return { ...current, status: "running" };
    });
  }, [runTimer]);

  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    ...state,
    start,
    pause,
    resume,
    stop,
  };
}

export default useJourneySimulation;
