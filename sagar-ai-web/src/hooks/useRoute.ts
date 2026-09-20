import { useCallback, useEffect, useState } from "react";

import {
  calculateRouteOptionsRemote,
  calculateRouteRemote,
  fetchRoutes,
} from "../services/api/sagarApiClient";

import {
  calculateRoute as calculateRouteLocal,
  calculateRouteOptions as calculateRouteOptionsLocal,
  getRoutes as getRoutesLocal,
} from "../services/routes/routeService";

import type {
  RoutePlan,
  RoutePoint,
} from "../types/route";

export default function useRoute() {
  const [routes, setRoutes] = useState<RoutePlan[]>(
    []
  );

  const [routeOptions, setRouteOptions] = useState<
    RoutePlan[]
  >([]);

  const [selectedRoute, setSelectedRoute] =
    useState<RoutePlan | null>(null);

  const [result, setResult] =
    useState<RoutePlan | null>(null);

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  // Whether the most recent route data actually came from the live
  // backend or the local/offline fallback - a real observed outcome
  // (matches useSagar's same offline-fallback pattern), never a
  // hardcoded "LIVE" label.
  const [dataSource, setDataSource] =
    useState<"backend" | "offline" | null>(null);

  const loadRoutes = useCallback(async () => {
    try {
      setError(null);

      let usedFallback = false;

      const availableRoutes = await fetchRoutes().catch((err) => {
        console.warn(
          "Sagar backend is unavailable, using local route data:",
          err
        );
        usedFallback = true;
        return getRoutesLocal();
      });

      setDataSource(usedFallback ? "offline" : "backend");
      setRoutes(availableRoutes);

      setSelectedRoute((current) =>
        current ?? availableRoutes[0] ?? null
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load routes."
      );
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const calculate = useCallback(
    async (
      origin: RoutePoint,
      destination: RoutePoint,
    ): Promise<RoutePlan | null> => {
      setIsLoading(true);
      setError(null);

      try {
        let usedFallback = false;

        const [calculated, options] = await Promise.all([
          calculateRouteRemote(
            origin,
            destination,
          ).catch((err) => {
            console.warn(
              "Sagar backend is unavailable, calculating the route locally:",
              err
            );
            usedFallback = true;
            return calculateRouteLocal(origin, destination);
          }),
          calculateRouteOptionsRemote(
            origin,
            destination,
          ).catch((err) => {
            console.warn(
              "Sagar backend is unavailable, calculating route options locally:",
              err
            );
            usedFallback = true;
            return calculateRouteOptionsLocal(origin, destination);
          }),
        ]);

        setDataSource(usedFallback ? "offline" : "backend");
        setResult(calculated);
        setRouteOptions(options);

        if (calculated) {
          setSelectedRoute(
            calculated
          );
        }

        return calculated;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to calculate route.";

        setError(message);

        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const selectRoute = useCallback(
    (route: RoutePlan | null) => {
      setSelectedRoute(route);
      setResult(route);
    },
    []
  );

  const clearResult = useCallback(() => {
    setResult(null);
    setRouteOptions([]);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    routes,

    routeOptions,

    selectedRoute,

    result,

    isLoading,
    loading: isLoading,

    error,

    dataSource,

    loadRoutes,
    refresh: loadRoutes,

    calculate,

    selectRoute,

    clearResult,

    clearError,

    setSelectedRoute,
  };
}
