import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CloudLightning,
  Navigation,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Waves,
  Wind,
  XCircle,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import LoadingState from "../components/ui/LoadingState";
import useScenario from "../hooks/useScenario";

import "./Scenario.css";

type ScenarioInputValues = {
  departureTime: string;
  durationHours: number;
  windIncrease: number;
  waveIncrease: number;
  lightningRisk: string;
  productivityChange: number;
  vesselType: string;
};

function riskTone(
  value: string,
) {
  switch (value) {
    case "low":
      return "success" as const;

    case "moderate":
      return "warning" as const;

    case "high":
    case "critical":
      return "danger" as const;

    default:
      return "neutral" as const;
  }
}

function formatScenarioType(
  value: string,
) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function getScenarioIcon(
  value: string,
) {
  switch (value) {
    case "weather_change":
      return Wind;

    case "hazard_activation":
      return CloudLightning;

    case "route_change":
      return Navigation;

    case "productivity_change":
      return Waves;

    case "geofence":
      return ShieldAlert;

    case "departure_time":
      return Clock3;

    default:
      return SlidersHorizontal;
  }
}

function getOperationalLabel(
  value: string,
) {
  switch (value) {
    case "suitable":
    case "proceed":
      return "Proceed";

    case "caution":
      return "Use caution";

    case "avoid":
      return "Avoid";

    case "blocked":
      return "Blocked";

    default:
      return value || "Review";
  }
}

