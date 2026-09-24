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
  TrendingDown,
  Waves,
  Wind,
  XCircle,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import AskSagarButton from "../components/chat/AskSagarButton";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import LoadingState from "../components/ui/LoadingState";
import useScenario from "../hooks/useScenario";
import { fetchRisk } from "../services/api/sagarApiClient";
import { useAppStore } from "../store/appStore";

import type {
  Scenario as ScenarioDefinition,
  ScenarioType,
} from "../types/scenario";

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

type CategoryId =
  | "wind"
  | "waves"
  | "lightning"
  | "departure"
  | "route_hazard"
  | "geofence"
  | "productivity";

interface ScenarioCategory {
  id: CategoryId;
  scenarioType: ScenarioType;
  icon: typeof Wind;
  title: string;
  blurb: string;
}

const CATEGORIES: ScenarioCategory[] = [
  {
    id: "wind",
    scenarioType: "weather_change",
    icon: Wind,
    title: "Wind gets stronger",
    blurb: "See how stronger winds could affect operational risk.",
  },
  {
    id: "waves",
    scenarioType: "weather_change",
    icon: Waves,
    title: "Waves become rougher",
    blurb: "See how rougher seas could affect vessel safety.",
  },
  {
    id: "lightning",
    scenarioType: "hazard_activation",
    icon: CloudLightning,
    title: "Lightning risk increases",
    blurb: "See how increased lightning risk changes the risk posture.",
  },
  {
    id: "departure",
    scenarioType: "departure_time",
    icon: Clock3,
    title: "Departure moves to tomorrow morning",
    blurb: "See how an early offshore departure shifts the risk picture.",
  },
  {
    id: "route_hazard",
    scenarioType: "route_change",
    icon: Navigation,
    title: "Route enters a hazardous area",
    blurb: "Compare the planned route against one that avoids the hazard.",
  },
  {
    id: "geofence",
    scenarioType: "geofence",
    icon: ShieldAlert,
    title: "Route crosses a restricted zone",
    blurb: "See what happens if the route approaches a protected boundary.",
  },
  {
    id: "productivity",
    scenarioType: "productivity_change",
    icon: TrendingDown,
    title: "Marine productivity decreases",
    blurb: "See how declining productivity changes fishing-zone advice.",
  },
];

const CATEGORY_MAP: Record<CategoryId, ScenarioCategory> = CATEGORIES.reduce(
  (map, category) => {
    map[category.id] = category;
    return map;
  },
  {} as Record<CategoryId, ScenarioCategory>
);

const INTENSITY_LEVELS = [
  { id: "slight", label: "Slightly stronger", percent: 10 },
  { id: "moderate", label: "Moderately stronger", percent: 20 },
  { id: "much", label: "Much stronger", percent: 40 },
];

const PRODUCTIVITY_LEVELS = [
  { id: "slight", label: "Slightly lower", percent: 10 },
  { id: "moderate", label: "Moderately lower", percent: 20 },
  { id: "much", label: "Sharply lower", percent: 35 },
];

const LIGHTNING_LEVELS = [
  { id: "low", label: "Low chance", value: "low" },
  { id: "moderate", label: "Moderate chance", value: "moderate" },
  { id: "high", label: "High chance", value: "high" },
];

