import marineData from "../../data/marine.json";
import productivityData from "../../data/productivity.json";
import fishingZonesData from "../../data/fishingZones.json";

import type { MarineArea } from "../../types/marine";

import type {
  AgentFinding,
  AgentRequest,
  AgentResponse,
  OceanAgentData,
} from "./agentTypes";

interface ProductivityRecord {
  id?: string;
  areaId?: string;
  areaName?: string;

  currentIndex?: number;
  productivityIndex?: number;

  signal?: string;
  productivitySignal?: string;

  trend?: string;

  drivers?: string[];

  interpretation?: string;

  recommendation?: string;

  history?: Array<{
    month: string;
    value: number;
    index?: number;
  }>;

  monthlyHistory?: Array<{
    month: string;
    value: number;
    index?: number;
  }>;

  [key: string]: unknown;
}

interface FishingZoneRecord {
  id: string;
  name: string;

  latitude?: number;
  longitude?: number;

  coordinates?: {
    latitude: number;
    longitude: number;
  };

  suitability?: string;
  status?: string;

  chlorophyll?: number;
  chlorophyllMgM3?: number;

  sst?: number;
  seaSurfaceTemperatureC?: number;

  risk?: string;

  [key: string]: unknown;
}

const marineAreas =
  marineData.areas as MarineArea[];

const productivityRecords =
  productivityData as unknown as
    | ProductivityRecord[]
    | {
        areas?: ProductivityRecord[];
        data?: ProductivityRecord[];
      };

const fishingZones = (
  Array.isArray(fishingZonesData)
    ? fishingZonesData
    : ((fishingZonesData as { zones?: unknown[] })?.zones ?? [])
) as FishingZoneRecord[];

function normalizeText(
  value: unknown
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getProductivityRecords(): ProductivityRecord[] {
  if (Array.isArray(productivityRecords)) {
    return productivityRecords;
  }

  if (
    Array.isArray(productivityRecords.areas)
  ) {
    return productivityRecords.areas;
  }

  if (
    Array.isArray(productivityRecords.data)
  ) {
    return productivityRecords.data;
  }

  return [];
}

function findMarineArea(
  request: AgentRequest
): MarineArea {
  const requestedArea =
    request.context.areaName ??
    (typeof request.parameters?.areaName ===
    "string"
      ? request.parameters.areaName
      : undefined);

  if (requestedArea) {
    const requested =
      normalizeText(requestedArea);

    const exact =
      marineAreas.find(
        (area) =>
          normalizeText(area.name) ===
            requested ||
          normalizeText(area.id) ===
            requested
      );

    if (exact) {
      return exact;
    }

    const fuzzy =
      marineAreas.find(
        (area) =>
          normalizeText(area.name).includes(
            requested
          ) ||
          requested.includes(
            normalizeText(area.name)
          )
      );

    if (fuzzy) {
      return fuzzy;
    }
  }

  const query =
    normalizeText(request.message);

  const fromQuery =
    marineAreas.find((area) => {
      const areaName =
        normalizeText(area.name);

      const region =
        normalizeText(area.region);

      return (
        (areaName &&
          query.includes(areaName)) ||
        (region &&
          query.includes(region))
      );
    });

  return (
    fromQuery ??
    request.area ??
    marineAreas[0]
  );
}

function findProductivityRecord(
  area: MarineArea
): ProductivityRecord | undefined {
  const records =
    getProductivityRecords();

  const exact =
    records.find(
      (record) =>
        record.areaId === area.id
    );

  if (exact) {
    return exact;
  }

  return records.find(
    (record) =>
      normalizeText(
        record.areaName
      ) === normalizeText(area.name)
  );
}

function getCurrentProductivityIndex(
  area: MarineArea,
  record?: ProductivityRecord
): number | undefined {
  const direct =
    record?.currentIndex ??
    record?.productivityIndex;

  if (
    typeof direct === "number" &&
    Number.isFinite(direct)
  ) {
    return direct;
  }

  if (
    typeof area.marineIndicators
      .productivityIndex === "number"
  ) {
    return area.marineIndicators
      .productivityIndex;
  }

  const history =
    record?.history ??
    record?.monthlyHistory;

  if (history && history.length > 0) {
    const latest =
      history[history.length - 1];

    const value =
      latest.index ??
      latest.value;

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }
  }

  return undefined;
}

