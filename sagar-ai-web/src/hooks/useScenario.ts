import { useCallback, useEffect, useState } from "react";

import {
  getScenarios,
  runScenario,
} from "../services/scenarios/scenarioEngine";

import type {
  Scenario,
  ScenarioResult,
} from "../types/scenario";

type ScenarioInput = Record<
  string,
  unknown
>;

type UseScenarioReturn = {
  scenarios: Scenario[];
  selectedScenario: Scenario | null;
  result: ScenarioResult | null;
  loading: boolean;
  error: string | null;
  selectScenario: (
    scenario: Scenario | null
  ) => void;
  run: (
    scenario: Scenario,
    inputs?: ScenarioInput
  ) => Promise<ScenarioResult | null>;
  refresh: () => void;
  clearResult: () => void;
};

export default function useScenario(): UseScenarioReturn {
  const [scenarios, setScenarios] =
    useState<Scenario[]>([]);

  const [selectedScenario, setSelectedScenario] =
    useState<Scenario | null>(null);

  const [result, setResult] =
    useState<ScenarioResult | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const loadScenarios = useCallback(() => {
    setError(null);

    try {
      const data = getScenarios();

      setScenarios(data);

      setSelectedScenario((current) => {
        if (current) {
          return (
            data.find(
              (scenario) =>
                scenario.id === current.id
            ) ?? data[0] ?? null
          );
        }

        return data[0] ?? null;
      });
    } catch (err) {
      console.error(
        "Failed to load scenarios:",
        err
      );

      setScenarios([]);
      setSelectedScenario(null);
      setError(
        "Unable to load scenario information."
      );
    }
  }, []);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  const selectScenario = useCallback(
    (scenario: Scenario | null) => {
      setSelectedScenario(scenario);
      setResult(null);
      setError(null);
    },
    []
  );

  const run = useCallback(
    async (
      scenario: Scenario,
      inputs: ScenarioInput = {}
    ) => {
      setLoading(true);
      setError(null);

      try {
        const scenarioResult =
          await Promise.resolve(
            runScenario(scenario, inputs)
          );

        setSelectedScenario(scenario);
        setResult(scenarioResult);

        return scenarioResult;
      } catch (err) {
        console.error(
          "Scenario execution failed:",
          err
        );

        setResult(null);
        setError(
          "Unable to calculate the scenario."
        );

        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const refresh = useCallback(() => {
    loadScenarios();
  }, [loadScenarios]);

  return {
    scenarios,
    selectedScenario,
    result,
    loading,
    error,
    selectScenario,
    run,
    refresh,
    clearResult,
  };
}