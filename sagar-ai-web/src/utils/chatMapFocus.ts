/**
 * Derives what an embedded map panel should focus on from a Sagar chat
 * message, using only the structured fields the backend already
 * resolved (route/zones/alerts/affectedArea) - never by parsing the
 * natural-language answer. Coordinates for a zone come from the same
 * local fishingZones dataset the map itself renders from, matching the
 * lookup pattern already used by the standalone Map page for areas.
 */
import fishingZonesData from "../data/fishingZones.json";
import type { RankedFishingZone } from "../services/api/sagarApiClient";
import type { Alert } from "../types/alert";
import type { MarineArea } from "../types/marine";
import type { RoutePlan } from "../types/route";

export type ChatMapFocusKind = "route" | "zone" | "alert" | "area";

export interface ChatMapFocus {
  kind: ChatMapFocusKind;
  center: { latitude: number; longitude: number };
  zoom?: number;
  highlight?: { latitude: number; longitude: number; label?: string } | null;
  route?: RoutePlan | null;
  alerts?: Alert[];
  areaName?: string;
}

export interface ChatMapFocusSource {
  route?: RoutePlan | null;
  zones?: RankedFishingZone[];
  alerts?: Alert[];
  affectedAreaId?: string;
}

function zoneCentroid(
  zoneId: string
): { latitude: number; longitude: number } | null {
  const list: any[] =
    (fishingZonesData as any)?.zones ?? (fishingZonesData as any) ?? [];

  const zone = list.find((item) => item?.id === zoneId);
  const coords: unknown = zone?.coordinates ?? zone?.polygon;

  if (!Array.isArray(coords) || coords.length === 0) {
    return null;
  }

  let sumLat = 0;
  let sumLng = 0;
  let count = 0;

  for (const point of coords) {
    if (Array.isArray(point) && point.length >= 2) {
      sumLat += point[0];
      sumLng += point[1];
      count += 1;
    }
  }

  if (count === 0) {
    return null;
  }

  return { latitude: sumLat / count, longitude: sumLng / count };
}

export function buildChatMapFocus(
  source: ChatMapFocusSource,
  marineAreas: MarineArea[]
): ChatMapFocus | null {
  if (source.route) {
    const { origin, destination } = source.route;

    return {
      kind: "route",
      center: origin,
      zoom: 9,
      highlight: { ...destination, label: destination.name },
      route: source.route,
    };
  }

  if (source.zones && source.zones.length > 0) {
    const top = source.zones[0];
    const centroid = zoneCentroid(top.id);

    if (centroid) {
      return {
        kind: "zone",
        center: centroid,
        zoom: 10,
        highlight: { ...centroid, label: top.name },
      };
    }
  }

  // The resolved area (what the user actually asked about) takes
  // priority over the alert set: "alerts" on a safety/alerts-intent
  // answer is the backend's full active-alert list, not filtered to
  // this area, so centering on alerts[0] can silently point the map at
  // an unrelated location. Alerts still render as markers via
  // MarineMap's own alert layer regardless of map center.
  if (source.affectedAreaId) {
    const area = marineAreas.find((item) => item.id === source.affectedAreaId);

    if (area?.coordinates) {
      return {
        kind: "area",
        center: area.coordinates,
        zoom: 10,
        highlight: { ...area.coordinates, label: area.name },
        areaName: area.name,
      };
    }
  }

  if (source.alerts && source.alerts.length > 0) {
    const first = source.alerts[0];

    return {
      kind: "alert",
      center: {
        latitude: first.location.latitude,
        longitude: first.location.longitude,
      },
      zoom: 10,
      highlight: {
        latitude: first.location.latitude,
        longitude: first.location.longitude,
        label: first.title,
      },
      alerts: source.alerts,
    };
  }

  return null;
}
