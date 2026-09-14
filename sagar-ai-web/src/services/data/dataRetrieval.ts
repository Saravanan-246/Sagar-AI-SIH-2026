import marineData from "../../data/marine.json";
import alertsData from "../../data/alerts.json";
import routesData from "../../data/routes.json";
import scenariosData from "../../data/scenarios.json";
import productivityData from "../../data/productivity.json";
import boundariesData from "../../data/boundaries.json";
import fishingZonesData from "../../data/fishingZones.json";

import {
  getSourceById,
  isSourceAvailable,
} from "./sourceRegistry";

import type { DataDomain } from "./dataDiscovery";

export interface RetrievalRequest {
  sourceId: string;

  domain?: DataDomain;

  query?: string;

  areaId?: string;

  areaName?: string;

  latitude?: number;
  longitude?: number;

  parameters?: Record<
    string,
    unknown
  >;
}

export interface RetrievalResult<T = unknown> {
  sourceId: string;

  sourceName: string;

  domain: DataDomain;

  status:
    | "success"
    | "empty"
    | "failed";

  records: T[];

  recordCount: number;

  retrievedAt: string;

  local: boolean;

  message?: string;
}

function asArray<T>(
  value: unknown
): T[] {
  return Array.isArray(value)
    ? value
    : [];
}

