import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CloudRain,
  CloudLightning,
  Compass,
  Droplets,
  Map,
  MapPin,
  Navigation,
  ShieldCheck,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import ErrorState from "../components/ui/ErrorState";
import MarineMetric from "../components/marine/MarineMetric";
import RiskIndicator from "../components/marine/RiskIndicator";
import SituationPanel from "../components/marine/SituationPanel";
import { useMarineArea } from "../hooks/useMarineData";
import { ROUTES } from "../constants/routes";

import "./Area.css";

function formatNumber(
  value: number | undefined,
  digits = 1,
) {
  if (typeof value !== "number") {
    return "—";
  }

  return value.toFixed(digits);
}

function getConditionTone(
  risk: string,
) {
  switch (risk) {
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

function getHazardTone(
  risk: string,
) {
  switch (risk) {
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

export default function Area() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const {
    area,
    loading,
    error,
    refresh,
  } = useMarineArea(id);

  if (loading) {
    return (
      <AppShell>
        <PageContainer className="area-page">
          <div className="area-loading">
            <LoadingState
              label="Loading marine conditions..."
            />
          </div>
        </PageContainer>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <PageContainer className="area-page">
          <ErrorState
            title="Unable to load area"
            message={error}
            retry={refresh}
          />
        </PageContainer>
      </AppShell>
    );
  }

  if (!area) {
    return (
      <AppShell>
        <PageContainer className="area-page">
          <EmptyState
            icon={MapPin}
            title="Marine area not found"
            description="The requested marine area is not available in the current data set."
            action={{
              label: "Back to marine map",
              onClick: () =>
                navigate(ROUTES.MAP),
            }}
          />
        </PageContainer>
      </AppShell>
    );
  }

  const riskScore =
    area.safety?.riskScore ?? 0;

  const riskLevel =
    area.safety?.overallRisk ?? "unknown";

  const conditions =
    area.conditions;

  const tide =
    area.tide;

  const indicators =
    area.marineIndicators;

  const hazards =
    area.hazards;

  return (
    <AppShell>
      <PageContainer className="area-page">
        <div className="area-topbar">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={16} />
            Back
          </Button>

          <div className="area-topbar-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                navigate(ROUTES.MAP)
              }
            >
              <Map size={15} />
              Open map
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                navigate(ROUTES.ROUTE)
              }
            >
              <Navigation size={15} />
              Plan route
            </Button>
          </div>
        </div>

        <section className="area-hero">
          <div className="area-hero-main">
            <div className="area-location-line">
              <MapPin size={15} />

              <span>
                {area.region}
              </span>
            </div>

            <h1>{area.name}</h1>

            <p className="area-coordinates">
              {formatNumber(
                area.coordinates?.latitude,
                4
              )}
              {"° N · "}
              {formatNumber(
                area.coordinates?.longitude,
                4
              )}
              {"° E"}
            </p>

            <div className="area-status-row">
              <Badge
                tone={getConditionTone(
                  riskLevel,
                )}
                size="md"
              >
                {riskLevel.toUpperCase()}
              </Badge>

              <span>
                Risk score {riskScore}/100
              </span>
            </div>
          </div>

          <div className="area-hero-side">
            <div className="area-updated">
              <ClockIcon />
              <span>
                Updated from current marine
                data
              </span>
            </div>
          </div>
        </section>

        <section className="area-situation-grid">
          <SituationPanel
            title="Current situation"
            severity={
              riskLevel === "low"
                ? "favourable"
                : riskLevel === "moderate"
                  ? "caution"
                  : riskLevel === "high"
                    ? "warning"
                    : riskLevel ===
                        "critical"
                      ? "critical"
                      : "unknown"
            }
            headline={
              area.safety
                ?.operatingRecommendation ??
              "Review current conditions before operating offshore."
            }
            summary={`Sea state: ${
              conditions?.seaState?.label ??
              "Unknown"
            }. Wind: ${
              conditions?.windSpeed?.value ??
              "—"
            } ${
              conditions?.windSpeed?.unit ??
              ""
            }.`}
            area={area.name}
          />

          <RiskIndicator
            level={
              riskLevel === "low"
                ? "low"
                : riskLevel === "moderate"
                  ? "moderate"
                  : riskLevel === "high"
                    ? "high"
                    : riskLevel ===
                        "critical"
                      ? "critical"
                      : "unknown"
            }
            score={riskScore}
            title="Marine risk"
            description={
              area.safety?.smallCraftSuitability ??
              "Review conditions before departure."
            }
          />
        </section>

        <section className="area-section">
          <div className="area-section-heading">
            <div>
              <span className="area-section-eyebrow">
                Marine conditions
              </span>

              <h2>Current sea conditions</h2>
            </div>
          </div>

          <div className="area-metrics-grid">
            <MarineMetric
              label="Wind"
              value={formatNumber(
                conditions?.windSpeed?.value,
              )}
              unit={
                conditions?.windSpeed?.unit
              }
              icon={Wind}
              status={
                conditions?.windSpeed
                  ?.value &&
                conditions.windSpeed.value >=
                  22
                  ? "danger"
                  : conditions?.windSpeed
                        ?.value &&
                      conditions.windSpeed.value >=
                        16
                    ? "warning"
                    : "normal"
              }
              detail={
                conditions?.windDirection
                  ? conditions.windDirection
                  : undefined
              }
            />

            <MarineMetric
              label="Wave height"
              value={formatNumber(
                conditions?.waveHeight?.value,
              )}
              unit={
                conditions?.waveHeight?.unit
              }
              icon={Waves}
              status={
                conditions?.waveHeight
                  ?.value &&
                conditions.waveHeight.value >=
                  1.8
                  ? "danger"
                  : conditions?.waveHeight
                        ?.value &&
                      conditions.waveHeight.value >=
                        1.2
                    ? "warning"
                    : "normal"
              }
              detail={
                conditions?.waveDirection
                  ? conditions.waveDirection
                  : undefined
              }
            />

            <MarineMetric
              label="Visibility"
              value={formatNumber(
                conditions?.visibility?.value,
              )}
              unit={
                conditions?.visibility?.unit
              }
              icon={Compass}
              status={
                conditions?.visibility
                  ?.value &&
                conditions.visibility.value < 5
                  ? "danger"
                  : conditions?.visibility
                        ?.value &&
                      conditions.visibility.value <
                        7
                    ? "warning"
                    : "normal"
              }
            />

            <MarineMetric
              label="Sea state"
              value={
                conditions?.seaState
                  ?.value ?? "—"
              }
              unit=""
              icon={Waves}
              status={
                conditions?.seaState
                  ?.value &&
                conditions.seaState.value >= 4
                  ? "danger"
                  : conditions?.seaState
                        ?.value &&
                      conditions.seaState.value >=
                        3
                    ? "warning"
                    : "normal"
              }
              detail={
                conditions?.seaState?.label
              }
            />

            <MarineMetric
              label="Rain probability"
              value={formatNumber(
                conditions?.rainProbability?.value,
              )}
              unit="%"
              icon={CloudRain}
              status={
                conditions?.rainProbability
                  ?.value &&
                conditions.rainProbability
                  .value >= 60
                  ? "warning"
                  : "normal"
              }
            />

            <MarineMetric
              label="Air temperature"
              value={formatNumber(
                conditions?.airTemperature?.value,
              )}
              unit={
                conditions?.airTemperature?.unit
              }
              icon={Thermometer}
              status="normal"
            />
          </div>
        </section>

        <section className="area-two-column">
          <div className="area-panel">
            <div className="area-panel-heading">
              <div className="area-panel-icon">
                <Droplets size={17} />
              </div>

              <div>
                <h2>Tide</h2>
                <span>
                  Current tidal condition
                </span>
              </div>
            </div>

            <div className="tide-current">
              <div>
                <span>Current phase</span>
                <strong>
                  {tide?.currentPhase ??
                    "Unknown"}
                </strong>
              </div>

              <div className="tide-height">
                <strong>
                  {formatNumber(
                    tide?.currentHeight?.value,
                  )}
                </strong>

                <span>
                  {tide?.currentHeight?.unit ??
                    "m"}
                </span>
              </div>
            </div>

            <div className="tide-events">
              <div className="tide-event">
                <div>
                  <span>
                    Next high tide
                  </span>
                  <strong>
                    {formatDate(
                      tide?.nextHighTide
                        ?.time,
                    )}
                  </strong>
                </div>

                <span>
                  {formatNumber(
                    tide?.nextHighTide
                      ?.height?.value,
                  )}{" "}
                  {tide?.nextHighTide
                    ?.height?.unit ?? "m"}
                </span>
              </div>

              <div className="tide-event">
                <div>
                  <span>
                    Next low tide
                  </span>
                  <strong>
                    {formatDate(
                      tide?.nextLowTide
                        ?.time,
                    )}
                  </strong>
                </div>

                <span>
                  {formatNumber(
                    tide?.nextLowTide
                      ?.height?.value,
                  )}{" "}
                  {tide?.nextLowTide
                    ?.height?.unit ?? "m"}
                </span>
              </div>
            </div>
          </div>

          <div className="area-panel">
            <div className="area-panel-heading">
              <div className="area-panel-icon">
                <ShieldCheck size={17} />
              </div>

              <div>
                <h2>
                  Marine productivity
                </h2>
                <span>
                  Ocean indicators
                </span>
              </div>
            </div>

            <div className="productivity-grid">
              <div>
                <span>SST</span>
                <strong>
                  {formatNumber(
                    indicators?.sst?.value,
                  )}{" "}
                  <small>
                    {indicators?.sst
                      ?.unit ?? "°C"}
                  </small>
                </strong>
              </div>

              <div>
                <span>Chlorophyll</span>
                <strong>
                  {formatNumber(
                    indicators?.chlorophyll
                      ?.value,
                    2,
                  )}{" "}
                  <small>
                    {indicators?.chlorophyll
                      ?.unit ?? "mg/m3"}
                  </small>
                </strong>
              </div>
            </div>

            <div className="productivity-status">
              <span>
                Productivity signal
              </span>

              <Badge
                tone={
                  indicators
                    ?.productivitySignal ===
                  "high"
                    ? "success"
                    : indicators
                          ?.productivitySignal ===
                        "favourable"
                      ? "success"
                      : "warning"
                }
                size="sm"
              >
                {(
                  indicators
                    ?.productivitySignal ??
                  "unknown"
                ).toUpperCase()}
              </Badge>
            </div>
          </div>
        </section>

        <section className="area-section">
          <div className="area-section-heading">
            <div>
              <span className="area-section-eyebrow">
                Hazard assessment
              </span>

              <h2>Active risk signals</h2>
            </div>
          </div>

          <div className="hazard-grid">
            <HazardItem
              label="Lightning"
              icon={CloudLightning}
              status={hazards?.lightning}
            />

            <HazardItem
              label="Cyclone"
              icon={CloudLightning}
              status={hazards?.cyclone}
            />

            <HazardItem
              label="Rough sea"
              icon={Waves}
              status={hazards?.roughSea}
            />

            <HazardItem
              label="Strong wind"
              icon={Wind}
              status={hazards?.strongWind}
            />
          </div>
        </section>

        <div className="area-footer-actions">
          <Button
            variant="secondary"
            size="md"
            onClick={() =>
              navigate(ROUTES.MAP)
            }
          >
            <Map size={16} />
            View on map
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() =>
              navigate(ROUTES.ROUTE)
            }
          >
            <Navigation size={16} />
            Plan a safer route
          </Button>
        </div>
      </PageContainer>
    </AppShell>
  );
}

function HazardItem({
  label,
  icon: Icon,
  status,
}: {
  label: string;
  icon: typeof AlertTriangle;
  status?: {
    status?: string;
    risk?: string;
  };
}) {
  const risk =
    status?.risk ?? "unknown";

  return (
    <div className="hazard-item">
      <div
        className={`hazard-icon hazard-${risk}`}
      >
        <Icon size={17} />
      </div>

      <div className="hazard-content">
        <span>{label}</span>

        <strong>
          {formatHazardStatus(
            status?.status,
          )}
        </strong>
      </div>

      <Badge
        tone={getHazardTone(risk)}
        size="sm"
      >
        {risk.toUpperCase()}
      </Badge>
    </div>
  );
}

function formatHazardStatus(
  status?: string,
) {
  if (!status) {
    return "No status available";
  }

  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatDate(
  value?: string,
) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

function ClockIcon() {
  return (
    <CalendarClock size={14} />
  );
}