function getProductivitySignal(
  area: MarineArea,
  record?: ProductivityRecord
): string {
  return (
    record?.productivitySignal ??
    record?.signal ??
    area.marineIndicators
      .productivitySignal ??
    "unknown"
  );
}

function getTrend(
  record?: ProductivityRecord
): string {
  if (record?.trend) {
    return record.trend;
  }

  const history =
    record?.history ??
    record?.monthlyHistory;

  if (
    !history ||
    history.length < 2
  ) {
    return "stable";
  }

  const previous =
    history[history.length - 2];

  const latest =
    history[history.length - 1];

  const previousValue =
    previous.index ??
    previous.value;

  const latestValue =
    latest.index ??
    latest.value;

  if (
    typeof previousValue !== "number" ||
    typeof latestValue !== "number"
  ) {
    return "stable";
  }

  const difference =
    latestValue - previousValue;

  if (difference > 0.05) {
    return "increasing";
  }

  if (difference < -0.05) {
    return "declining";
  }

  return "stable";
}

function getDrivers(
  area: MarineArea,
  record?: ProductivityRecord
): string[] {
  if (
    record?.drivers &&
    record.drivers.length > 0
  ) {
    return record.drivers;
  }

  const drivers: string[] = [];

  const indicators =
    area.marineIndicators;

  if (
    indicators.chlorophyllMgM3 <
    0.7
  ) {
    drivers.push(
      "Low chlorophyll concentration"
    );
  }

  if (
    indicators.seaSurfaceTemperatureC >=
    29.5
  ) {
    drivers.push(
      "Relatively high sea-surface temperature"
    );
  }

  if (
    area.conditions.windSpeedKnots >=
    15
  ) {
    drivers.push(
      "Elevated wind conditions"
    );
  }

  if (
    area.conditions.waveHeightM >=
    1.8
  ) {
    drivers.push(
      "Elevated wave conditions"
    );
  }

  if (
    drivers.length === 0
  ) {
    drivers.push(
      "No strong negative driver identified in the configured indicators"
    );
  }

  return drivers;
}

function buildFinding(
  area: MarineArea,
  record: ProductivityRecord | undefined,
  requestId: string
): AgentFinding {
  const index =
    getCurrentProductivityIndex(
      area,
      record
    );

  const signal =
    getProductivitySignal(
      area,
      record
    );

  const trend =
    getTrend(record);

  const drivers =
    getDrivers(
      area,
      record
    );

  const parts = [
    `${area.name} productivity signal: ${signal}.`,
    `Trend: ${trend}.`,
  ];

  if (
    typeof index === "number"
  ) {
    parts.push(
      `Productivity index: ${index.toFixed(2)}.`
    );
  }

  parts.push(
    `Primary indicators: SST ${area.marineIndicators.seaSurfaceTemperatureC.toFixed(
      1
    )}°C and chlorophyll ${area.marineIndicators.chlorophyllMgM3.toFixed(
      2
    )} mg/m³.`
  );

  return {
    id: `ocean-finding-${requestId}`,
    agent: "ocean",

    title: `${area.name} ocean productivity analysis`,

    summary: parts.join(" "),

    severity:
      trend === "declining"
        ? "moderate"
        : "info",

    confidence: 0.94,

    data: {
      areaId: area.id,
      areaName: area.name,
      productivityIndex: index,
      productivitySignal: signal,
      trend,
      drivers,
      seaSurfaceTemperatureC:
        area.marineIndicators
          .seaSurfaceTemperatureC,
      chlorophyllMgM3:
        area.marineIndicators
          .chlorophyllMgM3,
    },
  };
}

