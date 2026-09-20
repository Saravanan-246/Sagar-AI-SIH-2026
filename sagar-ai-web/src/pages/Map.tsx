import {
  Bell,
  ChevronRight,
  Fish,
  Layers3,
  Map as MapIcon,
  Navigation,
  Search,
  ShieldAlert,
  Waves,
  Wind,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import MarineMap from "../components/map/MarineMap";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { ROUTES } from "../constants/routes";
import { useActiveAlerts } from "../hooks/useAlerts";
import { useConnectivity } from "../hooks/useConnectivity";
import { useMarineData } from "../hooks/useMarineData";
import { getMarineAreas } from "../services/marine/marineData";
import { useAppStore } from "../store/appStore";
import {
  alertTypeIcon,
  formatAlertType,
} from "../utils/alertPresentation";

import fishingZonesData from "../data/fishingZones.json";

import "./Map.css";

type Severity = "low" | "moderate" | "high" | "critical";

type SearchResult = {
  id: string;
  label: string;
  sublabel: string;
  latitude: number;
  longitude: number;
};

/** Configured marine areas + fishing zones only - a simple local
 * search, no external geocoder. Typing an unsupported place name
 * simply returns no results rather than guessing or defaulting to
 * Thoothukudi. */
function buildSearchIndex(): SearchResult[] {
  const results: SearchResult[] = [];

  for (const area of getMarineAreas()) {
    results.push({
      id: `area-${area.id}`,
      label: area.name,
      sublabel: "Marine area",
      latitude: area.coordinates.latitude,
      longitude: area.coordinates.longitude,
    });
  }

  const zoneList: any[] =
    (fishingZonesData as any)?.zones ?? (fishingZonesData as any) ?? [];

  for (const zone of Array.isArray(zoneList) ? zoneList : []) {
    const rawCoords = zone.coordinates || zone.polygon || [];
    if (!Array.isArray(rawCoords) || rawCoords.length === 0) continue;

    let sumLat = 0;
    let sumLng = 0;
    let count = 0;

    for (const point of rawCoords) {
      if (Array.isArray(point) && point.length >= 2) {
        sumLat += point[0];
        sumLng += point[1];
        count += 1;
      }
    }

    if (count === 0 || !zone.name) continue;

    results.push({
      id: `zone-${zone.id ?? zone.name}`,
      label: zone.name,
      sublabel: "Fishing zone",
      latitude: sumLat / count,
      longitude: sumLng / count,
    });
  }

  return results;
}

export default function Map() {
  const navigate = useNavigate();

  const clearPendingMapFocus = useAppStore(
    (state) => state.clearPendingMapFocus
  );
  const setPendingChatPrompt = useAppStore(
    (state) => state.setPendingChatPrompt
  );

  const [pendingFocus] = useState(
    () => useAppStore.getState().pendingMapFocus
  );

  const focusedAreaId = pendingFocus?.areaId;

  const { area, areas } = useMarineData({
    areaId: focusedAreaId,
  });

  const connectivity = useConnectivity();

  const searchIndex = useMemo(() => buildSearchIndex(), []);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState<SearchResult | null>(null);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return searchIndex
      .filter((item) => item.label.toLowerCase().includes(query))
      .slice(0, 8);
  }, [searchIndex, searchQuery]);

  const handleSelectSearchResult = (result: SearchResult) => {
    setSearchFocus(result);
    setSearchQuery(result.label);
    setSearchOpen(false);
  };

  useEffect(() => {
    clearPendingMapFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusCenter = useMemo(() => {
    if (searchFocus) {
      return { latitude: searchFocus.latitude, longitude: searchFocus.longitude };
    }

    if (
      typeof pendingFocus?.latitude === "number" &&
      typeof pendingFocus?.longitude === "number"
    ) {
      return {
        latitude: pendingFocus.latitude,
        longitude: pendingFocus.longitude,
      };
    }

    if (area?.coordinates) {
      return area.coordinates;
    }

    return undefined;
  }, [searchFocus, pendingFocus, area]);

  const hasFocusTarget = Boolean(searchFocus || pendingFocus);

  const { alerts, loading: alertsLoading } = useActiveAlerts();

  const topAlerts = useMemo(() => {
    const priority: Record<Severity, number> = {
      critical: 4,
      high: 3,
      moderate: 2,
      low: 1,
    };

    return [...alerts]
      .sort((a, b) => {
        const severityA = (a.severity as Severity) ?? "low";
        const severityB = (b.severity as Severity) ?? "low";
        return (priority[severityB] ?? 0) - (priority[severityA] ?? 0);
      })
      .slice(0, 3);
  }, [alerts]);

  const risk = area?.safety?.overallRisk ?? "low";
  const riskScore = area?.safety?.riskScore ?? 0;
  const wind = area?.conditions?.windSpeedKnots;
  const waves = area?.conditions?.waveHeightM;

  const seaState = area?.conditions?.seaState
    ? area.conditions.seaState
        .replaceAll("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "Slight";

  const getRiskTone = (
    severity: string
  ): "success" | "warning" | "danger" | "neutral" => {
    switch (severity.toLowerCase()) {
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
  };

  // A real question built from this map view's own resolved area - never
  // parsed from rendered text - asked through Chat's existing send
  // pipeline, no second chat mechanism. Uses the literal phrase "is it
  // safe" (a scored keyword phrase in the backend's own deterministic
  // classifier, intent.ts) so it resolves on the fast, reliable
  // deterministic path - verified live that a freeform phrasing here
  // ("why is X currently rated Y") fell through to the AI classifier,
  // which inconsistently misclassified it as unrelated small talk for
  // some area names while correctly recognising it for others.
  const handleAskSagar = () => {
    const label = searchFocus?.label ?? area?.name;
    const prompt = label
      ? `Is it safe to fish near ${label} right now?`
      : "Is it safe to fish near my area right now?";

    setPendingChatPrompt(prompt);
    navigate(ROUTES.CHAT);
  };

  return (
    <AppShell>
      <PageContainer className="map-page" fullHeight>
        <div className="map-workspace">
          {/* MAIN MAP CONTAINER */}
          <section className="map-main">
            <header className="map-header">
              <div className="map-title-block">
                <div className="map-eyebrow">
                  <MapIcon size={14} />
                  <span>Marine Intelligence</span>
                </div>
                <h1>{searchFocus?.label ?? area?.name ?? "Marine Map"}</h1>
                <p>{area?.region ?? "Gulf of Mannar, Tamil Nadu"}</p>
              </div>

              <div className="map-header-actions">
                <Badge tone={getRiskTone(risk)} size="sm">
                  {risk.toUpperCase()}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(ROUTES.ROUTE)}
                >
                  <Navigation size={14} />
                  <span>Plan route</span>
                </Button>
              </div>
            </header>

            <div className="map-search">
              <Search size={15} className="map-search-icon" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchOpen(true);
                  if (!event.target.value.trim()) {
                    setSearchFocus(null);
                  }
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
                placeholder="Search marine areas, fishing zones..."
                aria-label="Search marine areas and fishing zones"
              />

              {searchOpen && searchQuery.trim() && (
                <div className="map-search-results" role="listbox">
                  {searchResults.length === 0 ? (
                    <div className="map-search-empty">
                      No supported area or zone matches "{searchQuery.trim()}".
                    </div>
                  ) : (
                    searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className="map-search-result"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelectSearchResult(result)}
                      >
                        <span className="map-search-result-label">{result.label}</span>
                        <span className="map-search-result-sublabel">{result.sublabel}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Clean map canvas - All internal controls are handled safely by MarineMap */}
            <div className="map-canvas">
              <MarineMap
                areas={areas}
                alerts={alerts}
                center={focusCenter}
                zoom={hasFocusTarget ? 11 : undefined}
                highlight={
                  hasFocusTarget && focusCenter
                    ? {
                        ...focusCenter,
                        label: searchFocus?.label ?? pendingFocus?.label ?? area?.name,
                      }
                    : null
                }
                contextLabel={searchFocus?.label ?? area?.name}
                offline={connectivity.status === "offline"}
              />
            </div>

            <footer className="map-bottom-status">
              <div className="map-status-item">
                <Waves size={16} />
                <div>
                  <span>Sea state</span>
                  <strong>{seaState}</strong>
                </div>
              </div>

              <div className="map-status-item">
                <Wind size={16} />
                <div>
                  <span>Wind</span>
                  <strong>
                    {typeof wind === "number" ? `${wind} kn` : "—"}
                  </strong>
                </div>
              </div>

              <div className="map-status-item">
                <Waves size={16} />
                <div>
                  <span>Waves</span>
                  <strong>
                    {typeof waves === "number" ? `${waves.toFixed(1)} m` : "—"}
                  </strong>
                </div>
              </div>

              <div className="map-status-item">
                <ShieldAlert size={16} />
                <div>
                  <span>Risk score</span>
                  <strong>{riskScore}/100</strong>
                </div>
              </div>
            </footer>
          </section>

          {/* SIDEBAR */}
          <aside className="map-sidebar">
            <section className="map-panel">
              <div className="map-panel-heading">
                <div>
                  <span className="panel-sub">Current Area</span>
                  <h2>{area?.name ?? "Marine Area"}</h2>
                </div>
                <Badge tone={getRiskTone(risk)} size="sm">
                  {risk.toUpperCase()}
                </Badge>
              </div>

              <div className="map-area-grid">
                <div>
                  <span>Region</span>
                  <strong>{area?.region ?? "—"}</strong>
                </div>
                <div>
                  <span>Risk score</span>
                  <strong>{riskScore}/100</strong>
                </div>
                <div>
                  <span>Wind</span>
                  <strong>{typeof wind === "number" ? `${wind} kn` : "—"}</strong>
                </div>
                <div>
                  <span>Waves</span>
                  <strong>
                    {typeof waves === "number" ? `${waves.toFixed(1)} m` : "—"}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                className="map-panel-link"
                onClick={() => {
                  if (area?.id) navigate(ROUTES.AREA(area.id));
                }}
              >
                <span>View area details</span>
                <ChevronRight size={15} />
              </button>
            </section>

            <section className="map-panel">
              <div className="map-panel-heading">
                <div>
                  <span className="panel-sub">Marine Hazards</span>
                  <h2>Active Alerts</h2>
                </div>
                <button
                  type="button"
                  className="map-panel-icon-button"
                  onClick={() => navigate(ROUTES.ALERTS)}
                  aria-label="View all marine alerts"
                >
                  <Bell size={15} />
                </button>
              </div>

              {alertsLoading ? (
                <div className="map-panel-loading">Loading alerts...</div>
              ) : topAlerts.length === 0 ? (
                <div className="map-no-alerts">
                  <div className="map-no-alerts-icon">
                    <ShieldAlert size={16} />
                  </div>
                  <div>
                    <strong>No active alerts</strong>
                    <span>No active hazards reported.</span>
                  </div>
                </div>
              ) : (
                <div className="map-alert-list">
                  {topAlerts.map((alert) => {
                    const Icon = alertTypeIcon(alert.type);
                    return (
                      <button
                        key={alert.id}
                        type="button"
                        className="map-alert-item"
                        onClick={() => navigate(ROUTES.ALERTS)}
                      >
                        <div className={`map-alert-icon ${alert.severity ?? "low"}`}>
                          <Icon size={15} />
                        </div>
                        <div className="map-alert-content">
                          <strong>{alert.title}</strong>
                          <span>
                            {formatAlertType(alert.type)} · {alert.location.name}
                          </span>
                        </div>
                        <ChevronRight size={14} className="map-alert-arrow" />
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                className="map-panel-link"
                onClick={() => navigate(ROUTES.ALERTS)}
              >
                <span>View all alerts</span>
                <ChevronRight size={15} />
              </button>
            </section>

            <section className="map-panel">
              <div className="map-panel-heading">
                <div>
                  <span className="panel-sub">Quick Access</span>
                  <h2>Explore Data</h2>
                </div>
              </div>

              <div className="map-action-list">
                <button
                  type="button"
                  className="map-action"
                  onClick={() => navigate(ROUTES.ROUTE)}
                >
                  <div className="map-action-icon route">
                    <Navigation size={15} />
                  </div>
                  <div className="map-action-text">
                    <strong>Route Planning</strong>
                    <span>Compare safer passage routes</span>
                  </div>
                  <ChevronRight size={15} />
                </button>

                <button
                  type="button"
                  className="map-action"
                  onClick={() => navigate(ROUTES.SCENARIO)}
                >
                  <div className="map-action-icon scenario">
                    <Layers3 size={15} />
                  </div>
                  <div className="map-action-text">
                    <strong>What-If Analysis</strong>
                    <span>Test marine weather conditions</span>
                  </div>
                  <ChevronRight size={15} />
                </button>

                <button
                  type="button"
                  className="map-action"
                  onClick={handleAskSagar}
                >
                  <div className="map-action-icon fishing">
                    <Fish size={15} />
                  </div>
                  <div className="map-action-text">
                    <strong>Ask Sagar</strong>
                    <span>What is happening here?</span>
                  </div>
                  <ChevronRight size={15} />
                </button>
              </div>
            </section>
          </aside>
        </div>
      </PageContainer>
    </AppShell>
  );
}