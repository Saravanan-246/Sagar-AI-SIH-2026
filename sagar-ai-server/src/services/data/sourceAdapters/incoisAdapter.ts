import https from "node:https";
import tls from "node:tls";

import type {
  RetrievalRequest,
  RetrievalResult,
} from "../dataRetrieval";
import { computeFreshness } from "../freshnessEngine";
import type { FreshnessStatus } from "../dataContract";

/*
 * INCOIS's ERDDAP server sends only its leaf TLS certificate, omitting
 * the intermediate CA (a real, verified misconfiguration on their
 * end - confirmed via `openssl s_client -showcerts`, which shows a
 * one-certificate chain). Browsers and curl tolerate this by fetching
 * the missing intermediate themselves (AIA chasing); Node's fetch does
 * not, and fails closed with "unable to verify the first certificate".
 *
 * The fix is to supply the correct intermediate explicitly - NOT to
 * disable certificate verification, which would blindly trust
 * anything. This is GlobalSign's own "GlobalSign RSA OV SSL CA 2018"
 * certificate, fetched from the exact CA-Issuers URL published in the
 * leaf certificate's own Authority Information Access extension
 * (http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt) and
 * confirmed via `openssl verify` to chain correctly to GlobalSign's
 * root (already trusted by Node by default). Public CA certificate,
 * not a secret.
 */
const INCOIS_INTERMEDIATE_CA = `-----BEGIN CERTIFICATE-----
MIIETjCCAzagAwIBAgINAe5fIh38YjvUMzqFVzANBgkqhkiG9w0BAQsFADBMMSAw
HgYDVQQLExdHbG9iYWxTaWduIFJvb3QgQ0EgLSBSMzETMBEGA1UEChMKR2xvYmFs
U2lnbjETMBEGA1UEAxMKR2xvYmFsU2lnbjAeFw0xODExMjEwMDAwMDBaFw0yODEx
MjEwMDAwMDBaMFAxCzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9iYWxTaWduIG52
LXNhMSYwJAYDVQQDEx1HbG9iYWxTaWduIFJTQSBPViBTU0wgQ0EgMjAxODCCASIw
DQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKdaydUMGCEAI9WXD+uu3Vxoa2uP
UGATeoHLl+6OimGUSyZ59gSnKvuk2la77qCk8HuKf1UfR5NhDW5xUTolJAgvjOH3
idaSz6+zpz8w7bXfIa7+9UQX/dhj2S/TgVprX9NHsKzyqzskeU8fxy7quRU6fBhM
abO1IFkJXinDY+YuRluqlJBJDrnw9UqhCS98NE3QvADFBlV5Bs6i0BDxSEPouVq1
lVW9MdIbPYa+oewNEtssmSStR8JvA+Z6cLVwzM0nLKWMjsIYPJLJLnNvBhBWk0Cq
o8VS++XFBdZpaFwGue5RieGKDkFNm5KQConpFmvv73W+eka440eKHRwup08CAwEA
AaOCASkwggElMA4GA1UdDwEB/wQEAwIBhjASBgNVHRMBAf8ECDAGAQH/AgEAMB0G
A1UdDgQWBBT473/yzXhnqN5vjySNiPGHAwKz6zAfBgNVHSMEGDAWgBSP8Et/qC5F
JK5NUPpjmove4t0bvDA+BggrBgEFBQcBAQQyMDAwLgYIKwYBBQUHMAGGImh0dHA6
Ly9vY3NwMi5nbG9iYWxzaWduLmNvbS9yb290cjMwNgYDVR0fBC8wLTAroCmgJ4Yl
aHR0cDovL2NybC5nbG9iYWxzaWduLmNvbS9yb290LXIzLmNybDBHBgNVHSAEQDA+
MDwGBFUdIAAwNDAyBggrBgEFBQcCARYmaHR0cHM6Ly93d3cuZ2xvYmFsc2lnbi5j
b20vcmVwb3NpdG9yeS8wDQYJKoZIhvcNAQELBQADggEBAJmQyC1fQorUC2bbmANz
EdSIhlIoU4r7rd/9c446ZwTbw1MUcBQJfMPg+NccmBqixD7b6QDjynCy8SIwIVbb
0615XoFYC20UgDX1b10d65pHBf9ZjQCxQNqQmJYaumxtf4z1s4DfjGRzNpZ5eWl0
6r/4ngGPoJVpjemEuunl1Ig423g7mNA2eymw0lIYkN5SQwCuaifIFJ6GlazhgDEw
fpolu4usBCOmmQDo8dIm7A9+O4orkjgTHY+GzYZSR+Y0fFukAj6KYXwidlNalFMz
hriSqHKvoflShx8xpfywgVcvzfTO3PYkz6fiNJBonf6q8amaEsybwMbDqKWwIX7e
SPY=
-----END CERTIFICATE-----`;

const incoisHttpsAgent = new https.Agent({
  ca: [...tls.rootCertificates, INCOIS_INTERMEDIATE_CA],
});

export interface INCOISOceanRecord {
  id: string;

  location: string;

  latitude?: number;
  longitude?: number;

