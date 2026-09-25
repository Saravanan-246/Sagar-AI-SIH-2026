import type { ReactNode } from "react";
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
import AskSagarButton from "../components/chat/AskSagarButton";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import ErrorState from "../components/ui/ErrorState";
import MarineMetric, { type MetricProvenance } from "../components/marine/MarineMetric";
import MarineConditionsPanel from "../components/marine/MarineConditionsPanel";
import RiskIndicator from "../components/marine/RiskIndicator";
import SituationPanel from "../components/marine/SituationPanel";
import { useMarineArea } from "../hooks/useMarineData";
import { useConnectivity } from "../hooks/useConnectivity";
import {
  CONFIGURED_SOURCE_LABEL,
  useMarineConditions,
} from "../hooks/useMarineConditions";
import FreshnessBadge from "../components/marine/FreshnessBadge";
import { useAreaRisk } from "../hooks/useAreaRisk";
import { describeRiskBasis } from "../utils/riskBasis";
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

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function seaStateTone(
  seaState?: string,
): "danger" | "warning" | "normal" {
  if (seaState === "rough" || seaState === "very_rough") {
    return "danger";
  }

  if (seaState === "moderate") {
    return "warning";
  }

  return "normal";
}

export default function Area({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const {
    area,
    loading,
    error,
    origin,
    refresh,
  } = useMarineArea(id);

  const connectivity = useConnectivity();
  const offline = connectivity.status === "offline";
  const modelConditions = useMarineConditions(area, { offline });

  // The same backend risk result Chat uses (/api/risk), recalculated
  // when the displayed model run changes so the risk and the model
  // conditions on this page share one source. The area's pre-set
  // prototype score is only used if the risk service fails, and is
  // labelled as such.
  const { risk: liveRisk, status: riskStatus } = useAreaRisk(
    area?.id,
    modelConditions.validAt,
  );
  const riskServiceFailed = riskStatus === "failed";
  const riskBasis = describeRiskBasis(liveRisk?.basis, {
    loading: riskStatus === "loading" || riskStatus === "idle",
    serviceFailed: riskServiceFailed,
  });

  const wrapPage = (content: ReactNode) =>
    embedded ? (
      <div className="area-page">{content}</div>
    ) : (
      <AppShell>
        <PageContainer className="area-page">{content}</PageContainer>
      </AppShell>
    );

  if (loading) {
    return wrapPage(
      <div className="area-loading">
        <LoadingState
          label="Loading marine conditions..."
        />
      </div>
    );
  }

  if (error) {
    return wrapPage(
      <ErrorState
        title="Unable to load area"
        message={error}
        retry={refresh}
      />
    );
  }

  if (!area) {
    return wrapPage(
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
    );
  }

  const riskScore =
    liveRisk?.riskScore ??
    (riskServiceFailed ? area.safety?.riskScore : undefined);

  const riskLevel =
    liveRisk?.riskLevel ??
    (riskServiceFailed ? area.safety?.overallRisk : undefined) ??
    "unknown";

  const conditions =
    area.conditions;

  // Recorded time of the configured profile - shown as-is, never as
  // "current".
  const configuredRecorded = area.updatedAt
    ? new Date(area.updatedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : null;

  const configuredProvenance: MetricProvenance = {
    source: CONFIGURED_SOURCE_LABEL,
    time: configuredRecorded ? `Recorded ${configuredRecorded}` : null,
    state: "FALLBACK",
  };

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
                Risk score {riskScore ?? "—"}/100
              </span>
            </div>

            <div className="area-risk-basis">
              <FreshnessBadge state={riskBasis.state} />
              <span>{riskBasis.text}</span>
            </div>
          </div>

          <div className="area-hero-side">
            <div className="area-updated">
              <ClockIcon />
              <span>
                {configuredRecorded
                  ? `Configured dataset · recorded ${configuredRecorded}`
                  : "Configured dataset · no recorded time"}
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
                ?.recommendation ??
              "Review current conditions before operating offshore."
            }
            summary={`Sea state: ${
              conditions?.seaState
                ? titleCase(conditions.seaState)
                : "Unknown"
            }. Wind: ${
              conditions?.windSpeedKnots ??
              "—"
            } kn.`}
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
          <MarineConditionsPanel
            area={area}
            conditions={modelConditions}
            offline={offline}
            origin={origin}
            title="Model conditions"
            riskBasis={liveRisk?.basis?.conditions ?? null}
          />
        </section>

        <section className="area-section">
          <div className="area-section-heading">
            <div>
              <span className="area-section-eyebrow">
                Prototype dataset · not current observations
              </span>

              <h2>Configured area profile</h2>
            </div>
          </div>

          <div className="area-metrics-grid">
            <MarineMetric
              provenance={configuredProvenance}
              label="Wind"
              value={formatNumber(
                conditions?.windSpeedKnots,
              )}
              unit="kn"
              icon={Wind}
              status={
                conditions?.windSpeedKnots !== undefined &&
                conditions.windSpeedKnots >= 22
                  ? "danger"
                  : conditions?.windSpeedKnots !== undefined &&
                      conditions.windSpeedKnots >= 16
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

              provenance={configuredProvenance}
              label="Wave height"
              value={formatNumber(
                conditions?.waveHeightM,
              )}
              unit="m"
              icon={Waves}
              status={
                conditions?.waveHeightM !== undefined &&
                conditions.waveHeightM >= 1.8
                  ? "danger"
                  : conditions?.waveHeightM !== undefined &&
                      conditions.waveHeightM >= 1.2
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

              provenance={configuredProvenance}
              label="Visibility"
              value={formatNumber(
                conditions?.visibilityKm,
              )}
              unit="km"
              icon={Compass}
              status={
                conditions?.visibilityKm !== undefined &&
                conditions.visibilityKm < 5
                  ? "danger"
                  : conditions?.visibilityKm !== undefined &&
                      conditions.visibilityKm < 7
                    ? "warning"
                    : "normal"
              }
            />

            <MarineMetric

              provenance={configuredProvenance}
              label="Sea state"
              value={
                conditions?.seaState
                  ? titleCase(conditions.seaState)
                  : "—"
              }
              unit=""
              icon={Waves}
              status={seaStateTone(conditions?.seaState)}
              detail={
                conditions?.seaState
                  ? titleCase(conditions.seaState)
                  : undefined
              }
            />

            <MarineMetric

              provenance={configuredProvenance}
              label="Rain probability"
              value={formatNumber(
                conditions?.rainProbability,
              )}
              unit="%"
              icon={CloudRain}
              status={
                conditions?.rainProbability !== undefined &&
                conditions.rainProbability >= 60
                  ? "warning"
                  : "normal"
              }
            />

            <MarineMetric

              provenance={configuredProvenance}
              label="Air temperature"
              value={formatNumber(
                conditions?.airTemperatureC,
              )}
              unit="°C"
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
                  {tide?.currentState
                    ? titleCase(tide.currentState)
                    : "Unknown"}
                </strong>
              </div>

              <div className="tide-height">
                <strong>
                  {formatNumber(
                    tide?.currentHeightM,
                  )}
                </strong>

                <span>m</span>
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
                      tide?.nextHigh
                        ?.time,
                    )}
                  </strong>
                </div>

                <span>
                  {formatNumber(
                    tide?.nextHigh
                      ?.heightM,
                  )}{" "}
                  m
                </span>
              </div>

              <div className="tide-event">
                <div>
                  <span>
                    Next low tide
                  </span>
                  <strong>
                    {formatDate(
                      tide?.nextLow
                        ?.time,
                    )}
                  </strong>
                </div>

                <span>
                  {formatNumber(
                    tide?.nextLow
                      ?.heightM,
                  )}{" "}
                  m
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
                    indicators?.seaSurfaceTemperatureC,
                  )}{" "}
                  <small>°C</small>
                </strong>
              </div>

              <div>
                <span>Chlorophyll</span>
                <strong>
                  {formatNumber(
                    indicators?.chlorophyllMgM3,
                    2,
                  )}{" "}
                  <small>mg/m3</small>
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

          <AskSagarButton
            prompt={`Is it safe to fish near ${area.name} right now?`}
            label="Ask Sagar about this area"
            variant="secondary"
            size="md"
          />
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
  status?: boolean;
}) {
  const active = Boolean(status);
  const risk = active ? "high" : "low";

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
          {active ? "Active" : "No active hazard"}
        </strong>
      </div>

      <Badge
        tone={getHazardTone(risk)}
        size="sm"
      >
        {active ? "ACTIVE" : "CLEAR"}
      </Badge>
    </div>
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