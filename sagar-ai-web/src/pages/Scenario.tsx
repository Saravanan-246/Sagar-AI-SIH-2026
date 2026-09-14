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
import {
  useEffect,
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
import { fetchRisk } from "../services/api/sagarApiClient";
import { useAppStore } from "../store/appStore";

import type { Scenario as ScenarioDefinition, ScenarioType } from "../types/scenario";

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

// One human-friendly category per scenario the existing library actually
// supports - no new scenarios, just plain-language framing of the same
// six definitions from data/scenarios.json.
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
    blurb: "See how increased lightning risk could change the decision.",
  },
  {
    id: "departure",
    scenarioType: "departure_time",
    icon: Clock3,
    title: "Departure moves to tomorrow morning",
    blurb: "See how an early offshore departure changes the risk picture.",
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
    blurb: "See what happens if the route enters a protected boundary.",
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

// "How much" choices, mapped to the exact percentage fields the existing
// scenario engine already accepts (see scenarioEngine.ts's own 20%/15%
// defaults and the "Strong Wind Increase" library scenario's 40%) - no
// new values invented, just plain labels for numbers already in use.
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

function riskTone(
  value?: string,
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

function findScenarioForCategory(
  scenarios: ScenarioDefinition[],
  category: ScenarioCategory,
): ScenarioDefinition | undefined {
  return scenarios.find(
    (scenario) => scenario.type === category.scenarioType,
  );
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

  const selectedAreaId = useAppStore(
    (state) => state.selectedAreaId,
  );

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

  const [activeCategoryId, setActiveCategoryId] =
    useState<CategoryId>("wind");

  const [intensity, setIntensity] =
    useState<string>("moderate");

  const [detailsOpen, setDetailsOpen] =
    useState(false);

  const [scenarioOpen, setScenarioOpen] =
    useState(false);

  const [currentRisk, setCurrentRisk] = useState<{
    riskScore: number;
    riskLevel: string;
  } | null>(null);

  const activeCategory = CATEGORY_MAP[activeCategoryId];

  const selected =
    selectedScenario ??
    scenarios[0] ??
    null;

  // Keep the friendly category selector and the underlying scenario in
  // sync - if scenarios load after the page renders, or the user picks a
  // scenario via the mobile/legacy selector, reflect it as a category.
  useEffect(() => {
    if (!selected) {
      return;
    }

    const matches = CATEGORIES.filter(
      (category) => category.scenarioType === selected.type,
    );

    if (matches.length > 0 && !matches.some((c) => c.id === activeCategoryId)) {
      setActiveCategoryId(matches[0].id);
    }
    // Only re-sync when the underlying scenario identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // The current (no-change) baseline risk for comparison - uses the same
  // existing /api/risk endpoint the rest of the app already relies on,
  // never a fabricated number. If it can't be resolved, the comparison
  // simply doesn't render rather than guessing.
  useEffect(() => {
    let cancelled = false;

    fetchRisk({ areaId: selectedAreaId ?? undefined })
      .then((response) => {
        if (cancelled || !response.data) {
          return;
        }

        setCurrentRisk({
          riskScore: response.data.riskScore,
          riskLevel: response.data.riskLevel,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentRisk(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAreaId]);

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

  const handleSelectCategory = (
    category: ScenarioCategory,
  ) => {
    setActiveCategoryId(category.id);
    clearResult();

    const matched = findScenarioForCategory(
      scenarios,
      category,
    );

    if (matched) {
      selectScenario(matched);
    }

    if (category.id === "wind" || category.id === "waves") {
      setIntensity("moderate");
      const level = INTENSITY_LEVELS[1];
      updateInput(
        category.id === "wind" ? "windIncrease" : "waveIncrease",
        level.percent,
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

  const handleIntensitySelect = (
    level: { id: string; percent: number },
  ) => {
    setIntensity(level.id);

    if (activeCategoryId === "wind") {
      updateInput("windIncrease", level.percent);
    } else if (activeCategoryId === "waves") {
      updateInput("waveIncrease", level.percent);
    } else if (activeCategoryId === "productivity") {
      updateInput("productivityChange", -level.percent);
    }
  };

  const handleLightningSelect = (
    level: { id: string; value: string },
  ) => {
    setIntensity(level.id);
    updateInput("lightningRisk", level.value);
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

    setIntensity("moderate");
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

  const delta =
    result && currentRisk
      ? riskScore - currentRisk.riskScore
      : null;

  const changeVerb =
    delta !== null && delta < 0 ? "decreases" : "increases";

  const hasIntensityLevels =
    activeCategoryId === "wind" ||
    activeCategoryId === "waves" ||
    activeCategoryId === "productivity";

  const hasLightningLevels =
    activeCategoryId === "lightning";

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
              Choose a situation you want to
              test - Sagar will tell you how it
              changes the operational risk.
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
                    Step 1
                  </span>

                  <h2>
                    What would you like to test?
                  </h2>
                </div>
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
                  <activeCategory.icon size={17} />
                </div>

                <div>
                  <span>
                    Selected situation
                  </span>

                  <strong>
                    {activeCategory.title}
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
                  {CATEGORIES.map((category) => {
                    const Icon = category.icon;
                    const active = category.id === activeCategoryId;

                    return (
                      <button
                        key={category.id}
                        type="button"
                        className={
                          active
                            ? "scenario-list-item active"
                            : "scenario-list-item"
                        }
                        onClick={() => handleSelectCategory(category)}
                      >
                        <Icon size={16} />

                        <div>
                          <strong>
                            {category.title}
                          </strong>

                          <span>
                            {category.blurb}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="scenario-category-grid">
                {CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  const active = category.id === activeCategoryId;

                  return (
                    <button
                      key={category.id}
                      type="button"
                      className={
                        active
                          ? "scenario-category-card active"
                          : "scenario-category-card"
                      }
                      onClick={() => handleSelectCategory(category)}
                    >
                      <div className="scenario-category-icon">
                        <Icon size={17} />
                      </div>

                      <div className="scenario-category-content">
                        <strong>
                          {category.title}
                        </strong>

                        <p>
                          {category.blurb}
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
                })}
              </div>
            </section>

            {(hasIntensityLevels || hasLightningLevels) && (
              <section className="scenario-panel">
                <div className="scenario-panel-header">
                  <div>
                    <span>
                      Step 2
                    </span>

                    <h2>
                      {hasLightningLevels
                        ? "How likely?"
                        : "How much stronger?"}
                    </h2>
                  </div>
                </div>

                <div className="scenario-intensity-row">
                  {hasLightningLevels
                    ? LIGHTNING_LEVELS.map((level) => (
                        <button
                          key={level.id}
                          type="button"
                          className={
                            intensity === level.id
                              ? "scenario-intensity-pill active"
                              : "scenario-intensity-pill"
                          }
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
                          className={
                            intensity === level.id
                              ? "scenario-intensity-pill active"
                              : "scenario-intensity-pill"
                          }
                          onClick={() => handleIntensitySelect(level)}
                        >
                          {level.label}
                        </button>
                      ))}
                </div>
              </section>
            )}

            <section className="scenario-panel">
              <div className="scenario-panel-header">
                <div>
                  <span>
                    Ready to test
                  </span>

                  <h2>
                    {activeCategory.title}
                  </h2>
                </div>
              </div>

              <p className="scenario-description">
                {activeCategory.blurb}
              </p>

              {currentRisk && (
                <div className="scenario-current-preview">
                  <span>Current conditions</span>
                  <strong>
                    {currentRisk.riskScore}/100
                  </strong>
                  <Badge
                    tone={riskTone(currentRisk.riskLevel)}
                    size="sm"
                  >
                    {currentRisk.riskLevel.toUpperCase()}
                  </Badge>
                </div>
              )}

              <details
                className="scenario-advanced"
                open={detailsOpen}
                onToggle={(event) =>
                  setDetailsOpen(
                    (event.target as HTMLDetailsElement).open,
                  )
                }
              >
                <summary>
                  <SlidersHorizontal size={13} />
                  View technical inputs
                </summary>

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
              </details>

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
                      {activeCategory.title}
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

                {currentRisk && delta !== null && (
                  <div className="scenario-compare">
                    <div className="scenario-compare-col">
                      <span>Current</span>
                      <strong>
                        {currentRisk.riskScore}
                        <small>/100</small>
                      </strong>
                      <Badge
                        tone={riskTone(currentRisk.riskLevel)}
                        size="sm"
                      >
                        {currentRisk.riskLevel.toUpperCase()}
                      </Badge>
                    </div>

                    <ArrowRight
                      size={18}
                      className="scenario-compare-arrow"
                    />

                    <div className="scenario-compare-col">
                      <span>Scenario</span>
                      <strong>
                        {riskScore}
                        <small>/100</small>
                      </strong>
                      <Badge
                        tone={riskTone(riskLevel)}
                        size="sm"
                      >
                        {riskLevel.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="scenario-compare-change">
                      <span>Change</span>
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
                    ? `Risk ${changeVerb} from ${currentRisk.riskScore}/100 to ${riskScore}/100 if the selected ${activeCategory.title.toLowerCase()} occurs.`
                    : `Estimated risk if the selected ${activeCategory.title.toLowerCase()} occurs: ${riskScore}/100.`}
                </p>

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
                  label="Situation chosen"
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