function buildTrendFinding(
  area: MarineArea,
  record: ProductivityRecord | undefined,
  requestId: string
): AgentFinding | null {
  const history =
    record?.history ??
    record?.monthlyHistory;

  if (
    !history ||
    history.length < 2
  ) {
    return null;
  }

  const latest =
    history[history.length - 1];

  const previous =
    history[history.length - 2];

  const latestValue =
    latest.index ??
    latest.value;

  const previousValue =
    previous.index ??
    previous.value;

  if (
    typeof latestValue !== "number" ||
    typeof previousValue !== "number"
  ) {
    return null;
  }

  const change =
    latestValue -
    previousValue;

  const percentageChange =
    previousValue !== 0
      ? (change /
          Math.abs(previousValue)) *
        100
      : 0;

  const direction =
    change > 0
      ? "increased"
      : change < 0
        ? "decreased"
        : "remained stable";

  return {
    id: `ocean-trend-${requestId}`,
    agent: "ocean",

    title: "Productivity trend detected",

    summary:
      `Productivity ${direction} by approximately ${Math.abs(
        percentageChange
      ).toFixed(
        1
      )}% between the latest two configured observations.`,

    severity:
      change < 0
        ? "moderate"
        : "info",

    confidence: 0.9,

    data: {
      areaId: area.id,
      previousMonth:
        previous.month,
      latestMonth:
        latest.month,
      previousValue,
      latestValue,
      change,
      percentageChange,
      direction,
    },
  };
}

function buildZoneFindings(
  area: MarineArea,
  requestId: string
): AgentFinding[] {
  const areaName =
    normalizeText(area.name);

  const region =
    normalizeText(area.region);

  const query =
    `${areaName} ${region}`;

  const relatedZones =
    fishingZones.filter(
      (zone) => {
        const zoneText =
          normalizeText(
            `${zone.name} ${zone.id}`
          );

        return (
          zoneText.includes(
            areaName
          ) ||
          areaName.includes(
            normalizeText(zone.name)
          ) ||
          query.includes(
            normalizeText(zone.name)
          )
        );
      }
    );

  return relatedZones
    .slice(0, 5)
    .map((zone) => {
      const suitability =
        zone.suitability ??
        zone.status ??
        "unknown";

      return {
        id: `ocean-zone-${requestId}-${zone.id}`,
        agent: "ocean",

        title: `${zone.name} zone productivity context`,

        summary:
          `${zone.name} has a configured suitability of ${suitability}.`,

        severity:
          normalizeText(
            zone.risk
          ) === "high"
            ? "high"
            : "info",

        confidence: 0.88,

        data: {
          zoneId: zone.id,
          suitability,
          chlorophyll:
            zone.chlorophyllMgM3 ??
            zone.chlorophyll,
          seaSurfaceTemperatureC:
            zone.seaSurfaceTemperatureC ??
            zone.sst,
        },
      };
    });
}