  seaSurfaceTemperatureC?: number;
  chlorophyllMgM3?: number;

  waveHeightM?: number;
  waveDirection?: string;

  productivityIndex?: number;
  productivitySignal?: string;

  fishingAdvisory?: string;

  issuedAt?: string;
  validUntil?: string;

  source: "INCOIS";

  /** Present only on a genuinely fetched reading (never on the
   * "not connected"/empty stub path). The dataset's own analysis
   * timestamp - never fabricated. */
  observedAt?: string;
  freshness?: FreshnessStatus;
  /** Set when the queried area has no data coverage and the nearest
   * valid open-ocean grid point was used instead - always disclosed,
   * never silently substituted as if it were the requested area. */
  distanceFromAreaKm?: number;
  queriedLatitude?: number;
  queriedLongitude?: number;
}

export interface INCOISAdapter {
  getOceanInformation(
    request: RetrievalRequest
  ): Promise<
    RetrievalResult<INCOISOceanRecord>
  >;
}

const SOURCE_NAME = "Indian National Centre for Ocean Information Services";

/*
 * ------------------------------------------------------------------
 * REAL, VERIFIED INTEGRATION - INCOIS's public ERDDAP server
 * (https://erddap.incois.gov.in/erddap/), confirmed reachable without
 * any API key by directly querying it during implementation.
 *
 * Deliberately NOT claiming this is "live": every dataset on this
 * server is a satellite/ocean-model composite. The one used here
 * (incois_argo_10day_McCreary, a real INCOIS-maintained ARGO-based
 * temperature analysis) is *intended* to update on a ~10-day cadence
 * per its own name, but re-verified live (2026-09-19): its actual
 * latest analysis time was 2026-07-30 - roughly 7 weeks old, not 10
 * days - so the real cadence cannot be assumed from the dataset's name.
 * Never hardcode an assumed age here; computeFreshness() (below, via
 * the real `observedAt` this adapter returns) is the only source of
 * truth for how old a given reading actually is, and correctly
 * reports STALE once it exceeds ocean_composite's 45-day threshold -
 * exactly what a 7-week-old reading now gets. Also verified by
 * directly querying a grid of points around Tamil Nadu: this dataset
 * has NO data coverage in the shallow coastal Gulf of Mannar/Palk Bay
 * area itself (ARGO floats don't operate in shallow coastal water).
 * The nearest valid grid cell is typically 100+ km offshore. This
 * adapter never substitutes that distant reading as if it were the
 * requested coastal area's own condition - it always reports the real
 * distance, and callers must present it as regional open-ocean context
 * only, never as the area's own reading and never feed it into
 * risk/route/zone scoring (which remain exclusively local-dataset-
 * driven). Given both the real staleness and the offshore-only
 * coverage, this is deliberately never rendered as a map layer/marker
 * either - only as a disclosed supplementary text citation in chat
 * evidence, where the caveats are legible next to the number.
 * ------------------------------------------------------------------
 */

const ERDDAP_BASE = "https://erddap.incois.gov.in/erddap/griddap/incois_argo_10day_McCreary.json";
const SURFACE_DEPTH_M = 5.0;
const SEARCH_RADIUS_DEG = 2.5;
const FETCH_TIMEOUT_MS = 5000;

// Re-querying more often than this would only ever hammer the server
// for an identical answer - this dataset changes at most every few
// days even when it IS updating normally. Not a claim about how fresh
// the data actually is; see computeFreshness()/the block comment above.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
  result: RetrievalResult<INCOISOceanRecord>;
  expiresAt: number;
}

