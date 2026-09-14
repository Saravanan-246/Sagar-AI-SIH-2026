import { useCallback, useEffect, useState } from "react";

import {
  calculateRoute,
  getRoutes,
} from "../services/routes/routeService";

import type {
  RouteCalculationInput,
  RoutePlan,
} from "../types/route";

export default function useRoute() {
  const [routes, setRoutes] = useState<RoutePlan[]>(
    []
  );

  const [selectedRoute, setSelectedRoute] =
    useState<RoutePlan | null>(null);

  const [result, setResult] =
    useState<RoutePlan | null>(null);

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const loadRoutes = useCallback(() => {
    try {
      setError(null);

      const availableRoutes =
        getRoutes();

      setRoutes(availableRoutes);

      if (
        !selectedRoute &&
        availableRoutes.length > 0
      ) {
        setSelectedRoute(
          availableRoutes[0]
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load routes."
      );
    }
  }, [selectedRoute]);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const calculate = useCallback(
    async (
      input: RouteCalculationInput
    ): Promise<RoutePlan | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const calculated =
          calculateRoute(
            input.origin,
            input.destination,
            {
              speedKnots:
                input.speedKnots,
              vesselType:
                input.vesselType,
              departureTime:
                input.departureTime,
              avoidRestrictedAreas:
                input.avoidRestrictedAreas,
              preferredRisk:
                input.preferredRisk,
            }
          );

        setResult(calculated);

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
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    routes,

    selectedRoute,

    result,

    isLoading,

    error,

    loadRoutes,

    calculate,

    selectRoute,

    clearResult,

    clearError,

    setSelectedRoute,
  };
}