function riskTone(value?: string): "success" | "warning" | "danger" | "neutral" {
  switch (value?.toLowerCase()) {
    case "low":
      return "success";
    case "moderate":
      return "warning";
    case "high":
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}

function getOperationalLabel(value: string) {
  switch (value?.toLowerCase()) {
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

function findScenarioForCategory(
  scenarios: ScenarioDefinition[],
  category: ScenarioCategory
): ScenarioDefinition | undefined {
  return scenarios.find((scenario) => scenario.type === category.scenarioType);
}

/** A real question built from the scenario actually configured on this
 * page (category + the real slider/input values) - never a second risk
 * calculation. Wind/wave/lightning/productivity map onto Chat's own
 * existing deterministic what-if detector (whatIfEngine.ts) so Sagar
 * answers with its own real comparison for the same kind of change;
 * the remaining categories (no what-if pattern for them) fall back to
 * asking about the current area's risk drivers instead of guessing at
 * a what-if phrasing Sagar wouldn't recognise. */
function buildScenarioAskSagarPrompt(
  categoryId: CategoryId,
  inputs: ScenarioInputValues
): string {
  switch (categoryId) {
    case "wind":
      return `What happens if wind speed increases by ${inputs.windIncrease}%?`;
    case "waves":
      return `What happens if wave height increases by ${inputs.waveIncrease}%?`;
    case "lightning":
      return "What happens if lightning risk becomes active?";
    case "productivity":
      return `What happens if productivity decreases by ${Math.abs(inputs.productivityChange)}%?`;
    default:
      return "Why is this area's current risk rated the way it is?";
  }
}

export default function Scenario({ embedded = false }: { embedded?: boolean }) {
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

  const selectedAreaId = useAppStore((state) => state.selectedAreaId);

  const [inputs, setInputs] = useState<ScenarioInputValues>({
    departureTime: "06:00",
    durationHours: 6,
    windIncrease: 20,
    waveIncrease: 15,
    lightningRisk: "moderate",
    productivityChange: -10,
    vesselType: "small",
  });

  const [activeCategoryId, setActiveCategoryId] = useState<CategoryId>("wind");
  const [intensity, setIntensity] = useState<string>("moderate");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [currentRisk, setCurrentRisk] = useState<{
    riskScore: number;
    riskLevel: string;
  } | null>(null);

  const activeCategory = CATEGORY_MAP[activeCategoryId];
  const selected = selectedScenario ?? scenarios[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    const matches = CATEGORIES.filter(
      (category) => category.scenarioType === selected.type
    );
    if (matches.length > 0 && !matches.some((c) => c.id === activeCategoryId)) {
      setActiveCategoryId(matches[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    let cancelled = false;

    fetchRisk({ areaId: selectedAreaId ?? undefined })
      .then((response) => {
        if (cancelled || !response.data) return;
        setCurrentRisk({
          riskScore: response.data.riskScore,
          riskLevel: response.data.riskLevel,
        });
      })
      .catch(() => {
        if (!cancelled) setCurrentRisk(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAreaId]);

  const updateInput = <Key extends keyof ScenarioInputValues>(
    key: Key,
    value: ScenarioInputValues[Key]
  ) => {
    setInputs((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSelectCategory = (category: ScenarioCategory) => {
    setActiveCategoryId(category.id);
    clearResult();

    const matched = findScenarioForCategory(scenarios, category);
    if (matched) {
      selectScenario(matched);
    }

    if (category.id === "wind" || category.id === "waves") {
      setIntensity("moderate");
      const level = INTENSITY_LEVELS[1];
      updateInput(
        category.id === "wind" ? "windIncrease" : "waveIncrease",
        level.percent
      );
    } else if (category.id === "productivity") {
      setIntensity("moderate");
      updateInput("productivityChange", -PRODUCTIVITY_LEVELS[1].percent);
    } else if (category.id === "lightning") {
      setIntensity("moderate");
      updateInput("lightningRisk", "moderate");
    }

    setScenarioOpen(false);
  };

  const handleIntensitySelect = (level: { id: string; percent: number }) => {
    setIntensity(level.id);
    if (activeCategoryId === "wind") {
      updateInput("windIncrease", level.percent);
    } else if (activeCategoryId === "waves") {
      updateInput("waveIncrease", level.percent);
    } else if (activeCategoryId === "productivity") {
      updateInput("productivityChange", -level.percent);
    }
  };

  const handleLightningSelect = (level: { id: string; value: string }) => {
    setIntensity(level.id);
    updateInput("lightningRisk", level.value);
  };

  const handleRun = async () => {
    if (!selected) return;

    await run(selected, {
      // Same area as the "current risk" fetched above, and that risk's
      // own score as the scenario's baseline - so the before/after
      // delta shown together is computed from the same starting point
      // for the same area, instead of "before" being live and "after"
      // being projected from a separate static baseline (possibly for
      // a different default area).
      areaId: selectedAreaId ?? undefined,
      baseRiskScore: currentRisk?.riskScore,
      departureTime: inputs.departureTime,
      durationHours: inputs.durationHours,
      windSpeedIncreasePercent: inputs.windIncrease,
      waveIncreasePercent: inputs.waveIncrease,
      lightningRisk: inputs.lightningRisk,
      productivityDecreasePercent: Math.abs(inputs.productivityChange),
      vesselType: inputs.vesselType,
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
    setIntensity("moderate");
    clearResult();
  };

  /** Wraps content in AppShell+PageContainer for direct route, or a plain
   *  div when rendered inside a Home SidePanel. */
  const wrapPage = (content: ReactNode) =>
    embedded ? (
      <div className="scenario-page">{content}</div>
    ) : (
      <AppShell>
        <PageContainer className="scenario-page">{content}</PageContainer>
      </AppShell>
    );

  if (loading && !selected) {
    return wrapPage(
      <div className="scenario-loading">
        <LoadingState label="Loading scenario intelligence..." />
      </div>
    );
  }

  if (error && !selected) {
    return wrapPage(
      <ErrorState
        title="Scenario engine unavailable"
        message={error}
        retry={refresh}
      />
    );
  }

  if (!selected) {
    return wrapPage(
      <EmptyState
        icon={SlidersHorizontal}
        title="No scenarios available"
        description="No scenario definitions are currently available."
        action={{
          label: "Refresh scenarios",
          onClick: refresh,
        }}
      />
    );
  }

  const resultData = result;
  const riskLevel =
    resultData?.riskLevel ?? selected.result?.riskLevel ?? "unknown";
  const riskScore =
    typeof resultData?.riskScore === "number"
      ? resultData.riskScore
      : typeof selected.result?.riskScore === "number"
        ? selected.result.riskScore
        : 0;
  const operability =
    resultData?.operability ?? selected.result?.operability ?? "review";
  const recommendation =
    resultData?.recommendation ??
    selected.result?.recommendation ??
    selected.description;
  const factors: string[] =
    resultData?.keyFactors ?? selected.result?.keyFactors ?? [];

  const delta =
    result && currentRisk ? riskScore - currentRisk.riskScore : null;
  const changeVerb =
    delta !== null && delta < 0 ? "decreases" : "increases";

  const hasIntensityLevels =
    activeCategoryId === "wind" ||
    activeCategoryId === "waves" ||
    activeCategoryId === "productivity";

  const hasLightningLevels = activeCategoryId === "lightning";

  return wrapPage(
    <>
      <header className="scenario-header">
          <div>
            <div className="scenario-eyebrow">
              <SlidersHorizontal size={14} />
              <span>Decision Simulation</span>
            </div>
            <h1>What-If Analysis</h1>
            <p>
              Simulate shifting sea conditions or alternative departures to measure
              their impact on marine operational risk.
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
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw size={14} />
              Reset
            </Button>
          </div>
        </header>

        {error && (
          <div className="scenario-error">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        <div className="scenario-layout">
          <main className="scenario-main">
            {/* STEP 1: CATEGORY SELECTION */}
            <section className="scenario-panel">
              <div className="scenario-panel-header">
                <div>
                  <span className="scenario-step-badge">Step 1</span>
                  <h2>Choose a scenario to test</h2>
                </div>
              </div>

              {/* Mobile selector trigger */}
              <button
                type="button"
                className="scenario-mobile-selector"
                onClick={() => setScenarioOpen((current) => !current)}
              >
                <div className="scenario-mobile-selector-icon">
                  <activeCategory.icon size={16} />
                </div>
                <div>
                  <span>Selected situation</span>
                  <strong>{activeCategory.title}</strong>
                </div>
                <ChevronDown
                  size={16}
                  className={`scenario-chevron ${scenarioOpen ? "open" : ""}`}
                />
              </button>

              {scenarioOpen && (
                <div className="scenario-mobile-list">
                  {CATEGORIES.map((category) => {
                    const Icon = category.icon;
                    const active = category.id === activeCategoryId;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        className={`scenario-list-item ${active ? "active" : ""}`}
                        onClick={() => handleSelectCategory(category)}
                      >
                        <Icon size={16} />
                        <div>
                          <strong>{category.title}</strong>
                          <span>{category.blurb}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Desktop category cards */}
              <div className="scenario-category-grid">
                {CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  const active = category.id === activeCategoryId;

                  return (
                    <button
                      key={category.id}
                      type="button"
                      className={`scenario-category-card ${active ? "active" : ""}`}
                      onClick={() => handleSelectCategory(category)}
                    >
                      <div className="scenario-category-icon">
                        <Icon size={18} />
                      </div>
                      <div className="scenario-category-content">
                        <strong>{category.title}</strong>
                        <p>{category.blurb}</p>
                      </div>
                      {active && (
                        <CheckCircle2
                          size={16}
                          className="scenario-selected-check"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* STEP 2: INTENSITY / LIKELIHOOD */}
            {(hasIntensityLevels || hasLightningLevels) && (
              <section className="scenario-panel">
                <div className="scenario-panel-header">
                  <div>
                    <span className="scenario-step-badge">Step 2</span>
                    <h2>
                      {hasLightningLevels
                        ? "Select likelihood"
                        : "Select change intensity"}
                    </h2>
                  </div>
                </div>

                <div className="scenario-intensity-row">
                  {hasLightningLevels
                    ? LIGHTNING_LEVELS.map((level) => (
                        <button
                          key={level.id}
                          type="button"
                          className={`scenario-intensity-pill ${
                            intensity === level.id ? "active" : ""
                          }`}
                          onClick={() => handleLightningSelect(level)}
                        >
                          {level.label}
                        </button>
                      ))
                    : (activeCategoryId === "productivity"
                        ? PRODUCTIVITY_LEVELS
                        : INTENSITY_LEVELS
                      ).map((level) => (
                        <button
                          key={level.id}
                          type="button"
                          className={`scenario-intensity-pill ${
                            intensity === level.id ? "active" : ""
                          }`}
                          onClick={() => handleIntensitySelect(level)}
                        >
                          {level.label}
                        </button>
                      ))}
                </div>
              </section>
            )}

            {/* EXECUTION PANEL */}
            <section className="scenario-panel">
              <div className="scenario-panel-header">
                <div>
                  <span className="scenario-step-badge">Execution</span>
                  <h2>{activeCategory.title}</h2>
                </div>
              </div>

              <p className="scenario-description">{activeCategory.blurb}</p>

              {currentRisk && (
                <div className="scenario-current-preview">
                  <span>Current Baseline Risk:</span>
                  <strong>{currentRisk.riskScore}/100</strong>
                  <Badge tone={riskTone(currentRisk.riskLevel)} size="sm">
                    {currentRisk.riskLevel.toUpperCase()}
                  </Badge>
                </div>
              )}

              <details
                className="scenario-advanced"
                open={detailsOpen}
                onToggle={(event) =>
                  setDetailsOpen((event.target as HTMLDetailsElement).open)
                }
              >
                <summary>
                  <SlidersHorizontal size={14} />
                  Advanced Parameter Overrides
                </summary>

                <div className="scenario-input-grid">
                  <label className="scenario-input-field">
                    <span>Departure Time</span>
                    <input
                      type="time"
                      value={inputs.departureTime}
                      onChange={(event) =>
                        updateInput("departureTime", event.target.value)
                      }
                    />
                  </label>

                  <label className="scenario-input-field">
                    <span>Duration (hours)</span>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={inputs.durationHours}
                      onChange={(event) =>
                        updateInput("durationHours", Number(event.target.value))
                      }
                    />
                  </label>

                  <label className="scenario-input-field">
                    <span>Wind Speed Increase (%)</span>
                    <div className="scenario-range-row">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={inputs.windIncrease}
                        onChange={(event) =>
                          updateInput("windIncrease", Number(event.target.value))
                        }
                      />
                      <strong>{inputs.windIncrease}%</strong>
                    </div>
                  </label>

                  <label className="scenario-input-field">
                    <span>Wave Height Increase (%)</span>
                    <div className="scenario-range-row">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={inputs.waveIncrease}
                        onChange={(event) =>
                          updateInput("waveIncrease", Number(event.target.value))
                        }
                      />
                      <strong>{inputs.waveIncrease}%</strong>
                    </div>
                  </label>

                  <label className="scenario-input-field">
                    <span>Lightning Risk</span>
                    <select
                      value={inputs.lightningRisk}
                      onChange={(event) =>
                        updateInput("lightningRisk", event.target.value)
                      }
                    >
                      <option value="low">Low</option>
                      <option value="moderate">Moderate</option>
                      <option value="high">High</option>
                    </select>
                  </label>

                  <label className="scenario-input-field">
                    <span>Vessel Type</span>
                    <select
                      value={inputs.vesselType}
                      onChange={(event) =>
                        updateInput("vesselType", event.target.value)
                      }
                    >
                      <option value="small">Small vessel (&lt; 12m)</option>
                      <option value="medium">Medium vessel (12-24m)</option>
                      <option value="large">Large vessel (&gt; 24m)</option>
                    </select>
                  </label>
                </div>
              </details>

              <div className="scenario-run-row">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRun}
                  disabled={loading}
                >
                  <Sparkles size={15} />
                  {loading ? "Calculating..." : "Run scenario"}
                </Button>
                <span className="scenario-run-note">
                  Calculated using Sagar's configured marine, weather and boundary datasets.
                </span>
              </div>
            </section>

            {/* SIMULATION RESULTS */}
            {result && (
              <section className="scenario-result">
                <header className="scenario-result-header">
                  <div>
                    <span className="scenario-step-badge">Result Overview</span>
                    <h2>Simulation Outcome</h2>
                  </div>
                  <Badge tone={riskTone(riskLevel)} size="sm">
                    {riskLevel.toUpperCase()}
                  </Badge>
                </header>

                {currentRisk && delta !== null && (
                  <div className="scenario-compare">
                    <div className="scenario-compare-col">
                      <span>Baseline</span>
                      <strong>
                        {currentRisk.riskScore}
                        <small>/100</small>
                      </strong>
                      <Badge tone={riskTone(currentRisk.riskLevel)} size="sm">
                        {currentRisk.riskLevel.toUpperCase()}
                      </Badge>
                    </div>

                    <ArrowRight size={18} className="scenario-compare-arrow" />

                    <div className="scenario-compare-col">
                      <span>Simulated</span>
                      <strong>
                        {riskScore}
                        <small>/100</small>
                      </strong>
                      <Badge tone={riskTone(riskLevel)} size="sm">
                        {riskLevel.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="scenario-compare-change">
                      <span>Shift</span>
                      <strong
                        className={
                          delta > 0
                            ? "scenario-change-up"
                            : delta < 0
                              ? "scenario-change-down"
                              : ""
                        }
                      >
                        {delta === 0
                          ? "No change"
                          : `${delta > 0 ? "+" : ""}${delta} points`}
                      </strong>
                    </div>
                  </div>
                )}

                <p className="scenario-conversational">
                  {currentRisk && delta !== null
                    ? `Operational risk ${changeVerb} from ${currentRisk.riskScore}/100 to ${riskScore}/100 under this scenario.`
                    : `Projected operational risk score: ${riskScore}/100.`}
                </p>

                <div className="scenario-result-score">
                  <div className="scenario-score-block">
                    <span>Simulated Risk Score</span>
                    <strong>
                      {riskScore}
                      <small>/100</small>
                    </strong>
                  </div>

                  <div className="scenario-result-bar">
                    <span
                      className={`scenario-risk-${riskLevel.toLowerCase()}`}
                      style={{
                        width: `${Math.min(100, Math.max(0, riskScore))}%`,
                      }}
                    />
                  </div>

                  <div className="scenario-operability">
                    <span>Advisory</span>
                    <strong>{getOperationalLabel(operability)}</strong>
                  </div>
                </div>

                <div className="scenario-recommendation">
                  {operability === "blocked" || operability === "avoid" ? (
                    <XCircle size={20} className="icon-avoid" />
                  ) : operability === "caution" ? (
                    <AlertTriangle size={20} className="icon-caution" />
                  ) : (
                    <CheckCircle2 size={20} className="icon-safe" />
                  )}
                  <div>
                    <span>Recommendation</span>
                    <p>{recommendation}</p>
                  </div>
                </div>

                {factors.length > 0 && (
                  <div className="scenario-factors">
                    <div className="scenario-factors-heading">
                      <ShieldAlert size={14} />
                      <span>Key Drivers &amp; Factors</span>
                    </div>
                    <div className="scenario-factor-list">
                      {factors.map((factor) => (
                        <div key={factor} className="scenario-factor">
                          <CheckCircle2 size={13} />
                          <span>{factor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <AskSagarButton
                  prompt={buildScenarioAskSagarPrompt(activeCategoryId, inputs)}
                  label="Ask Sagar: what changed?"
                  className="scenario-ask-sagar-btn"
                  fullWidth
                />
              </section>
            )}
          </main>

          {/* SIDEBAR */}
          <aside className="scenario-sidebar">
            <section className="scenario-side-panel">
              <div className="scenario-side-icon">
                <Sparkles size={16} />
              </div>
              <h3>How Sagar Reasons</h3>
              <p>
                The scenario engine evaluates condition changes against physical
                bathymetric data, localized hazards, and vessel-specific seaworthiness limits.
              </p>
              <div className="scenario-flow">
                <FlowStep icon={SlidersHorizontal} label="Scenario" />
                <ArrowRight size={13} />
                <FlowStep icon={Waves} label="Marine Context" />
                <ArrowRight size={13} />
                <FlowStep icon={ShieldAlert} label="Risk Model" />
                <ArrowRight size={13} />
                <FlowStep icon={Navigation} label="Advisory" />
              </div>
            </section>

            <section className="scenario-side-panel scenario-help-panel">
              <div className="scenario-side-icon">
                <AlertTriangle size={16} />
              </div>
              <h3>Operational Guidance</h3>
              <p>
                What-if projections are designed for planning and risk comparison only.
                Always prioritize real-time broadcast warnings over simulated outputs.
              </p>
            </section>
          </aside>
        </div>
    </>
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
      <Icon size={13} />
      <span>{label}</span>
    </div>
  );
}