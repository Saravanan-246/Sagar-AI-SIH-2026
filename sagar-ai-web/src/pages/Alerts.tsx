import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudLightning,
  Filter,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Siren,
  Wind,
  Waves,
} from "lucide-react";
import { useMemo, useState } from "react";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import AskSagarButton from "../components/chat/AskSagarButton";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { useActiveAlerts } from "../hooks/useAlerts";
import { getMarineAreas } from "../services/marine/marineData";
import { nearestMarineAreaName } from "../utils/geo";

import "./Alerts.css";

type AlertFilter =
  | "all"
  | "cyclone"
  | "lightning"
  | "high_waves"
  | "strong_wind"
  | "rough_sea"
  | "visibility"
  | "restricted_area"
  | "rapid_weather_change";

type AlertSeverity =
  | "low"
  | "moderate"
  | "high"
  | "critical";

type MarineAlert = {
  id: string;
  type: string;
  title: string;
  severity: AlertSeverity;
  status: string;
  area: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  issuedAt: string;
  validUntil: string;
  summary: string;
  description: string;
  recommendation: string;
};

function getSeverityTone(severity: AlertSeverity) {
  switch (severity) {
    case "critical":
      return "danger" as const;
    case "high":
      return "danger" as const;
    case "moderate":
      return "warning" as const;
    default:
      return "success" as const;
  }
}

