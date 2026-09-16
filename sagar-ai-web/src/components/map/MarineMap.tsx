import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useState, useCallback } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, Polyline, Polygon, Popup, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import type { LatLngExpression, Map as LeafletMap } from "leaflet";

import MapControls from "./MapControls";
import MapLayers, { type MapLayerKey } from "./MapLayers";
import MapLegend from "./MapLegend";
import { APP_CONFIG } from "../../constants/config";
import { getMarineAreas } from "../../services/marine/marineData";
import { getAlerts } from "../../services/alerts/alertService";
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
   * back to the local configured dataset when not supplied, so Home
   * and Route (which render this map without fetching areas
   * themselves) keep working unchanged. */
  areas?: MarineArea[];
  /** Real active alerts to plot as hazard markers. Falls back to the
   * local alert dataset when not supplied, for the same reason. */
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

function MapSyncController({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !map.getContainer()) return;
    map.setView(center, zoom, { animate: false });
    const timer = setTimeout(() => {
      if (map && map.getContainer()) map.invalidateSize(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [map, center, zoom]);

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
}: MarineMapProps) {
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);

  const [activeLayers, setActiveLayers] = useState<Record<MapLayerKey, boolean>>({
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

  // Real configured marine areas (monitoring stations) - a prop when
  // the host page already fetched them (Map.tsx), otherwise the same
  // local dataset every other page already reads from.
  const areaList = useMemo(() => {
    const source = areas ?? getMarineAreas();

    return source
      .map((area) => {
        const latLng = toLatLng(area.coordinates);
        return latLng ? { area, latLng } : null;
      })
      .filter((item): item is { area: MarineArea; latLng: [number, number] } => item !== null);
  }, [areas]);

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

  const activeCount = useMemo(() => Object.values(activeLayers).filter(Boolean).length, [activeLayers]);

  return (
    <div className={`marine-map ${className}`.trim()}>
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

        {routeBoundsPoints.length > 0 && (
          <RouteBoundsController points={routeBoundsPoints} />
        )}

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
                    {typeof area.conditions?.waveHeightM === "number" && (
                      <div>Wave height: {area.conditions.waveHeightM} m</div>
                    )}
                    {typeof area.conditions?.windSpeedKnots === "number" && (
                      <div>Wind speed: {area.conditions.windSpeedKnots} kn</div>
                    )}
                    {typeof area.safety?.riskScore === "number" && (
                      <div>Risk: <b>{area.safety.overallRisk}</b> ({area.safety.riskScore}/100)</div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {/* 2. FISHING ZONES (PFZ) LAYER */}
        {activeLayers.pfz &&
          fishingZonesList.map((zone: any, idx: number) => {
            const color = zoneRecommendationColor(zone.recommendation);

            return (
              <Polygon
                key={zone.id || idx}
                positions={zone.parsedCoordinates}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.18,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="marine-map-popup">
                    <div className="marine-map-popup-title">{zone.name || "Fishing zone"}</div>
                    <div>
                      Status: <b style={{ color }}>{zone.recommendation}</b>
                    </div>
                    {zone.suitability && <div>Suitability: {zone.suitability}</div>}
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
                      <div>Species observed: <i>{zone.fishSpecies.join(", ")}</i></div>
                    )}
                  </div>
                </Popup>
              </Polygon>
            );
          })}

        {/* 3. ACTIVE ALERTS (real hazards) LAYER */}
        {activeLayers.alerts &&
          alertList.map(({ alert, latLng }) => (
            <Marker key={alert.id} position={latLng} icon={alertIcons(alert.severity)}>
              <Popup>
                <div className="marine-map-popup">
                  <div className="marine-map-popup-title">{alert.title}</div>
                  <div>
                    Severity:{" "}
                    <b style={{ color: alertSeverityColor(alert.severity) }}>
                      {alert.severity.toUpperCase()}
                    </b>
                  </div>
                  <div>Type: {formatAlertType(alert.type)}</div>
                  <div>Area: {alert.location.name}</div>
                  <div>{alert.recommendation}</div>
                </div>
              </Popup>
            </Marker>
          ))}

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
                    <div className="marine-map-popup-title">{route.name || "Route corridor"}</div>
                    {route.origin?.name && route.destination?.name && (
                      <div>{route.origin.name} → {route.destination.name}</div>
                    )}
                    <div>
                      Status:{" "}
                      <b style={{ color: routeColor, textTransform: "capitalize" }}>
                        {route.resolvedDecision}
                      </b>
                    </div>
                    <div>Risk: <b>{route.calculatedScore}/100</b></div>
                    {typeof route.distanceKm === "number" && <div>Distance: {route.distanceKm} km</div>}
                    {typeof route.estimatedDurationHours === "number" && (
                      <div>Est. time: {route.estimatedDurationHours} hrs</div>
                    )}
                    {route.conditions?.wind && <div>Wind: {route.conditions.wind}</div>}
                    {route.reason && (
                      <div className="marine-map-popup-reason">{route.reason}</div>
                    )}
                  </div>
                </Popup>
              </Polyline>
            );
          })}

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

        {/* JOURNEY SIMULATION MARKER (demo only, not live vessel tracking) */}
        {journeyMarkerPosition && (
          <Marker position={journeyMarkerPosition} icon={boatIcon}>
            <Popup>Route simulation (demo)</Popup>
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

        {/* USER POSITION */}
        {location && (
          <>
            <CircleMarker
              center={[location.latitude, location.longitude]}
              radius={7}
              pathOptions={{ color: "#FFFFFF", fillColor: MAP_NAVY, fillOpacity: 1, weight: 3 }}
            />
            <CircleMarker
              center={[location.latitude, location.longitude]}
              radius={18}
              pathOptions={{ color: MAP_NAVY, fillColor: MAP_NAVY, fillOpacity: 0.12, weight: 1 }}
            />
          </>
        )}
      </MapContainer>

      {/* Control Overlay */}
      <div className="marine-map-overlay">
        <div className="marine-map-topbar">
          <div className="marine-map-status">
            <span className="marine-map-status-dot" />
            <span>MARINE MAP</span>
          </div>

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

        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onLocate={handleLocate}
          onLayers={() => setLayersOpen((open) => !open)}
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