// Keyed by 1-decimal-degree-rounded lat/lon (the dataset's own grid
// resolution), so nearby areas share a cache entry instead of each
// triggering their own external request.
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RetrievalResult<INCOISOceanRecord>>>();

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(1)},${longitude.toFixed(1)}`;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(bLat - aLat);
  const deltaLon = toRadians(bLon - aLon);

  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) *
      Math.cos(toRadians(bLat)) *
      Math.sin(deltaLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function createEmptyResult(
  message: string,
  retrievedAt: string = new Date().toISOString()
): RetrievalResult<INCOISOceanRecord> {
  return {
    sourceId: "incois",
    sourceName: SOURCE_NAME,
    domain: "marine",
    status: "empty",
    records: [],
    recordCount: 0,
    retrievedAt,
    local: false,
    message,
  };
}

interface ErddapRow {
  time: string;
  ZAX: number;
  latitude: number;
  longitude: number;
  T_ANALYZED: number | null;
}

interface ValidErddapRow extends ErddapRow {
  T_ANALYZED: number;
}

interface HttpsJsonResult {
  statusCode: number;
  body: unknown;
}

/**
 * A minimal HTTPS GET returning parsed JSON, using the CA bundle above
 * so this specific host's incomplete certificate chain verifies
 * correctly. Times out via a real socket-level timeout (not just an
 * abort after the fact) so a hung connection can't outlast the budget.
 */
function httpsGetJson(url: string, timeoutMs: number): Promise<HttpsJsonResult> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: incoisHttpsAgent, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf-8");
          resolve({ statusCode: res.statusCode ?? 0, body: JSON.parse(text) });
        } catch (parseError) {
          reject(parseError instanceof Error ? parseError : new Error("Invalid JSON response"));
        }
      });
    });

    req.on("timeout", () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
    req.on("error", reject);
  });
}

async function fetchNearestReading(
  latitude: number,
  longitude: number
): Promise<RetrievalResult<INCOISOceanRecord>> {
  const minLat = latitude - SEARCH_RADIUS_DEG;
  const maxLat = latitude + SEARCH_RADIUS_DEG;
  const minLon = longitude - SEARCH_RADIUS_DEG;
  const maxLon = longitude + SEARCH_RADIUS_DEG;

  const query =
    `T_ANALYZED%5B(last)%5D%5B(${SURFACE_DEPTH_M})%5D` +
    `%5B(${minLat}):(${maxLat})%5D%5B(${minLon}):(${maxLon})%5D`;

  const url = `${ERDDAP_BASE}?${query}`;

  try {
    const { statusCode, body: rawBody } = await httpsGetJson(url, FETCH_TIMEOUT_MS);

    if (statusCode < 200 || statusCode >= 300) {
      return createEmptyResult(
        `INCOIS ERDDAP request failed with status ${statusCode}. Continuing with Sagar's local ocean dataset.`
      );
    }

    const body = rawBody as {
      table?: { columnNames: string[]; rows: Array<[string, number, number, number, number | null]> };
    };

    const rows = body.table?.rows ?? [];

    const valid: ValidErddapRow[] = rows
      .map((row) => ({
        time: row[0],
        ZAX: row[1],
        latitude: row[2],
        longitude: row[3],
        T_ANALYZED: row[4],
      }))
      .filter((row): row is ValidErddapRow => typeof row.T_ANALYZED === "number" && Number.isFinite(row.T_ANALYZED));

    if (valid.length === 0) {
      return createEmptyResult(
        "INCOIS ERDDAP has no ocean-temperature coverage within range of this area (its ARGO-based analysis does not extend into shallow coastal water). Continuing with Sagar's local ocean dataset."
      );
    }

    let nearest = valid[0];
    let nearestDistanceKm = haversineDistanceKm(latitude, longitude, nearest.latitude, nearest.longitude);

    for (const candidate of valid.slice(1)) {
      const distanceKm = haversineDistanceKm(latitude, longitude, candidate.latitude, candidate.longitude);
      if (distanceKm < nearestDistanceKm) {
        nearest = candidate;
        nearestDistanceKm = distanceKm;
      }
    }

    const fetchedAt = new Date().toISOString();
    const freshness = computeFreshness("ocean_composite", nearest.time, fetchedAt);

    const record: INCOISOceanRecord = {
      id: `incois-argo-${nearest.time}-${nearest.latitude}-${nearest.longitude}`,
      location: "Regional open-ocean reference point",
      latitude: nearest.latitude,
      longitude: nearest.longitude,
      seaSurfaceTemperatureC: nearest.T_ANALYZED,
      source: "INCOIS",
      observedAt: nearest.time,
      freshness,
      distanceFromAreaKm: Math.round(nearestDistanceKm),
      queriedLatitude: latitude,
      queriedLongitude: longitude,
    };

    return {
      sourceId: "incois",
      sourceName: SOURCE_NAME,
      domain: "marine",
      status: "success",
      records: [record],
      recordCount: 1,
      retrievedAt: fetchedAt,
      local: false,
      message:
        nearestDistanceKm > 25
          ? `Nearest available INCOIS ocean-temperature reading is ~${Math.round(nearestDistanceKm)} km offshore of the requested area (no coastal coverage) - shown as regional context, not this area's own reading.`
          : undefined,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.message.includes("timed out");

    return createEmptyResult(
      timedOut
        ? `INCOIS ERDDAP request timed out after ${FETCH_TIMEOUT_MS}ms. Continuing with Sagar's local ocean dataset.`
        : `INCOIS ERDDAP request failed: ${error instanceof Error ? error.message : "unknown error"}. Continuing with Sagar's local ocean dataset.`
    );
  }
}

async function getCachedReading(
  latitude: number,
  longitude: number
): Promise<RetrievalResult<INCOISOceanRecord>> {
  const key = cacheKey(latitude, longitude);
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const promise = fetchNearestReading(latitude, longitude)
    .then((result) => {
      cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

export const incoisAdapter: INCOISAdapter = {
  async getOceanInformation(
    request
  ): Promise<
    RetrievalResult<INCOISOceanRecord>
  > {
    if (typeof request.latitude !== "number" || typeof request.longitude !== "number") {
      return createEmptyResult(
        "No coordinates were provided for an INCOIS ocean lookup."
      );
    }

    return getCachedReading(request.latitude, request.longitude);
  },
};

export async function getINCOISOceanInformation(
  request: RetrievalRequest
): Promise<
  RetrievalResult<INCOISOceanRecord>
> {
  return incoisAdapter.getOceanInformation(
    request
  );
}

export function isINCOISAdapterConfigured(): boolean {
  return true;
}

export default incoisAdapter;