function formatType(type: string) {
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getAlertIcon(type: string) {
  switch (type) {
    case "lightning":
      return CloudLightning;

    case "strong_wind":
      return Wind;

    case "high_waves":
    case "rough_sea":
      return Waves;

    case "restricted_area":
      return ShieldAlert;

    case "cyclone":
      return Siren;

    default:
      return AlertTriangle;
  }
}

function normalizeAlert(alert: unknown): MarineAlert | null {
  if (typeof alert !== "object" || alert === null) {
    return null;
  }

  const value = alert as Record<string, unknown>;

  if (typeof value.id !== "string" || typeof value.title !== "string") {
    return null;
  }

  const severity =
    value.severity === "low" ||
    value.severity === "moderate" ||
    value.severity === "high" ||
    value.severity === "critical"
      ? value.severity
      : "moderate";

  // The real Alert type (types/alert.ts) nests location under
  // `location: { name, latitude, longitude, radiusKm }`, not a flat
  // `area`/`radiusKm` - reading those directly always fell through to
  // the fallback string, so every alert card showed "Affected marine
  // area" instead of its real location name.
  const location =
    typeof value.location === "object" && value.location !== null
      ? (value.location as Record<string, unknown>)
      : {};

  return {
    id: value.id,
    type:
      typeof value.type === "string"
        ? value.type
        : "marine_hazard",
    title: value.title,
    severity,
    status:
      typeof value.status === "string"
        ? value.status
        : "active",
    area:
      typeof location.name === "string"
        ? location.name
        : "Affected marine area",
    latitude:
      typeof location.latitude === "number"
        ? location.latitude
        : undefined,
    longitude:
      typeof location.longitude === "number"
        ? location.longitude
        : undefined,
    radiusKm:
      typeof location.radiusKm === "number"
        ? location.radiusKm
        : undefined,
    issuedAt:
      typeof value.issuedAt === "string"
        ? value.issuedAt
        : "",
    validUntil:
      typeof value.validUntil === "string"
        ? value.validUntil
        : "",
    summary:
      typeof value.summary === "string"
        ? value.summary
        : "",
    description:
      typeof value.description === "string"
        ? value.description
        : "",
    recommendation:
      typeof value.recommendation === "string"
        ? value.recommendation
        : "",
  };
}

/** A question naming this alert's own real title, anchored to the
 * configured marine area nearest its real coordinates (an alert's own
 * free-text location, e.g. "Palk Strait & Rameswaram Coast", is often
 * not itself one of Sagar's configured areas, so naming it directly
 * would go unresolved). Uses the literal phrase "is it safe" (a scored
 * keyword phrase in the backend's deterministic classifier, intent.ts)
 * so it resolves on the fast, reliable path rather than the AI
 * classifier, which was verified live to be inconsistent for freeform
 * phrasing. */
function buildAlertAskSagarPrompt(
  alert: MarineAlert,
  areas: ReturnType<typeof getMarineAreas>
): string {
  const nearestArea =
    typeof alert.latitude === "number" && typeof alert.longitude === "number"
      ? nearestMarineAreaName(
          { latitude: alert.latitude, longitude: alert.longitude },
          areas
        )
      : null;

  return nearestArea
    ? `Is it safe near ${nearestArea} right now, given the "${alert.title}" alert?`
    : `What does the "${alert.title}" alert mean?`;
}

export default function Alerts() {
  const {
    alerts: rawAlerts,
    loading,
    error,
    refresh,
  } = useActiveAlerts();

  const marineAreas = useMemo(() => getMarineAreas(), []);

  const [filter, setFilter] = useState<AlertFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const alerts = useMemo(
    () =>
      rawAlerts
        .map(normalizeAlert)
        .filter((alert): alert is MarineAlert => alert !== null),
    [rawAlerts],
  );

  const filteredAlerts = useMemo(() => {
    if (filter === "all") {
      return alerts;
    }

    return alerts.filter((alert) => alert.type === filter);
  }, [alerts, filter]);

  const criticalCount = alerts.filter(
    (alert) => alert.severity === "critical",
  ).length;

  const highCount = alerts.filter(
    (alert) => alert.severity === "high",
  ).length;

  const moderateCount = alerts.filter(
    (alert) => alert.severity === "moderate",
  ).length;

  const filters: Array<[AlertFilter, string]> = [
    ["all", "All alerts"],
    ["cyclone", "Cyclone"],
    ["lightning", "Lightning"],
    ["high_waves", "High waves"],
    ["strong_wind", "Strong wind"],
    ["rough_sea", "Rough sea"],
    ["visibility", "Visibility"],
    ["restricted_area", "Restricted"],
  ];

  return (
    <AppShell>
      <PageContainer className="alerts-page">
        <section className="alerts-page-header">
          <div>
            <div className="alerts-eyebrow">
              <Bell size={14} />
              Marine monitoring
            </div>

            <h1>Marine Alerts</h1>

            <p>
              Review active hazards and the recommended response before making
              an offshore decision.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              size={15}
              className={loading ? "alerts-spin" : undefined}
            />
            Refresh
          </Button>
        </section>

        {error && (
          <div className="alerts-error" role="alert">
            <AlertTriangle size={17} />
            <span>{error}</span>
            <button type="button" onClick={refresh}>
              Try again
            </button>
          </div>
        )}

        <section className="alerts-summary" aria-label="Alerts summary count">
          <div className="alerts-summary-item">
            <div className="alerts-summary-icon">
              <Bell size={17} />
            </div>

            <div>
              <span>Active alerts</span>
              <strong>{alerts.length}</strong>
            </div>
          </div>

          <div className="alerts-summary-item">
            <div className="alerts-summary-icon critical">
              <Siren size={17} />
            </div>

            <div>
              <span>Critical</span>
              <strong>{criticalCount}</strong>
            </div>
          </div>

          <div className="alerts-summary-item">
            <div className="alerts-summary-icon high">
              <ShieldAlert size={17} />
            </div>

            <div>
              <span>High</span>
              <strong>{highCount}</strong>
            </div>
          </div>

          <div className="alerts-summary-item">
            <div className="alerts-summary-icon moderate">
              <AlertTriangle size={17} />
            </div>

            <div>
              <span>Moderate</span>
              <strong>{moderateCount}</strong>
            </div>
          </div>
        </section>

        <section className="alerts-section">
          <div className="alerts-toolbar">
            <div>
              <h2>Active marine conditions</h2>
              <span>
                {filteredAlerts.length}{" "}
                {filteredAlerts.length === 1 ? "alert" : "alerts"}
              </span>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <Filter size={15} />
              Filter
            </Button>
          </div>

          {filtersOpen && (
            <div
              className="alerts-filter-bar"
              role="group"
              aria-label="Filter alerts by type"
            >
              {filters.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={
                    filter === value
                      ? "alerts-filter active"
                      : "alerts-filter"
                  }
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="alerts-loading" role="status">
              <RefreshCw
                size={18}
                className="alerts-spin"
              />
              <span>Loading marine alerts...</span>
            </div>
          )}

          {!loading && filteredAlerts.length === 0 && (
            <div className="alerts-empty">
              <EmptyState
                icon={CheckCircle2}
                title={
                  filter === "all"
                    ? "No active alerts"
                    : "No matching alerts"
                }
                description={
                  filter === "all"
                    ? "There are no active marine alerts in the current alert set."
                    : "Try another alert type to view other active conditions."
                }
                action={
                  filter !== "all"
                    ? {
                        label: "Show all alerts",
                        onClick: () => setFilter("all"),
                      }
                    : undefined
                }
              />
            </div>
          )}

          {!loading && filteredAlerts.length > 0 && (
            <div className="alerts-list">
              {filteredAlerts.map((alert) => {
                const Icon = getAlertIcon(alert.type);

                return (
                  <article
                    key={alert.id}
                    className={`alert-card severity-${alert.severity}`}
                  >
                    <div className="alert-card-icon" aria-hidden="true">
                      <Icon size={20} />
                    </div>

                    <div className="alert-card-content">
                      <div className="alert-card-heading">
                        <div>
                          <div className="alert-card-meta">
                            <Badge
                              tone={getSeverityTone(alert.severity)}
                              size="sm"
                            >
                              {alert.severity.toUpperCase()}
                            </Badge>

                            <span>{formatType(alert.type)}</span>

                            {alert.status && (
                              <span className="alert-active-dot">
                                <i />
                                Active
                              </span>
                            )}
                          </div>

                          <h3>{alert.title}</h3>
                        </div>

                        <ChevronRight
                          size={18}
                          className="alert-chevron"
                        />
                      </div>

                      {alert.summary && (
                        <p className="alert-summary">
                          {alert.summary}
                        </p>
                      )}

                      <div className="alert-details">
                        <div className="alert-detail">
                          <MapPin size={14} />
                          <div>
                            <span>Area</span>
                            <strong>{alert.area}</strong>
                          </div>
                        </div>

                        {typeof alert.radiusKm === "number" && (
                          <div className="alert-detail">
                            <MapPin size={14} />
                            <div>
                              <span>Affected radius</span>
                              <strong>{alert.radiusKm} km</strong>
                            </div>
                          </div>
                        )}

                        <div className="alert-detail">
                          <Clock3 size={14} />
                          <div>
                            <span>Valid until</span>
                            <strong>{formatDateTime(alert.validUntil)}</strong>
                          </div>
                        </div>
                      </div>

                      {alert.description && (
                        <div className="alert-description">
                          <span>Condition</span>
                          <p>{alert.description}</p>
                        </div>
                      )}

                      {alert.recommendation && (
                        <div className="alert-recommendation">
                          <ShieldAlert size={16} />
                          <div>
                            <span>Recommended action</span>
                            <p>{alert.recommendation}</p>
                          </div>
                        </div>
                      )}

                      <div className="alert-issued">
                        <span>Issued {formatDateTime(alert.issuedAt)}</span>
                      </div>

                      <AskSagarButton
                        prompt={buildAlertAskSagarPrompt(alert, marineAreas)}
                        label="Ask Sagar"
                        className="alert-ask-sagar-btn"
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="alerts-disclaimer">
          <ShieldAlert size={15} />
          <span>
            Sagar uses the available marine alert records to support
            decision-making. Always verify active official warnings before
            departure.
          </span>
        </aside>
      </PageContainer>
    </AppShell>
  );
}