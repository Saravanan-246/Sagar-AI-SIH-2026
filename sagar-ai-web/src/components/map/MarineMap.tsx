import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, Polyline, Polygon, Popup, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import type { LatLngExpression, Map as LeafletMap } from "leaflet";

import MapControls from "./MapControls";
import MapLayers, { type MapLayerKey } from "./MapLayers";
import MapLegend from "./MapLegend";
import AskSagarButton from "../chat/AskSagarButton";
import { APP_CONFIG } from "../../constants/config";
import { getMarineAreas } from "../../services/marine/marineData";
import { getAlerts } from "../../services/alerts/alertService";
import { nearestMarineAreaName } from "../../utils/geo";
import { useMarineModelGrid } from "../../hooks/useMarineModelGrid";
import { formatIST } from "../../utils/freshness";
import { describeRiskBasis } from "../../utils/riskBasis";
import type { RiskBasis } from "../../services/agents/agentTypes";
import { fetchRisk, type MarineModelGridPoint } from "../../services/api/sagarApiClient";
import {
  alertSeverityColor,
  formatAlertType,
} from "../../utils/alertPresentation";
import {
  deriveZoneRecommendation,
  zoneRecommendationColor,
} from "../../utils/fishingZonePresentation";

import fishingZonesData from "../../data/fishingZones.json";
import routesData from "../../data/routes.json";
import boundariesData from "../../data/boundaries.json";

import type { RoutePlan } from "../../types/route";
import type { MarineArea } from "../../types/marine";
import type { Alert } from "../../types/alert";

import "./MarineMap.css";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type MarineMapProps = {
  center?: Coordinates;
  zoom?: number;
  onLocationChange?: (location: Coordinates) => void;
  className?: string;

  /** Real marine areas to plot as monitoring-station markers. Falls
   * back to the local configured dataset when not supplied - only
   * Route still relies on that fallback (Home fetches and passes its
   * own areas). */
  areas?: MarineArea[];
  /** Real active alerts to plot as hazard markers, ideally already
   * scoped to the areas shown (e.g. via useAlerts({ areaId })) - an
   * unscoped caller falls back to every alert nationwide, which can
   * surface an unrelated hazard on an area-specific view. Only Route
   * still relies on that fallback. */
  alerts?: Alert[];

  /**
   * When provided, the routes layer draws exactly these routes (e.g. the
   * planner's calculated options) instead of the full configured route
   * dataset. `selectedRouteId` makes one visually dominant; the rest stay
   * visually secondary. Clicking a route line calls `onSelectRoute`.
   */
  overrideRoutes?: RoutePlan[];
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;

  startPoint?: Coordinates | null;
  endPoint?: Coordinates | null;

  /** Demo-only route simulation marker (never real vessel tracking). */
  journeyPosition?: Coordinates | null;
  journeyBearingDeg?: number;

  /**
   * Marks the specific area/zone/alert Sagar chat handed off to the map
   * (distinct from the user's own device-location marker) so the
   * "View on map" action visibly lands somewhere, not just re-centers.
   */
  highlight?: { latitude: number; longitude: number; label?: string } | null;

  /** Hides the internal "MARINE MAP" status pill - for embeddings (like
   * the Chat map panel) that already show their own "Marine map"
   * heading immediately above the canvas, where the pill would just
   * repeat it. Defaults to shown, unchanged for existing standalone
   * pages (Map, Route) that have no header of their own. */
  showStatusPill?: boolean;

  /** Overrides the auto-derived context subtitle in the status pill
   * (e.g. "Thoothukudi Coast", "Route", "Fishing Zone"). When omitted,
   * derived from whatever real context this render already carries
   * (a route, or a chat handoff's highlight label) - never invented. */
  contextLabel?: string;

  /** A real, already-known connectivity outcome (e.g. from
   * useConnectivity()) - never polled or guessed here. Downgrades the
   * status pill to OFFLINE instead of the default CONFIGURED label. */
  offline?: boolean;
};

const DEFAULT_CENTER: LatLngExpression = APP_CONFIG.map.defaultCenter;
const DEFAULT_ZOOM = APP_CONFIG.map.defaultZoom;

/** Sagar's map palette - navy/teal primary, semantic colors reserved
 * for risk/severity only (matches the palette used in Chat). */
const MAP_NAVY = "#0e2a43";
const MAP_TEAL = "#0f6e64";

/**
 * Normalizes coordinate objects or arrays to Leaflet's [lat, lng].
 * Inverts flipped [lng, lat] pairs automatically for the Tamil Nadu region.
 */
function toLatLng(coord: any): [number, number] | null {
  if (!coord) return null;

  let lat: number | undefined;
  let lng: number | undefined;

  if (Array.isArray(coord) && coord.length >= 2) {
    const [first, second] = coord;
    if (first > 50 && second < 30) {
      lat = second;
      lng = first;
    } else {
      lat = first;
      lng = second;
    }
  } else if (typeof coord === "object") {
    lat = coord.latitude ?? coord.lat;
    lng = coord.longitude ?? coord.lng ?? coord.lon;
  }

  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    return null;
  }

  return [lat, lng];
}