function normalize(
  value: unknown
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function matchesText(
  record: unknown,
  query: string
): boolean {
  if (!query) {
    return true;
  }

  const searchable =
    JSON.stringify(record)
      .toLowerCase();

  return searchable.includes(
    normalize(query)
  );
}

function matchesArea(
  record: unknown,
  areaId?: string,
  areaName?: string
): boolean {
  if (!areaId && !areaName) {
    return true;
  }

  if (
    !record ||
    typeof record !== "object"
  ) {
    return false;
  }

  const item = record as Record<
    string,
    unknown
  >;

  const recordAreaId =
    normalize(
      item.areaId ??
        item.area_id
    );

  const recordAreaName =
    normalize(
      item.areaName ??
        item.area_name ??
        item.name
    );

  if (
    areaId &&
    recordAreaId ===
      normalize(areaId)
  ) {
    return true;
  }

  if (
    areaName &&
    (
      recordAreaName ===
        normalize(areaName) ||
      recordAreaName.includes(
        normalize(areaName)
      ) ||
      normalize(areaName).includes(
        recordAreaName
      )
    )
  ) {
    return true;
  }

  return false;
}

function filterRecords<T>(
  records: T[],
  request: RetrievalRequest
): T[] {
  return records.filter(
    (record) =>
      matchesText(
        record,
        request.query ?? ""
      ) &&
      matchesArea(
        record,
        request.areaId,
        request.areaName
      )
  );
}

function getLocalDataset(
  sourceId: string
): unknown[] {
  switch (sourceId) {
    case "local-marine":
      return (
        (
          marineData as {
            areas?: unknown[];
          }
        ).areas ?? []
      );

    case "local-weather":
      return (
        (
          marineData as {
            areas?: unknown[];
          }
        ).areas ?? []
      );

    case "local-ocean":
      return asArray(
        productivityData
      );

    case "local-boundaries":
      return asArray(
        boundariesData
      );

    case "local-alerts":
      return asArray(
        alertsData
      );

    case "local-routes":
      return asArray(
        routesData
      );

    case "local-scenarios":
      return asArray(
        scenariosData
      );

    /*
     * Fishing zones are operational ocean
     * information and can be retrieved as
     * part of the ocean domain.
     */
    case "local-fishing-zones":
      return asArray(
        fishingZonesData
      );

    default:
      return [];
  }
}

function filterWeatherRecords(
  records: unknown[],
  request: RetrievalRequest
): unknown[] {
  /*
   * Weather values are currently carried in
   * the marine-area records. Keep them here
   * so a future live weather adapter can replace
   * this implementation without changing agents.
   */
  return filterRecords(
    records,
    request
  );
}

function retrieveLocal(
  request: RetrievalRequest
): RetrievalResult {
  const source =
    getSourceById(
      request.sourceId
    );

  if (!source) {
    return {
      sourceId:
        request.sourceId,

      sourceName:
        "Unknown source",

      domain:
        request.domain ??
        "marine",

      status: "failed",

      records: [],

      recordCount: 0,

      retrievedAt:
        new Date().toISOString(),

      local: true,

      message:
        `Data source "${request.sourceId}" is not registered.`,
    };
  }

  const raw =
    getLocalDataset(
      request.sourceId
    );

  const records =
    request.sourceId ===
    "local-weather"
      ? filterWeatherRecords(
          raw,
          request
        )
      : filterRecords(
          raw,
          request
        );

  return {
    sourceId:
      source.id,

    sourceName:
      source.name,

    domain:
      source.domain,

    status:
      records.length > 0
        ? "success"
        : "empty",

    records,

    recordCount:
      records.length,

    retrievedAt:
      new Date().toISOString(),

    local: true,

    message:
      records.length === 0
        ? "No matching records were found in the configured dataset."
        : undefined,
  };
}

export async function retrieveData<T = unknown>(
  request: RetrievalRequest
): Promise<
  RetrievalResult<T>
> {
  try {
    const source =
      getSourceById(
        request.sourceId
      );

    if (!source) {
      return {
        sourceId:
          request.sourceId,

        sourceName:
          "Unknown source",

        domain:
          request.domain ??
          "marine",

        status: "failed",

        records: [],

        recordCount: 0,

        retrievedAt:
          new Date().toISOString(),

        local: false,

        message:
          `Source "${request.sourceId}" was not found in the registry.`,
      } as RetrievalResult<T>;
    }

    /*
     * External sources are registered but not
     * falsely treated as live integrations.
     */
    if (
      !source.local ||
      !isSourceAvailable(
        source.id
      )
    ) {
      return {
        sourceId:
          source.id,

        sourceName:
          source.name,

        domain:
          source.domain,

        status: "empty",

        records: [],

        recordCount: 0,

        retrievedAt:
          new Date().toISOString(),

        local: false,

        message:
          source.status === "planned"
            ? `${source.name} is registered for future integration but no live adapter is currently connected.`
            : `${source.name} is currently unavailable.`,
      } as RetrievalResult<T>;
    }

    const result =
      retrieveLocal(
        request
      );

    return result as RetrievalResult<T>;
  } catch (error) {
    const source =
      getSourceById(
        request.sourceId
      );

    return {
      sourceId:
        request.sourceId,

      sourceName:
        source?.name ??
        "Unknown source",

      domain:
        source?.domain ??
        request.domain ??
        "marine",

      status: "failed",

      records: [],

      recordCount: 0,

      retrievedAt:
        new Date().toISOString(),

      local:
        source?.local ?? false,

      message:
        error instanceof Error
          ? error.message
          : "Data retrieval failed.",
    } as RetrievalResult<T>;
  }
}

export async function retrieveMultiple(
  requests: RetrievalRequest[]
): Promise<
  RetrievalResult[]
> {
  return Promise.all(
    requests.map(
      (request) =>
        retrieveData(
          request
        )
    )
  );
}

export async function retrieveBySource(
  sourceId: string,
  options: Omit<
    RetrievalRequest,
    "sourceId"
  > = {}
): Promise<
  RetrievalResult
> {
  return retrieveData({
    ...options,
    sourceId,
  });
}

export async function retrieveByDomain(
  domain: DataDomain,
  options: Omit<
    RetrievalRequest,
    "sourceId"
  > = {}
): Promise<
  RetrievalResult[]
> {
  const {
    getSourcesByDomain,
  } = await import(
    "./sourceRegistry"
  );

  const sources =
    getSourcesByDomain(
      domain
    ).filter(
      (source) =>
        source.status ===
          "available"
    );

  return retrieveMultiple(
    sources.map(
      (source) => ({
        ...options,
        sourceId:
          source.id,
        domain,
      })
    )
  );
}

export default retrieveData;