export default function Scenario() {
  const {
    scenarios,
    selectedScenario,
    result,
    loading,
    error,
    selectScenario,
    run,
    refresh,
    clearResult,
  } = useScenario();

  const [inputs, setInputs] =
    useState<ScenarioInputValues>({
      departureTime: "06:00",
      durationHours: 6,
      windIncrease: 20,
      waveIncrease: 15,
      lightningRisk: "moderate",
      productivityChange: -10,
      vesselType: "small",
    });

  const [scenarioOpen, setScenarioOpen] =
    useState(false);

  const selected =
    selectedScenario ??
    scenarios[0] ??
    null;

  const selectedIndex = useMemo(() => {
    if (!selected) {
      return -1;
    }

    return scenarios.findIndex(
      (scenario) =>
        scenario.id === selected.id,
    );
  }, [scenarios, selected]);

  const updateInput = <
    Key extends keyof ScenarioInputValues,
  >(
    key: Key,
    value: ScenarioInputValues[Key],
  ) => {
    setInputs((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleRun = async () => {
    if (!selected) {
      return;
    }

    await run(selected, {
      departureTime:
        inputs.departureTime,
      durationHours:
        inputs.durationHours,
      windSpeedIncreasePercent:
        inputs.windIncrease,
      waveIncreasePercent:
        inputs.waveIncrease,
      lightningRisk:
        inputs.lightningRisk,
      productivityDecreasePercent:
        Math.abs(
          inputs.productivityChange,
        ),
      vesselType:
        inputs.vesselType,
    });
  };

  const handleReset = () => {
    setInputs({
      departureTime: "06:00",
      durationHours: 6,
      windIncrease: 20,
      waveIncrease: 15,
      lightningRisk: "moderate",
      productivityChange: -10,
      vesselType: "small",
    });

    clearResult();
  };

  if (loading && !selected) {
    return (
      <AppShell>
        <PageContainer className="scenario-page">
          <div className="scenario-loading">
            <LoadingState
              label="Loading scenario intelligence..."
            />
          </div>
        </PageContainer>
      </AppShell>
    );
  }

  if (error && !selected) {
    return (
      <AppShell>
        <PageContainer className="scenario-page">
          <ErrorState
            title="Scenario engine unavailable"
            message={error}
            retry={refresh}
          />
        </PageContainer>
      </AppShell>
    );
  }

  if (!selected) {
    return (
      <AppShell>
        <PageContainer className="scenario-page">
          <EmptyState
            icon={SlidersHorizontal}
            title="No scenarios available"
            description="No scenario definitions are currently available."
            action={{
              label: "Refresh scenarios",
              onClick: refresh,
            }}
          />
        </PageContainer>
      </AppShell>
    );
  }

  const ScenarioIcon =
    getScenarioIcon(
      selected.type,
    );

  const resultData =
    result;

  const riskLevel =
    resultData?.riskLevel ??
    selected.result?.riskLevel ??
    "unknown";

  const riskScore =
    typeof resultData?.riskScore ===
    "number"
      ? resultData.riskScore
      : typeof selected.result
            ?.riskScore === "number"
        ? selected.result.riskScore
        : 0;

  const operability =
    resultData?.operability ??
    selected.result?.operability ??
    "review";

  const recommendation =
    resultData?.recommendation ??
    selected.result?.recommendation ??
    selected.description;

  const factors: string[] =
    resultData?.keyFactors ??
    selected.result?.keyFactors ??
    [];

  return (
    <AppShell>
      <PageContainer className="scenario-page">
        <header className="scenario-header">
          <div>
            <div className="scenario-eyebrow">
              <SlidersHorizontal
                size={14}
              />
              Decision simulation
            </div>

            <h1>What-If Analysis</h1>

            <p>
              Test changing marine conditions
              and understand how they affect
              operational risk.
            </p>
          </div>

          <div className="scenario-header-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={refresh}
              disabled={loading}
            >
              Refresh
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
            >
              <RotateCcw size={15} />
              Reset
            </Button>
          </div>
        </header>

        {error && (
          <div className="scenario-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="scenario-layout">
          <main className="scenario-main">
            <section className="scenario-panel scenario-selection-panel">
              <div className="scenario-panel-header">
                <div>
                  <span>
                    Scenario library
                  </span>

                  <h2>
                    Choose a situation
                  </h2>
                </div>

                <span>
                  {selectedIndex + 1} /{" "}
                  {scenarios.length}
                </span>
              </div>

              <button
                type="button"
                className="scenario-mobile-selector"
                onClick={() =>
                  setScenarioOpen(
                    (current) => !current,
                  )
                }
              >
                <div className="scenario-mobile-selector-icon">
                  <ScenarioIcon size={17} />
                </div>

                <div>
                  <span>
                    Selected scenario
                  </span>

                  <strong>
                    {selected.name}
                  </strong>
                </div>

                <ChevronDown
                  size={16}
                  className={
                    scenarioOpen
                      ? "scenario-chevron open"
                      : "scenario-chevron"
                  }
                />
              </button>

              {scenarioOpen && (
                <div className="scenario-mobile-list">
                  {scenarios.map(
                    (scenario) => {
                      const Icon =
                        getScenarioIcon(
                          scenario.type,
                        );

                      const active =
                        scenario.id ===
                        selected.id;

                      return (
                        <button
                          key={scenario.id}
                          type="button"
                          className={
                            active
                              ? "scenario-list-item active"
                              : "scenario-list-item"
                          }
                          onClick={() => {
                            selectScenario(
                              scenario,
                            );
                            setScenarioOpen(
                              false,
                            );
                          }}
                        >
                          <Icon size={16} />

                          <div>
                            <strong>
                              {scenario.name}
                            </strong>

                            <span>
                              {formatScenarioType(
                                scenario.type,
                              )}
                            </span>
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              )}

              <div className="scenario-grid">
                {scenarios.map(
                  (scenario) => {
                    const Icon =
                      getScenarioIcon(
                        scenario.type,
                      );

                    const active =
                      scenario.id ===
                      selected.id;

                    return (
                      <button
                        key={scenario.id}
                        type="button"
                        className={
                          active
                            ? "scenario-card active"
                            : "scenario-card"
                        }
                        onClick={() =>
                          selectScenario(
                            scenario,
                          )
                        }
                      >
                        <div className="scenario-card-icon">
                          <Icon
                            size={17}
                          />
                        </div>

                        <div className="scenario-card-content">
                          <span>
                            {formatScenarioType(
                              scenario.type,
                            )}
                          </span>

                          <strong>
                            {scenario.name}
                          </strong>

                          <p>
                            {
                              scenario.description
                            }
                          </p>
                        </div>

                        {active && (
                          <CheckCircle2
                            size={16}
                            className="scenario-selected-check"
                          />
                        )}
                      </button>
                    );
                  },
                )}
              </div>
            </section>

            <section className="scenario-panel">
              <div className="scenario-panel-header">
                <div>
                  <span>
                    Scenario inputs
                  </span>

                  <h2>
                    {selected.name}
                  </h2>
                </div>

                <Badge
                  tone="violet"
                  size="sm"
                >
                  {formatScenarioType(
                    selected.type,
                  )}
                </Badge>
              </div>

              <p className="scenario-description">
                {selected.description}
              </p>

              <div className="scenario-input-grid">
                <label className="scenario-input-field">
                  <span>
                    Departure time
                  </span>

                  <input
                    type="time"
                    value={
                      inputs.departureTime
                    }
                    onChange={(event) =>
                      updateInput(
                        "departureTime",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label className="scenario-input-field">
                  <span>
                    Duration (hours)
                  </span>

                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={
                      inputs.durationHours
                    }
                    onChange={(event) =>
                      updateInput(
                        "durationHours",
                        Number(
                          event.target.value,
                        ),
                      )
                    }
                  />
                </label>

                <label className="scenario-input-field">
                  <span>
                    Wind increase
                  </span>

                  <div className="scenario-range-row">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={
                        inputs.windIncrease
                      }
                      onChange={(event) =>
                        updateInput(
                          "windIncrease",
                          Number(
                            event.target.value,
                          ),
                        )
                      }
                    />

                    <strong>
                      {inputs.windIncrease}%
                    </strong>
                  </div>
                </label>

                <label className="scenario-input-field">
                  <span>
                    Wave increase
                  </span>

                  <div className="scenario-range-row">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={
                        inputs.waveIncrease
                      }
                      onChange={(event) =>
                        updateInput(
                          "waveIncrease",
                          Number(
                            event.target.value,
                          ),
                        )
                      }
                    />

                    <strong>
                      {inputs.waveIncrease}%
                    </strong>
                  </div>
                </label>

                <label className="scenario-input-field">
                  <span>
                    Lightning risk
                  </span>

                  <select
                    value={
                      inputs.lightningRisk
                    }
                    onChange={(event) =>
                      updateInput(
                        "lightningRisk",
                        event.target.value,
                      )
                    }
                  >
                    <option value="low">
                      Low
                    </option>
                    <option value="moderate">
                      Moderate
                    </option>
                    <option value="high">
                      High
                    </option>
                  </select>
                </label>

                <label className="scenario-input-field">
                  <span>
                    Vessel type
                  </span>

                  <select
                    value={
                      inputs.vesselType
                    }
                    onChange={(event) =>
                      updateInput(
                        "vesselType",
                        event.target.value,
                      )
                    }
                  >
                    <option value="small">
                      Small vessel
                    </option>
                    <option value="medium">
                      Medium vessel
                    </option>
                    <option value="large">
                      Large vessel
                    </option>
                  </select>
                </label>
              </div>

              <div className="scenario-run-row">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleRun}
                  disabled={loading}
                >
                  <Sparkles size={16} />

                  {loading
                    ? "Calculating..."
                    : "Run scenario"}
                </Button>

                <span>
                  The scenario engine evaluates
                  the selected changes against
                  the available marine context.
                </span>
              </div>
            </section>

            {result && (
              <section className="scenario-result">
                <div className="scenario-result-header">
                  <div>
                    <span>
                      Simulation result
                    </span>

                    <h2>
                      Operational assessment
                    </h2>
                  </div>

                  <Badge
                    tone={riskTone(
                      riskLevel,
                    )}
                    size="md"
                  >
                    {riskLevel.toUpperCase()}
                  </Badge>
                </div>

                <div className="scenario-result-score">
                  <div>
                    <span>
                      Risk score
                    </span>

                    <strong>
                      {riskScore}
                      <small>
                        /100
                      </small>
                    </strong>
                  </div>

                  <div className="scenario-result-bar">
                    <span
                      className={`scenario-risk-${riskLevel}`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            riskScore,
                          ),
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="scenario-operability">
                    <span>
                      Operating decision
                    </span>

                    <strong>
                      {getOperationalLabel(
                        operability,
                      )}
                    </strong>
                  </div>
                </div>

                <div className="scenario-recommendation">
                  {operability ===
                    "blocked" ||
                  operability === "avoid" ? (
                    <XCircle size={18} />
                  ) : operability ===
                    "caution" ? (
                    <AlertTriangle
                      size={18}
                    />
                  ) : (
                    <CheckCircle2
                      size={18}
                    />
                  )}

                  <div>
                    <span>
                      Recommendation
                    </span>

                    <p>
                      {recommendation}
                    </p>
                  </div>
                </div>

                {factors.length > 0 && (
                  <div className="scenario-factors">
                    <div className="scenario-factors-heading">
                      <ShieldAlert
                        size={15}
                      />

                      <span>
                        Key factors
                      </span>
                    </div>

                    <div className="scenario-factor-list">
                      {factors.map(
                        (factor) => (
                          <div
                            key={factor}
                            className="scenario-factor"
                          >
                            <CheckCircle2
                              size={13}
                            />
                            <span>
                              {factor}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
          </main>

          <aside className="scenario-sidebar">
            <section className="scenario-side-panel">
              <div className="scenario-side-icon">
                <Sparkles size={18} />
              </div>

              <h3>
                How Sagar reasons
              </h3>

              <p>
                The scenario engine compares the
                selected change with marine
                conditions, hazards, operational
                constraints and route context.
              </p>

              <div className="scenario-flow">
                <FlowStep
                  icon={SlidersHorizontal}
                  label="Scenario inputs"
                />

                <ArrowRight
                  size={13}
                />

                <FlowStep
                  icon={Waves}
                  label="Marine context"
                />

                <ArrowRight
                  size={13}
                />

                <FlowStep
                  icon={ShieldAlert}
                  label="Risk assessment"
                />

                <ArrowRight
                  size={13}
                />

                <FlowStep
                  icon={Navigation}
                  label="Recommendation"
                />
              </div>
            </section>

            <section className="scenario-side-panel">
              <div className="scenario-side-heading">
                <Clock3 size={15} />

                <div>
                  <span>
                    Current scenario
                  </span>

                  <strong>
                    {selected.name}
                  </strong>
                </div>
              </div>

              <div className="scenario-side-details">
                <div>
                  <span>
                    Departure
                  </span>
                  <strong>
                    {inputs.departureTime}
                  </strong>
                </div>

                <div>
                  <span>
                    Duration
                  </span>
                  <strong>
                    {inputs.durationHours} hr
                  </strong>
                </div>

                <div>
                  <span>
                    Wind change
                  </span>
                  <strong>
                    +{inputs.windIncrease}%
                  </strong>
                </div>

                <div>
                  <span>
                    Wave change
                  </span>
                  <strong>
                    +{inputs.waveIncrease}%
                  </strong>
                </div>
              </div>
            </section>

            <section className="scenario-side-panel scenario-help-panel">
              <div className="scenario-side-icon">
                <AlertTriangle
                  size={18}
                />
              </div>

              <h3>
                Decision support
              </h3>

              <p>
                A simulated result should be used
                to compare choices. It should not
                override current official marine
                warnings.
              </p>
            </section>
          </aside>
        </div>
      </PageContainer>
    </AppShell>
  );
}

function FlowStep({
  icon: Icon,
  label,
}: {
  icon: typeof SlidersHorizontal;
  label: string;
}) {
  return (
    <div className="scenario-flow-step">
      <Icon size={14} />
      <span>{label}</span>
    </div>
  );
}