function formatRestriction(restriction?: string): string {
  if (!restriction) return "Restricted";
  return restriction
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Small severity-colored hazard pin (a bold "!" reads as a hazard
 * regardless of alert type; the popup names the specific type) -
 * deliberately simple rather than a hand-drawn per-type glyph, so it
 * never risks rendering as a broken/malformed icon. */
function hazardDivIcon(color: string) {
  return divIcon({
    className: "marine-map-hazard-icon",
    html: `<span class="marine-map-hazard-glyph" style="background:${color}">!</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/** Wave-height display band - low/moderate/high, matching the same 3
 * fixed colors used elsewhere on the map for severity (never a new
 * fabricated palette). Presentation-only binning of the real fetched
 * value, not a synthesized value. */
function waveHeightColor(heightM: number): string {
  if (heightM > 2) return "#d64545";
  if (heightM >= 1) return "#c98700";
  return "#159a68";
}

function sstColor(tempC: number): string {
  if (tempC > 30) return "#d64545";
  if (tempC >= 28) return "#c98700";
  return "#2563eb";
}

/** Directional arrow for wind/current grid points - a small rotated
 * triangle, same construction as the demo-boat glyph. Rotated directly
 * by the source's own reported direction in degrees; magnitude scales
 * opacity so a near-calm point reads as visually quieter than a strong
 * one, without ever changing the numbers shown in its popup. */
function vectorDivIcon(kind: "wind" | "current", directionDeg: number, magnitude: number) {
  const opacity = Math.min(1, Math.max(0.35, magnitude / (kind === "wind" ? 25 : 3)));

  return divIcon({
    className: "marine-map-vector-icon",
    html:
      `<div class="marine-map-vector-glyph marine-map-vector-glyph-${kind}" ` +
      `style="transform: rotate(${directionDeg}deg); opacity: ${opacity.toFixed(2)}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/** "Model" timestamps formatted the same compact inline style already
 * used for alert issuedAt in this file - never a fake-precise value,
 * just a plain local-time rendering of a real ISO timestamp. */
function formatModelTime(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Presentational-only relabeling for the marine-model popup badge -
 * freshnessEngine.ts's raw FreshnessStatus values are correct and
 * unchanged (still used as-is everywhere else, e.g. INCOIS evidence),
 * but showing the bare word "LIVE" on a forecast/model point would
 * read as a live-sensor claim to a user, which the task's data-truth
 * rule explicitly forbids ("never label as sensor/live observation").
 * Open-Meteo's "current" value is always well within the
 * marine_forecast domain's LIVE threshold, so every successful
 * response would otherwise show "LIVE" on every popup.
 */
function describeModelFreshness(freshness: string): string {
  switch (freshness) {
    case "LIVE":
      return "Just updated";
    case "RECENT":
      return "Recently updated";
    case "AGING":
      return "Aging";
    case "STALE":
      return "Stale";
    case "OFFLINE":
      return "Offline";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return freshness;
  }
}

function timeAgo(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;

  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

function MapSyncController({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();
  const hasSetInitialView = useRef(false);

  useEffect(() => {
    if (!map || !map.getContainer()) return;

    // The very first view (mount) snaps instantly - there is nothing
    // to visually transition from yet. Every subsequent center/zoom
    // change (selecting a different area, a chat handoff, a search
    // result) eases there instead of an abrupt jump, so picking a new
    // area actually reads as "the map moved there" rather than a
    // static screenshot being swapped out. Respects reduced-motion.
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!hasSetInitialView.current || prefersReducedMotion) {
      hasSetInitialView.current = true;
      map.setView(center, zoom, { animate: false });
    } else {
      map.flyTo(center, zoom, { animate: true, duration: 0.9 });
    }

    const timer = setTimeout(() => {
      if (map && map.getContainer()) map.invalidateSize(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [map, center, zoom]);

  return null;
}

/**
 * Leaflet sizes its canvas once on mount and otherwise has no way to
 * know its container changed size - it never re-measures on its own.
 * MapSyncController's invalidateSize only fires when center/zoom
 * change, so a CSS-driven resize with neither (e.g. the desktop map
 * column's clamp()-based width crossing the 1280/1440px breakpoints,
 * or the sidebar drawer opening) would otherwise leave the map
 * half-rendered/blank until something else happened to move it. This
 * observes the actual container element and re-measures whenever its
 * pixel size changes, independent of the map's own state.
 */
function MapResizeController() {
  const map = useMap();

  useEffect(() => {
    const container = map?.getContainer();
    if (!container || typeof ResizeObserver === "undefined") return;

    let frame: number | undefined;

    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (map.getContainer()) map.invalidateSize(false);
      });
    });

    observer.observe(container);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

/** Fits the view to the currently planned route options so a short
 * corridor is actually visible, instead of a tiny sliver on the full
 * regional view. */
function RouteBoundsController({
  points,
}: {
  points: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !map.getContainer() || points.length === 0) return;

    const timer = setTimeout(() => {
      if (map && map.getContainer()) {
        map.fitBounds(points, { padding: [48, 48], maxZoom: 11 });
      }
    }, 120);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(points)]);

  return null;
}

export default function MarineMap({
  center,
  zoom = DEFAULT_ZOOM,
  onLocationChange,
  className = "",
  areas,
  alerts,
  overrideRoutes,
  selectedRouteId,
  onSelectRoute,
  startPoint,
  endPoint,
  journeyPosition,
  journeyBearingDeg = 0,
  highlight,
  showStatusPill = true,
  contextLabel,
  offline = false,
}: MarineMapProps) {
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeLayers, setActiveLayers] = useState<Record<MapLayerKey, boolean>>({
    wind: false,
    waves: false,
    current: false,
    sst: false,
    tide: false,
    conditions: true,
    pfz: true,
    alerts: true,
    boundaries: false,
    routes: true,
  });

  const mapCenter = useMemo<LatLngExpression>(
    () => (center ? [center.latitude, center.longitude] : DEFAULT_CENTER),
    [center]
  );

  // The plain configured-area list (not the {area, latLng} pairs below) -
  // used to resolve "which real configured area is this popup's own
  // coordinate nearest to" for Ask Sagar prompts (a zone/alert/route
  // point is rarely itself a configured area's exact center).
  const marineAreasList = useMemo(() => areas ?? getMarineAreas(), [areas]);

  // Real configured marine areas (monitoring stations) - a prop when
  // the host page already fetched them (Map.tsx), otherwise the same
  // local dataset every other page already reads from.
  const areaList = useMemo(() => {
    const source = marineAreasList;

    return source
      .map((area) => {
        const latLng = toLatLng(area.coordinates);
        return latLng ? { area, latLng } : null;
      })
      .filter((item): item is { area: MarineArea; latLng: [number, number] } => item !== null);
  }, [marineAreasList]);

  // The same live, deterministic risk result Chat/What-If already use
  // (via /api/risk - see riskAgent.ts), keyed by area id. Popups below
  // prefer this over each area's own static safety.riskScore/overallRisk
  // fixture field so a fisherman never sees a different number here
  // than Sagar just told them in Chat for the same area. Falls back to
  // the static field (unchanged) while loading, offline, or on error -
  // never blocks the popup on this fetch.
  const [liveAreaRisk, setLiveAreaRisk] = useState<
    Record<string, { riskScore: number; riskLevel: string; basis?: RiskBasis }>
  >({});

  useEffect(() => {
    if (offline || marineAreasList.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      marineAreasList.map((area) =>
        fetchRisk({ areaId: area.id })
          .then((response) => {
            if (!response.data) return null;
            return [
              area.id,
              {
                riskScore: response.data.riskScore,
                riskLevel: response.data.riskLevel,
                basis: response.data.basis,
              },
            ] as const;
          })
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, { riskScore: number; riskLevel: string; basis?: RiskBasis }> = {};
      for (const entry of results) {
        if (entry) next[entry[0]] = entry[1];
      }
      setLiveAreaRisk(next);
    });

    return () => {
      cancelled = true;
    };
  }, [marineAreasList, offline]);

  // Real active alerts - a prop when the host page already fetched
  // them, otherwise the same normalized alert service every other
  // alert surface in the app reads from (consistent severity/type
  // values, not the raw un-normalized dataset).
  const alertList = useMemo(() => {
    const source = alerts ?? getAlerts();

    return source
      .map((alert) => {
        const latLng = toLatLng(alert.location);
        return latLng ? { alert, latLng } : null;
      })
      .filter((item): item is { alert: Alert; latLng: [number, number] } => item !== null);
  }, [alerts]);

  const boundariesList = useMemo(() => {
    const list = Array.isArray(boundariesData) ? boundariesData : [];
    return list
      .map((boundary: any) => {
        const points = Array.isArray(boundary.polygon)
          ? boundary.polygon.map(toLatLng).filter((c: [number, number] | null): c is [number, number] => c !== null)
          : [];

        if (points.length === 0) return null;

        return {
          id: boundary.id,
          name: boundary.name,
          type: boundary.type,
          restriction: boundary.restriction,
          description: boundary.description,
          points,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, []);

  const fishingZonesList = useMemo(() => {
    const list = (fishingZonesData as any)?.zones || (fishingZonesData as any) || [];
    if (!Array.isArray(list)) return [];
    return list
      .map((zone: any) => {
        const rawCoords = zone.coordinates || zone.polygon || [];
        const validCoords = Array.isArray(rawCoords)
          ? rawCoords.map(toLatLng).filter((c): c is [number, number] => c !== null)
          : [];
        return {
          ...zone,
          parsedCoordinates: validCoords,
          recommendation: deriveZoneRecommendation(zone.suitability),
        };
      })
      .filter((zone: any) => zone.parsedCoordinates.length >= 3);
  }, []);

  const routesList = useMemo(() => {
    const list = (routesData as any)?.routes || (routesData as any) || [];
    if (!Array.isArray(list)) return [];
    return list
      .map((route: any) => {
        const rawWaypoints = route.waypoints || route.coordinates || route.path || [];
        const validWaypoints = Array.isArray(rawWaypoints)
          ? rawWaypoints.map(toLatLng).filter((c): c is [number, number] => c !== null)
          : [];

        const score = Number(route.risk?.score ?? route.riskScore) || 20;
        const decision = route.routeDecision || (score > 60 ? "avoid" : score > 30 ? "caution" : "preferred");

        return {
          ...route,
          calculatedScore: score,
          resolvedDecision: decision,
          parsedWaypoints: validWaypoints,
        };
      })
      .filter((route: any) => route.parsedWaypoints.length >= 2);
  }, []);

  const overrideRoutesList = useMemo(() => {
    if (!overrideRoutes) {
      return null;
    }

    return overrideRoutes
      .map((route) => ({
        ...route,
        calculatedScore: route.risk.score,
        resolvedDecision:
          route.routeDecision === "avoid" || route.routeDecision === "blocked"
            ? "avoid"
            : route.routeDecision === "caution"
              ? "caution"
              : "preferred",
        parsedWaypoints: route.waypoints
          .map((point) => toLatLng(point))
          .filter((c): c is [number, number] => c !== null),
      }))
      .filter((route) => route.parsedWaypoints.length >= 2);
  }, [overrideRoutes]);

  const activeRoutesList = overrideRoutesList ?? routesList;

  /*
   * Fits to whichever route is actually SELECTED, not the union of
   * every option on screen - so choosing a different alternative
   * re-fits the map to that specific corridor (section 11: "when an
   * alternative route is selected, fit to that route"), and the
   * union-of-all-options framing this used to fall back to never
   * changes when you merely switch which one is selected.
   */
  const routeBoundsPoints = useMemo<[number, number][]>(() => {
    if (!overrideRoutesList || overrideRoutesList.length === 0) {
      return [];
    }

    const target =
      (selectedRouteId
        ? overrideRoutesList.find((route) => route.id === selectedRouteId)
        : undefined) ?? overrideRoutesList[0];

    return target.parsedWaypoints;
  }, [overrideRoutesList, selectedRouteId]);

  const startMarkerPosition = useMemo(
    () => toLatLng(startPoint),
    [startPoint]
  );

  const endMarkerPosition = useMemo(
    () => toLatLng(endPoint),
    [endPoint]
  );

  const journeyMarkerPosition = useMemo(
    () => toLatLng(journeyPosition),
    [journeyPosition]
  );

  const highlightPosition = useMemo(
    () => toLatLng(highlight),
    [highlight]
  );

  const boatIcon = useMemo(
    () =>
      divIcon({
        className: "marine-map-boat-icon",
        html: `<div class="marine-map-boat-glyph" style="transform: rotate(${journeyBearingDeg}deg)"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    [journeyBearingDeg]
  );

  const alertIcons = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof divIcon>>();

    return (severity: string) => {
      const color = alertSeverityColor(severity);
      const cached = cache.get(color);
      if (cached) return cached;

      const icon = hazardDivIcon(color);
      cache.set(color, icon);
      return icon;
    };
  }, []);

  const anyModelLayerActive =
    activeLayers.wind ||
    activeLayers.waves ||
    activeLayers.current ||
    activeLayers.sst ||
    activeLayers.tide;

  const {
    points: modelPoints,
    loading: modelLoading,
    error: modelError,
    data: modelData,
  } = useMarineModelGrid({
    enabled: anyModelLayerActive,
    offline,
    // Keeps visible model layers current; the grid is shared with any
    // other screen using it, so this never doubles requests.
    pollIntervalMs: APP_CONFIG.marine.modelGrid.pollIntervalMs,
  });
  const modelValidAt = formatIST(modelData?.generatedAt);
  const hasModelPoints = modelPoints.length > 0;

  const windIcon = useMemo(
    () => (point: MarineModelGridPoint) =>
      vectorDivIcon("wind", point.windDirection ?? 0, point.windSpeed ?? 0),
    []
  );

  const currentIcon = useMemo(
    () => (point: MarineModelGridPoint) =>
      vectorDivIcon("current", point.currentDirection ?? 0, point.currentVelocity ?? 0),
    []
  );

  const modelPointPopup = useCallback(
    (point: MarineModelGridPoint, valueLines: ReactNode) => (
      <Popup>
        <div className="marine-map-popup">
          <div className="marine-map-popup-head">
            <div className="marine-map-popup-title">Marine model point</div>
            <div className="marine-map-popup-badge-group">
              <span className="marine-map-badge marine-map-badge-model-type">Model output</span>
              <span className="marine-map-badge marine-map-badge-simulation">
                {describeModelFreshness(point.freshness)}
              </span>
            </div>
          </div>
          {valueLines}
          <div className="marine-map-popup-meta">
            <div className="marine-map-popup-meta-row">
              <span>Source</span>
              <span>{point.provider} &middot; {point.model}</span>
            </div>
            <div className="marine-map-popup-meta-row">
              <span>Valid time</span>
              <span>{formatModelTime(point.generatedAt) ?? "unknown"}</span>
            </div>
            <div className="marine-map-popup-meta-row">
              <span>Fetched</span>
              <span>{formatModelTime(point.fetchedAt) ?? "unknown"} ({timeAgo(point.fetchedAt)})</span>
            </div>
            <div className="marine-map-popup-meta-row">
              <span>Confidence</span>
              <span>{point.confidence.level} &mdash; {point.confidence.explanation}</span>
            </div>
          </div>
          <div className="marine-map-popup-disclaimer">
            Model output &mdash; not a local observation.
          </div>
        </div>
      </Popup>
    ),
    []
  );

  const handleLocationChange = useCallback(
    (nextLocation: Coordinates) => {
      setLocation(nextLocation);
      onLocationChange?.(nextLocation);
    },
    [onLocationChange]
  );

  const toggleLayer = useCallback((layer: MapLayerKey) => {
    setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  const handleZoomIn = () => {
    if (mapInstance && mapInstance.getContainer()) mapInstance.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstance && mapInstance.getContainer()) mapInstance.zoomOut();
  };

  const handleLocate = () => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        handleLocationChange(coords);
        if (mapInstance && mapInstance.getContainer()) {
          mapInstance.flyTo([coords.latitude, coords.longitude], 12, { animate: true, duration: 0.6 });
        }
      },
      (err) => console.warn("Geolocation warning:", err.message),
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 5000 }
    );
  };

  // Re-fits to the currently selected route on demand - the same
  // bounds RouteBoundsController already fits to automatically when a
  // route first loads/changes, exposed as a manual control for when
  // the user has since panned/zoomed away from it.
  const handleFitRoute = useCallback(() => {
    if (mapInstance && mapInstance.getContainer() && routeBoundsPoints.length > 0) {
      mapInstance.fitBounds(routeBoundsPoints, { padding: [48, 48], maxZoom: 11 });
    }
  }, [mapInstance, routeBoundsPoints]);

  const handleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      container.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const activeCount = useMemo(() => Object.values(activeLayers).filter(Boolean).length, [activeLayers]);

  // Honest map status - never LIVE. SIMULATION only for the demo route
  // playback marker; OFFLINE only when the caller passed a real,
  // already-observed connectivity outcome; CONFIGURED otherwise - the
  // areas/zones/routes/alerts geometry shown by default really is
  // Sagar's own configured dataset (matching the "configured dataset"
  // wording used everywhere else in the app, e.g. ChatStructuredPanel),
  // not a placeholder claim that the map itself is unfinished. Model
  // layers (wind/wave/current/SST/tide), when turned on, get their own
  // separate "Marine Model Data" pill below - this badge deliberately
  // never covers them.
  const mapDataState: "OFFLINE" | "SIMULATION" | "CONFIGURED" = offline
    ? "OFFLINE"
    : journeyMarkerPosition
      ? "SIMULATION"
      : "CONFIGURED";

  // A short context subtitle for the status pill - only from real
  // context this render already carries, never invented: an explicit
  // override, a route context, or the label a chat handoff attached to
  // its highlight (an area/zone/alert name).
  const derivedContextLabel =
    contextLabel ??
    (overrideRoutes && overrideRoutes.length > 0 ? "Route" : null) ??
    highlight?.label ??
    null;

  return (
    <div ref={containerRef} className={`marine-map ${className}`.trim()}>
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        minZoom={APP_CONFIG.map.minZoom}
        maxZoom={APP_CONFIG.map.maxZoom}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        touchZoom={true}
        dragging={true}
        zoomControl={false}
        attributionControl={true}
        className="marine-map-canvas"
        ref={setMapInstance}
      >
        <TileLayer
          url={APP_CONFIG.map.tileUrl}
          attribution={APP_CONFIG.map.attribution}
          maxZoom={APP_CONFIG.map.maxZoom}
        />

        <MapSyncController center={mapCenter} zoom={zoom} />
        <MapResizeController />

        {routeBoundsPoints.length > 0 && (
          <RouteBoundsController points={routeBoundsPoints} />
        )}

        {/* MARINE MODEL: WAVES - a discrete per-grid-point intensity
            layer (Open-Meteo). Never an interpolated contour - only
            the actual returned points are drawn, and a point with no
            wave data (land-adjacent grid cell) is simply skipped. */}
        {activeLayers.waves &&
          modelPoints
            .filter((point) => typeof point.waveHeight === "number")
            .map((point) => (
              <CircleMarker
                key={`wave-${point.latitude}-${point.longitude}`}
                center={[point.latitude, point.longitude]}
                radius={16}
                pathOptions={{
                  color: waveHeightColor(point.waveHeight as number),
                  fillColor: waveHeightColor(point.waveHeight as number),
                  fillOpacity: 0.32,
                  weight: 1,
                  opacity: 0.6,
                }}
              >
                {modelPointPopup(
                  point,
                  <>
                    <div>Wave height: <b>{point.waveHeight?.toFixed(2)} m</b></div>
                    {typeof point.wavePeriod === "number" && (
                      <div>Wave period: {point.wavePeriod.toFixed(1)} s</div>
                    )}
                    {typeof point.waveDirection === "number" && (
                      <div>Wave direction: {Math.round(point.waveDirection)}&deg;</div>
                    )}
                    {typeof point.swellHeight === "number" && (
                      <div>Swell height: {point.swellHeight.toFixed(2)} m</div>
                    )}
                    {typeof point.windWaveHeight === "number" && (
                      <div>Wind-wave height: {point.windWaveHeight.toFixed(2)} m</div>
                    )}
                  </>
                )}
              </CircleMarker>
            ))}

        {/* MARINE MODEL: SEA-SURFACE TEMPERATURE - same discrete
            per-point intensity treatment as Waves. */}
        {activeLayers.sst &&
          modelPoints
            .filter((point) => typeof point.seaSurfaceTemperature === "number")
            .map((point) => (
              <CircleMarker
                key={`sst-${point.latitude}-${point.longitude}`}
                center={[point.latitude, point.longitude]}
                radius={16}
                pathOptions={{
                  color: sstColor(point.seaSurfaceTemperature as number),
                  fillColor: sstColor(point.seaSurfaceTemperature as number),
                  fillOpacity: 0.32,
                  weight: 1,
                  opacity: 0.6,
                }}
              >
                {modelPointPopup(
                  point,
                  <div>
                    Sea-surface temperature: <b>{point.seaSurfaceTemperature?.toFixed(1)} &deg;C</b>
                  </div>
                )}
              </CircleMarker>
            ))}

        {/* 1. MARINE AREAS (monitoring stations) */}
        {activeLayers.conditions &&
          areaList.map(({ area, latLng }) => {
            const isFocused =
              typeof center?.latitude === "number" &&
              Math.abs(center.latitude - area.coordinates.latitude) < 0.01 &&
              Math.abs(center.longitude - area.coordinates.longitude) < 0.01;

            return (
              <CircleMarker
                key={area.id}
                center={latLng}
                radius={isFocused ? 12 : 8}
                pathOptions={{
                  color: MAP_TEAL,
                  fillColor: MAP_TEAL,
                  fillOpacity: isFocused ? 0.5 : 0.28,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="marine-map-popup">
                    <div className="marine-map-popup-title">{area.name}</div>
                    {area.region && <div>{area.region}</div>}
                    {area.conditions?.seaState && (
                      <div>Sea state: <b>{formatAlertType(area.conditions.seaState)}</b></div>
                    )}
                    {(() => {
                      // Wave/wind shown here are the values the risk
                      // score below was calculated from, each labelled
                      // with its source - never the configured values
                      // beside a model-based score.
                      const live = liveAreaRisk[area.id];
                      const inputs = live?.basis?.inputs;
                      const wave = inputs?.waveHeightM;
                      const wind = inputs?.windSpeedKnots;
                      const kindLabel = (kind?: string) =>
                        kind === "model" ? "model" : "configured (prototype)";
                      const riskScore = live?.riskScore ?? area.safety?.riskScore;
                      const overallRisk = live?.riskLevel ?? area.safety?.overallRisk;

                      return (
                        <>
                          {wave ? (
                            <div>
                              Wave height: {wave.value.toFixed(1)} m{" "}
                              <span className="marine-map-popup-kind">{kindLabel(wave.kind)}</span>
                            </div>
                          ) : typeof area.conditions?.waveHeightM === "number" ? (
                            <div>
                              Wave height: {area.conditions.waveHeightM} m{" "}
                              <span className="marine-map-popup-kind">configured (prototype)</span>
                            </div>
                          ) : null}
                          {wind ? (
                            <div>
                              Wind speed: {wind.value.toFixed(1)} kn{" "}
                              <span className="marine-map-popup-kind">{kindLabel(wind.kind)}</span>
                            </div>
                          ) : typeof area.conditions?.windSpeedKnots === "number" ? (
                            <div>
                              Wind speed: {area.conditions.windSpeedKnots} kn{" "}
                              <span className="marine-map-popup-kind">configured (prototype)</span>
                            </div>
                          ) : null}
                          {typeof riskScore === "number" && (
                            <div>Risk: <b>{overallRisk}</b> ({riskScore}/100)</div>
                          )}
                          <div className="marine-map-popup-data-status">
                            {describeRiskBasis(live?.basis, { serviceFailed: !live }).text}
                          </div>
                        </>
                      );
                    })()}
                    <AskSagarButton
                      prompt={`Is it safe to fish near ${area.name} right now?`}
                      label="Ask Sagar"
                      size="sm"
                      fullWidth
                      className="marine-map-popup-ask"
                    />
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {/* 2. FISHING ZONES (PFZ) LAYER */}
        {activeLayers.pfz &&
          fishingZonesList.map((zone: any, idx: number) => {
            const color = zoneRecommendationColor(zone.recommendation);

            const zoneCentroid: [number, number] = [
              zone.parsedCoordinates.reduce((sum: number, p: [number, number]) => sum + p[0], 0) /
                zone.parsedCoordinates.length,
              zone.parsedCoordinates.reduce((sum: number, p: [number, number]) => sum + p[1], 0) /
                zone.parsedCoordinates.length,
            ];

            const zoneNearestArea = nearestMarineAreaName(
              { latitude: zoneCentroid[0], longitude: zoneCentroid[1] },
              marineAreasList
            );

            return (
              <Polygon
                key={zone.id || idx}
                positions={zone.parsedCoordinates}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.22,
                  weight: 2,
                  opacity: 0.85,
                }}
              >
                <Popup>
                  <div className="marine-map-popup">
                    <div className="marine-map-popup-head">
                      <div className="marine-map-popup-title">{zone.name || "Fishing zone"}</div>
                      <span className="marine-map-badge" style={{ background: color }}>
                        {zone.recommendation}
                      </span>
                    </div>
                    {zone.suitability && <div>Configured suitability: {zone.suitability}</div>}
                    {typeof zone.depthMeters === "number" && <div>Depth: {zone.depthMeters} m</div>}
                    {typeof zone.chlorophyll === "number" && (
                      <div>
                        Chlorophyll: {zone.chlorophyll} mg/m³
                        <span className="marine-map-popup-note">
                          {" "}(productivity proxy, not a guarantee of catch)
                        </span>
                      </div>
                    )}
                    {typeof zone.sst === "number" && <div>Sea-surface temp: {zone.sst} °C</div>}
                    {zone.fishSpecies && Array.isArray(zone.fishSpecies) && zone.fishSpecies.length > 0 && (
                      // "Species observed" would imply an actual field
                      // sighting; this is a configured, typical-species
                      // list for the zone, not a live/recent observation.
                      <div>Typical species (configured): <i>{zone.fishSpecies.join(", ")}</i></div>
                    )}
                    <div className="marine-map-popup-data-status">Data: Configured dataset</div>
                    {zoneNearestArea && (
                      <AskSagarButton
                        prompt={`Which fishing zone is better near ${zoneNearestArea}?`}
                        label="Ask Sagar"
                        size="sm"
                        fullWidth
                        className="marine-map-popup-ask"
                      />
                    )}
                  </div>
                </Popup>
              </Polygon>
            );
          })}

        {/* 3. ACTIVE ALERTS (real hazards) LAYER */}
        {activeLayers.alerts &&
          alertList.map(({ alert, latLng }) => {
            const alertNearestArea = nearestMarineAreaName(
              { latitude: alert.location.latitude, longitude: alert.location.longitude },
              marineAreasList
            );

            return (
              <Marker key={alert.id} position={latLng} icon={alertIcons(alert.severity)}>
                <Popup>
                  <div className="marine-map-popup">
                    <div className="marine-map-popup-head">
                      <div className="marine-map-popup-title">{alert.title}</div>
                      <span
                        className="marine-map-badge"
                        style={{ background: alertSeverityColor(alert.severity) }}
                      >
                        {alert.severity}
                      </span>
                    </div>
                    <div>Type: {formatAlertType(alert.type)}</div>
                    <div>Area: {alert.location.name}</div>
                    <div>{alert.recommendation}</div>
                    <div className="marine-map-popup-data-status">
                      Source: {alert.source || "Sagar Alert Dataset"}
                      {alert.issuedAt && !Number.isNaN(new Date(alert.issuedAt).getTime())
                        ? ` · Issued ${new Date(alert.issuedAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </div>
                    {alertNearestArea && (
                      <AskSagarButton
                        prompt={`Is it safe near ${alertNearestArea} right now, given the "${alert.title}" alert?`}
                        label="Ask Sagar"
                        size="sm"
                        fullWidth
                        className="marine-map-popup-ask"
                      />
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* 4. BOUNDARIES LAYER (restricted / regulated marine areas) */}
        {activeLayers.boundaries &&
          boundariesList.map((boundary) => (
            <Polygon
              key={boundary.id}
              positions={boundary.points}
              pathOptions={{
                color: "#5b6b7a",
                fillColor: "#5b6b7a",
                fillOpacity: 0.1,
                weight: 2,
                dashArray: "5, 6",
              }}
            >
              <Popup>
                <div className="marine-map-popup">
                  <div className="marine-map-popup-title">{boundary.name}</div>
                  {boundary.restriction && <div>Restriction: <b>{formatRestriction(boundary.restriction)}</b></div>}
                  {boundary.type && <div>Type: {formatAlertType(boundary.type)}</div>}
                  {boundary.description && <div>{boundary.description}</div>}
                </div>
              </Popup>
            </Polygon>
          ))}

        {/* 5. ROUTES LAYER */}
        {activeLayers.routes &&
          activeRoutesList.map((route: any, idx: number) => {
            const isAvoid = route.resolvedDecision === "avoid" || route.resolvedDecision === "blocked";
            const isCaution = route.resolvedDecision === "caution";
            const routeColor = isAvoid ? "#d64545" : isCaution ? "#c98700" : "#159a68";

            const isControlled = Boolean(overrideRoutesList);
            const isSelected = !isControlled || route.id === selectedRouteId;

            // The route's own origin/destination point names (e.g. "Thoothukudi
            // New Port Outer") are route-specific waypoints, not the configured
            // area names Chat's deterministic "from X to Y" parser resolves -
            // resolve each endpoint to its nearest real configured area instead
            // (same fix already verified on the Route page).
            const routeOriginArea = route.origin
              ? nearestMarineAreaName(route.origin, marineAreasList)
              : null;
            const routeDestinationArea = route.destination
              ? nearestMarineAreaName(route.destination, marineAreasList)
              : null;

            return (
              <Polyline
                key={route.id || idx}
                positions={route.parsedWaypoints}
                pathOptions={{
                  color: routeColor,
                  weight: isSelected ? 5 : 3,
                  opacity: isSelected ? 0.95 : 0.45,
                  dashArray: isAvoid ? "6, 8" : undefined,
                }}
                eventHandlers={
                  onSelectRoute
                    ? { click: () => onSelectRoute(route.id) }
                    : undefined
                }
              >
                <Popup>
                  <div className="marine-map-popup">
                    <div className="marine-map-popup-head">
                      <div className="marine-map-popup-title">{route.name || "Route corridor"}</div>
                      <span className="marine-map-badge" style={{ background: routeColor }}>
                        {route.resolvedDecision}
                      </span>
                    </div>
                    {route.origin?.name && route.destination?.name && (
                      <div>{route.origin.name} → {route.destination.name}</div>
                    )}
                    <div>Risk: <b>{route.calculatedScore}/100</b></div>
                    {typeof route.distanceKm === "number" && <div>Distance: {route.distanceKm} km</div>}
                    {typeof route.estimatedDurationHours === "number" && (
                      <div>Est. time: {route.estimatedDurationHours} hrs</div>
                    )}
                    {route.conditions?.wind && <div>Wind: {route.conditions.wind}</div>}
                    {route.reason && (
                      <div className="marine-map-popup-reason">{route.reason}</div>
                    )}
                    <div className="marine-map-popup-data-status">Data: Configured dataset</div>
                    {routeOriginArea && routeDestinationArea && routeOriginArea !== routeDestinationArea && (
                      <AskSagarButton
                        prompt={`Why is the safest route from ${routeOriginArea} to ${routeDestinationArea}?`}
                        label="Ask Sagar"
                        size="sm"
                        fullWidth
                        className="marine-map-popup-ask"
                      />
                    )}
                  </div>
                </Popup>
              </Polyline>
            );
          })}

        {/* MARINE MODEL: WIND - directional arrows scaled by speed
            (Open-Meteo Weather Forecast API, not the Marine API). */}
        {activeLayers.wind &&
          modelPoints
            .filter((point) => typeof point.windSpeed === "number")
            .map((point) => (
              <Marker
                key={`wind-${point.latitude}-${point.longitude}`}
                position={[point.latitude, point.longitude]}
                icon={windIcon(point)}
              >
                {modelPointPopup(
                  point,
                  <>
                    <div>Wind speed: <b>{point.windSpeed?.toFixed(1)} kn</b></div>
                    {typeof point.windDirection === "number" && (
                      <div>Wind direction: {Math.round(point.windDirection)}&deg;</div>
                    )}
                  </>
                )}
              </Marker>
            ))}

        {/* MARINE MODEL: OCEAN CURRENT - directional arrows scaled by
            velocity. */}
        {activeLayers.current &&
          modelPoints
            .filter((point) => typeof point.currentVelocity === "number")
            .map((point) => (
              <Marker
                key={`current-${point.latitude}-${point.longitude}`}
                position={[point.latitude, point.longitude]}
                icon={currentIcon(point)}
              >
                {modelPointPopup(
                  point,
                  <>
                    <div>Current velocity: <b>{point.currentVelocity?.toFixed(2)} kn</b></div>
                    {typeof point.currentDirection === "number" && (
                      <div>Current direction: {Math.round(point.currentDirection)}&deg;</div>
                    )}
                  </>
                )}
              </Marker>
            ))}

        {/* MARINE MODEL: TIDE / SEA LEVEL - modeled sea-level height,
            rendered separately from waves/current and explicitly
            marked as a model limitation (not a harmonic tide-table
            prediction) in its own popup. */}
        {activeLayers.tide &&
          modelPoints
            .filter((point) => typeof point.seaLevelHeight === "number")
            .map((point) => (
              <CircleMarker
                key={`tide-${point.latitude}-${point.longitude}`}
                center={[point.latitude, point.longitude]}
                radius={6}
                pathOptions={{
                  color: "#0e2a43",
                  fillColor: "#0e2a43",
                  fillOpacity: 0.55,
                  weight: 2,
                }}
              >
                {modelPointPopup(
                  point,
                  <>
                    <div>Sea-level height (MSL): <b>{point.seaLevelHeight?.toFixed(2)} m</b></div>
                    <div className="marine-map-popup-note">
                      Modeled sea-level height, not a harmonic tide-table prediction - do not use for
                      precise tidal-window planning.
                    </div>
                  </>
                )}
              </CircleMarker>
            ))}

        {/* ROUTE PLANNER START / DESTINATION MARKERS */}
        {startMarkerPosition && (
          <CircleMarker
            center={startMarkerPosition}
            radius={8}
            pathOptions={{ color: "#FFFFFF", fillColor: MAP_NAVY, fillOpacity: 1, weight: 3 }}
          >
            <Popup>Departure point</Popup>
          </CircleMarker>
        )}

        {endMarkerPosition && (
          <CircleMarker
            center={endMarkerPosition}
            radius={8}
            pathOptions={{ color: "#FFFFFF", fillColor: "#159a68", fillOpacity: 1, weight: 3 }}
          >
            <Popup>Destination</Popup>
          </CircleMarker>
        )}

        {/* JOURNEY SIMULATION MARKER - a demo passage playback along the
            selected route's real waypoints, never live vessel tracking
            or AIS. Explicitly labelled as such, never LIVE/AIS/REAL-TIME. */}
        {journeyMarkerPosition && (
          <Marker position={journeyMarkerPosition} icon={boatIcon}>
            <Popup>
              <div className="marine-map-popup">
                <div className="marine-map-popup-head">
                  <div className="marine-map-popup-title">Demo passage</div>
                  <span className="marine-map-badge marine-map-badge-simulation">
                    Simulated vessel
                  </span>
                </div>
                <div>Simulated playback of the selected route - not AIS, not live tracking.</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* CHAT -> MAP HANDOFF HIGHLIGHT */}
        {highlightPosition && (
          <>
            <CircleMarker
              center={highlightPosition}
              radius={22}
              pathOptions={{
                color: MAP_TEAL,
                fillColor: MAP_TEAL,
                fillOpacity: 0.1,
                weight: 2,
                dashArray: "3, 5",
              }}
            />
            <CircleMarker
              center={highlightPosition}
              radius={9}
              pathOptions={{
                color: "#FFFFFF",
                fillColor: MAP_TEAL,
                fillOpacity: 1,
                weight: 3,
              }}
            >
              {highlight?.label && <Popup>{highlight.label}</Popup>}
            </CircleMarker>
          </>
        )}

        {/* USER POSITION - a real GPS-fix marker: a steady center dot plus
            an animated accuracy pulse (CSS-driven, via the SVG path's own
            className - no extra DOM, no changed marker semantics). */}
        {location && (
          <>
            <CircleMarker
              center={[location.latitude, location.longitude]}
              radius={18}
              pathOptions={{
                color: MAP_NAVY,
                fillColor: MAP_NAVY,
                fillOpacity: 0.12,
                weight: 1,
                className: "marine-map-location-pulse",
              }}
            />
            <CircleMarker
              center={[location.latitude, location.longitude]}
              radius={7}
              pathOptions={{ color: "#FFFFFF", fillColor: MAP_NAVY, fillOpacity: 1, weight: 3 }}
            />
          </>
        )}
      </MapContainer>

      {/* Control Overlay */}
      <div className="marine-map-overlay">
        <div className="marine-map-topbar">
          {showStatusPill && (
            <div className="marine-map-status">
              <span
                className={`marine-map-status-dot marine-map-status-dot-${mapDataState.toLowerCase()}`}
              />
              <span className="marine-map-status-text">
                <span className="marine-map-status-title">Marine map</span>
                {derivedContextLabel && (
                  <span className="marine-map-status-context">
                    {derivedContextLabel}
                  </span>
                )}
              </span>
              <span
                className={`marine-map-status-badge marine-map-status-badge-${mapDataState.toLowerCase()}`}
              >
                {mapDataState}
              </span>
            </div>
          )}

          <button
            type="button"
            className="marine-map-layer-button"
            onClick={() => setLayersOpen((open) => !open)}
            aria-expanded={layersOpen}
          >
            Layers ({activeCount})
          </button>
        </div>

        {layersOpen && (
          <div className="marine-map-layer-panel">
            <MapLayers activeLayers={activeLayers} onToggle={toggleLayer} />
            <MapLegend activeLayers={activeLayers} />
          </div>
        )}

        {anyModelLayerActive && (
          <div
            className={`marine-map-model-status ${
              modelLoading && !hasModelPoints
                ? "marine-map-model-status-loading"
                : modelError
                  ? "marine-map-model-status-unavailable"
                  : ""
            }`}
            role="status"
          >
            <span className="marine-map-model-status-dot" />
            <span className="marine-map-model-status-text">
              {modelLoading && !hasModelPoints
                ? "Loading marine model…"
                : modelError
                  ? hasModelPoints
                    ? "Model refresh failed · last known"
                    : "Marine model unavailable"
                  : "Marine model output"}
              {hasModelPoints && modelValidAt && (
                <span className="marine-map-model-status-time">
                  {" "}
                  &middot; valid {modelValidAt}
                </span>
              )}
            </span>
          </div>
        )}

        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onLocate={handleLocate}
          onLayers={() => setLayersOpen((open) => !open)}
          isLocated={Boolean(location)}
          onFitRoute={routeBoundsPoints.length > 0 ? handleFitRoute : undefined}
          onFullscreen={handleFullscreen}
          isFullscreen={isFullscreen}
        />

        {!location ? (
          <div className="marine-map-location-status">
            <span>Tap locate to show position</span>
          </div>
        ) : (
          <div className="marine-map-location-status marine-map-location-live">
            <span className="marine-map-location-dot" />
            <span>Location active</span>
          </div>
        )}
      </div>
    </div>
  );
}
