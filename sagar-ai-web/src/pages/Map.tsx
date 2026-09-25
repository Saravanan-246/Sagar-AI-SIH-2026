import {
  Bell,
  ChevronRight,
  Fish,
  Layers3,
  Map as MapIcon,
  Navigation,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import MarineMap from "../components/map/MarineMap";
import FreshnessBadge from "../components/marine/FreshnessBadge";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { ROUTES } from "../constants/routes";
import { useActiveAlerts } from "../hooks/useAlerts";
import { useConnectivity } from "../hooks/useConnectivity";
import { useMarineConditions } from "../hooks/useMarineConditions";
import { useMarineData } from "../hooks/useMarineData";
import { formatIST } from "../utils/freshness";
import { useAreaRisk } from "../hooks/useAreaRisk";
import { describeRiskBasis } from "../utils/riskBasis";
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

export default function Map({ embedded = false }: { embedded?: boolean }) {
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
  // Same shared, polled model grid the map's own layers use - one
  // request serves both.
  const conditions = useMarineConditions(area, {
    offline: connectivity.status === "offline",
  });

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

  // The same real configured areas rendered as monitoring stations on
  // the map itself, offered as a one-tap way to focus the map on one -
  // reuses the exact same focus mechanism as picking a search result
  // (handleSelectSearchResult), so there is only ever one "focus the
  // map on this area" code path, not a second one.
  const areaChips = useMemo<SearchResult[]>(
    () =>
      (areas.length > 0 ? areas : getMarineAreas()).map((item) => ({
        id: `area-${item.id}`,
        label: item.name,
        sublabel: "Marine area",
        latitude: item.coordinates.latitude,
        longitude: item.coordinates.longitude,
      })),
    [areas]
  );

  const activeAreaLabel = searchFocus?.label ?? (!pendingFocus ? area?.name : undefined);

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

  // No invented defaults - a missing value shows as "—".
  // Same backend risk result as Chat/Home/Area, recalculated when the
  // displayed model run changes. The area's pre-set prototype score is
  // only shown if the risk service fails (and is labelled).
  const { risk: areaRisk, status: riskStatus } = useAreaRisk(area?.id, conditions.validAt);
  const riskServiceFailed = riskStatus === "failed";
  const riskBasis = describeRiskBasis(areaRisk?.basis, {
    loading: riskStatus === "loading" || riskStatus === "idle",
    serviceFailed: riskServiceFailed,
  });
  const risk =
    areaRisk?.riskLevel ?? (riskServiceFailed ? area?.safety?.overallRisk : null) ?? null;
  const riskScore =
    areaRisk?.riskScore ?? (riskServiceFailed ? area?.safety?.riskScore : null) ?? null;
  const wind = conditions.readings?.wind;
  const waves = conditions.readings?.waveHeight;
  const modelValidAt = formatIST(conditions.validAt, conditions.now);

  const seaState = area?.conditions?.seaState
    ? area.conditions.seaState
        .replaceAll("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

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

  const wrapPage = (content: ReactNode) =>
    embedded ? (
      <div className="map-page panel-page-full">{content}</div>
    ) : (
      <AppShell>
        <PageContainer className="map-page" fullHeight>{content}</PageContainer>
      </AppShell>
    );

  return wrapPage(
    <div className="map-workspace">
          {/* MAIN MAP CONTAINER - the map is the primary experience on
              this page, so the chrome around it stays to a single
              compact row; area/risk/condition detail lives in the
              sidebar and the map's own overlay, not repeated again here. */}
          <section className="map-main">
            <header className="map-header-compact">
              <div className="map-header-compact-row">
                <MapIcon size={15} />
                <h1>{searchFocus?.label ?? area?.name ?? "Marine Map"}</h1>
                {risk && (
                  <Badge tone={getRiskTone(risk)} size="sm">
                    {risk.toUpperCase()}
                  </Badge>
                )}
              </div>
              {area?.region && <p>{area.region}</p>}
            </header>

            <div className="map-search-row">
              <div className="map-search">
                <Search size={14} className="map-search-icon" />
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
                  placeholder="Search areas, fishing zones..."
                  aria-label="Search marine areas and fishing zones"
                />

                {searchOpen && searchQuery.trim() && (
                  <div className="map-search-results" role="listbox">
                    {searchResults.length === 0 ? (
                      <div className="map-search-empty">
                        No supported area or zone matches "{searchQuery.trim()}".
                      </div>
                    ) : (
                      searchResults.map((result) => {
                        const ResultIcon = result.sublabel === "Fishing zone" ? Fish : MapIcon;
                        return (
                          <button
                            key={result.id}
                            type="button"
                            className="map-search-result"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelectSearchResult(result)}
                          >
                            <span
                              className={`map-search-result-icon ${result.sublabel === "Fishing zone" ? "zone" : "area"}`}
                            >
                              <ResultIcon size={13} />
                            </span>
                            <span className="map-search-result-text">
                              <span className="map-search-result-label">{result.label}</span>
                              <span className="map-search-result-sublabel">{result.sublabel}</span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <Button variant="secondary" size="sm" onClick={() => navigate(ROUTES.ROUTE)}>
                <Navigation size={14} />
                <span>Route</span>
              </Button>
            </div>

            {areaChips.length > 0 && (
              <div className="map-area-chips" role="tablist" aria-label="Select a marine area">
                {areaChips.map((chip) => {
                  const isActive = activeAreaLabel === chip.label;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`map-area-chip${isActive ? " map-area-chip-active" : ""}`}
                      onClick={() => handleSelectSearchResult(chip)}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Clean map canvas - All internal controls are handled safely by MarineMap.
                This is deliberately the dominant element on the page: no status footer
                duplicating the sidebar's own area/risk/condition panel underneath it. */}
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
          </section>

          {/* SIDEBAR */}
          <aside className="map-sidebar">
            <section className="map-panel">
              <div className="map-panel-heading">
                <div>
                  <span className="panel-sub">Current Area</span>
                  <h2>{area?.name ?? "Marine Area"}</h2>
                </div>
                {risk && (
                  <Badge tone={getRiskTone(risk)} size="sm">
                    {risk.toUpperCase()}
                  </Badge>
                )}
              </div>

              <div className="map-area-grid">
                <div>
                  <span>Region</span>
                  <strong>{area?.region ?? "—"}</strong>
                </div>
                <div>
                  <span>Risk score</span>
                  <strong>{riskScore !== null ? `${riskScore}/100` : "—"}</strong>
                </div>
                <div>
                  <span>Sea state</span>
                  <strong>{seaState}</strong>
                </div>
                <div>
                  <span>Wind</span>
                  <strong>{typeof wind?.value === "number" ? `${wind.value} kn` : "—"}</strong>
                  {wind && <FreshnessBadge state={wind.state} />}
                </div>
                <div>
                  <span>Waves</span>
                  <strong>
                    {typeof waves?.value === "number" ? `${waves.value.toFixed(1)} m` : "—"}
                  </strong>
                  {waves && <FreshnessBadge state={waves.state} />}
                </div>
              </div>

              <p className="map-area-provenance">
                <FreshnessBadge state={riskBasis.state} /> {riskBasis.text}{" "}
                Sea state: configured dataset (prototype).{" "}
                {waves || wind
                  ? `Wind & waves: Open-Meteo model${modelValidAt ? `, valid ${modelValidAt}` : ""}${
                      conditions.status === "last-known" ? " (last known)" : ""
                    }.`
                  : conditions.status === "loading"
                    ? "Fetching model wind & waves…"
                    : "Model wind & waves unavailable."}
              </p>

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
  );
}