function buildEvidence(
  area: MarineArea,
  record?: ProductivityRecord
): AgentResponse["evidence"] {
  const history =
    record?.history ??
    record?.monthlyHistory;

  return [
    {
      id: `ocean-indicators-${area.id}`,
      type: "ocean",
      title: `${area.name} ocean indicators`,
      source:
        "Configured ocean indicator dataset",
      timestamp:
        area.updatedAt,

      summary:
        `SST ${area.marineIndicators.seaSurfaceTemperatureC}°C and chlorophyll ${area.marineIndicators.chlorophyllMgM3} mg/m³.`,

      data: {
        seaSurfaceTemperatureC:
          area.marineIndicators
            .seaSurfaceTemperatureC,

        chlorophyllMgM3:
          area.marineIndicators
            .chlorophyllMgM3,

        productivitySignal:
          area.marineIndicators
            .productivitySignal,

        productivityIndex:
          area.marineIndicators
            .productivityIndex,
      },
    },

    ...(record
      ? [
          {
            id: `ocean-productivity-${area.id}`,
            type: "ocean" as const,
            title: `${area.name} productivity dataset`,
            source:
              "Configured productivity dataset",
            summary:
              record.interpretation ??
              record.recommendation ??
              "Productivity trend and driver information available for analysis.",
            data: {
              productivityIndex:
                getCurrentProductivityIndex(
                  area,
                  record
                ),
              productivitySignal:
                getProductivitySignal(
                  area,
                  record
                ),
              trend:
                getTrend(record),
              drivers:
                getDrivers(
                  area,
                  record
                ),
              history,
            },
          },
        ]
      : []),
  ];
}

function buildRecommendation(
  area: MarineArea,
  record?: ProductivityRecord
): string {
  const trend =
    getTrend(record);

  const signal =
    normalizeText(
      getProductivitySignal(
        area,
        record
      )
    );

  if (
    trend === "declining"
  ) {
    return (
      record?.recommendation ??
      "Productivity is declining in the selected area. Compare chlorophyll, SST and recent marine conditions before selecting a fishing zone."
    );
  }

  if (
    signal === "favourable" ||
    signal === "high"
  ) {
    return (
      record?.recommendation ??
      "The selected area shows a favourable productivity signal. Confirm marine safety and geospatial restrictions before operating."
    );
  }

  return (
    record?.recommendation ??
    "Use the combined productivity indicators with current marine conditions and operational restrictions before making a fishing decision."
  );
}

export async function runOceanAgent(
  request: AgentRequest
): Promise<
  AgentResponse<OceanAgentData>
> {
  try {
    const area =
      findMarineArea(request);

    if (!area) {
      return {
        agent: "ocean",
        status: "failed",
        findings: [],
        evidence: [],
        confidence: 0,
        error:
          "No marine area was available for ocean analysis.",
      };
    }

    const productivityRecord =
      findProductivityRecord(
        area
      );

    const productivityIndex =
      getCurrentProductivityIndex(
        area,
        productivityRecord
      );

    const productivitySignal =
      getProductivitySignal(
        area,
        productivityRecord
      );

    const trend =
      getTrend(
        productivityRecord
      );

    const drivers =
      getDrivers(
        area,
        productivityRecord
      );

    const findings: AgentFinding[] = [
      buildFinding(
        area,
        productivityRecord,
        request.requestId
      ),
    ];

    const trendFinding =
      buildTrendFinding(
        area,
        productivityRecord,
        request.requestId
      );

    if (trendFinding) {
      findings.push(
        trendFinding
      );
    }

    findings.push(
      ...buildZoneFindings(
        area,
        request.requestId
      )
    );

    const evidence =
      buildEvidence(
        area,
        productivityRecord
      );

    const data: OceanAgentData = {
      productivityIndex,
      productivitySignal,
      seaSurfaceTemperatureC:
        area.marineIndicators
          .seaSurfaceTemperatureC,
      chlorophyllMgM3:
        area.marineIndicators
          .chlorophyllMgM3,
      trend,
      drivers,
    };

    return {
      agent: "ocean",
      status: "success",

      findings,
      evidence,

      data,

      confidence:
        productivityRecord
          ? 0.94
          : 0.82,

      nextAgents: [
        "risk",
        "evidence",
      ],

      warnings:
        productivityRecord
          ? undefined
          : [
              "No dedicated productivity record was matched; ocean indicators from the marine dataset were used.",
            ],
    };
  } catch (error) {
    return {
      agent: "ocean",
      status: "failed",

      findings: [],
      evidence: [],

      confidence: 0,

      error:
        error instanceof Error
          ? error.message
          : "Ocean analytics failed.",
    };
  }
}

export default runOceanAgent;