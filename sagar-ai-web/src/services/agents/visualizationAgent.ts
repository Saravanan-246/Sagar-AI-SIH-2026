import type {
  AgentFinding,
  AgentRequest,
  AgentResponse,
  VisualizationAgentData,
  VisualizationSpec,
} from "./agentTypes";

interface SpecialistResponse {
  findings?: AgentFinding[];
  evidence?: Array<{
    id: string;
    type: string;
    title: string;
    source?: string;
    timestamp?: string;
    summary?: string;
    data?: Record<string, unknown>;
  }>;
  data?: unknown;
  status?: string;
}

function getResponses(
  request: AgentRequest
): Record<string, SpecialistResponse> {
  const responses =
    request.parameters?.specialistResponses ??
    request.parameters?.agentResponses;

  if (
    !responses ||
    typeof responses !== "object"
  ) {
    return {};
  }

  return responses as Record<
    string,
    SpecialistResponse
  >;
}

function collectFindings(
  request: AgentRequest
): AgentFinding[] {
  const findings = [
    ...(request.previousFindings ?? []),
  ];

  const responses =
    getResponses(request);

  for (const response of Object.values(
    responses
  )) {
    if (Array.isArray(response.findings)) {
      findings.push(
        ...response.findings
      );
    }
  }

  const map = new Map<
    string,
    AgentFinding
  >();

  for (const finding of findings) {
    map.set(finding.id, finding);
  }

  return Array.from(map.values());
}

function getData(
  request: AgentRequest,
  agentName: string
): Record<string, unknown> | undefined {
  const response =
    getResponses(request)[agentName];

  if (
    !response?.data ||
    typeof response.data !== "object"
  ) {
    return undefined;
  }

  return response.data as Record<
    string,
    unknown
  >;
}

function hasAgent(
  request: AgentRequest,
  agentName: string
): boolean {
  return Boolean(
    getResponses(request)[agentName]
  );
}

function getFindingByAgent(
  findings: AgentFinding[],
  agent: AgentFinding["agent"]
): AgentFinding | undefined {
  return findings.find(
    (finding) =>
      finding.agent === agent
  );
}

function getFindingMatches(
  findings: AgentFinding[],
  words: string[]
): AgentFinding[] {
  return findings.filter(
    (finding) => {
      const text =
        `${finding.title} ${finding.summary}`.toLowerCase();

      return words.some((word) =>
        text.includes(word)
      );
    }
  );
}

function addVisualization(
  visualizations: VisualizationSpec[],
  visualization: VisualizationSpec
) {
  visualizations.push(
    visualization
  );
}

function buildRiskVisualization(
  request: AgentRequest,
  findings: AgentFinding[],
  visualizations: VisualizationSpec[]
) {
  const riskData =
    getData(request, "risk");

  const riskFinding =
    getFindingByAgent(
      findings,
      "risk"
    );

  if (
    !riskData &&
    !riskFinding
  ) {
    return;
  }

  addVisualization(
    visualizations,
    {
      type: "risk",
      title: "Operational Risk",
      priority: 1,

      data: {
        riskScore:
          riskData?.riskScore ??
          riskFinding?.data?.riskScore ??
          0,

        riskLevel:
          riskData?.riskLevel ??
          riskFinding?.severity ??
          "unknown",

        recommendation:
          riskData?.recommendation ??
          riskFinding?.summary ??
          "",
      },
    }
  );
}

function buildAlertVisualization(
  request: AgentRequest,
  findings: AgentFinding[],
  visualizations: VisualizationSpec[]
) {
  const weatherData =
    getData(
      request,
      "weather"
    );

  const hazardFindings =
    getFindingMatches(
      findings,
      [
        "alert",
        "lightning",
        "cyclone",
        "hazard",
        "rough sea",
        "strong wind",
      ]
    );

  const alerts =
    weatherData?.alerts;

  if (
    !weatherData &&
    hazardFindings.length === 0
  ) {
    return;
  }

  addVisualization(
    visualizations,
    {
      type: "alert",
      title: "Marine Alerts & Hazards",
      priority: 2,

      data: {
        alerts:
          Array.isArray(alerts)
            ? alerts
            : [],

        hazards:
          weatherData?.hazards ??
          {},

        findings:
          hazardFindings.map(
            (finding) => ({
              title:
                finding.title,

              summary:
                finding.summary,

              severity:
                finding.severity,
            })
          ),
      },
    }
  );
}

function buildMarineMapVisualization(
  request: AgentRequest,
  visualizations: VisualizationSpec[]
) {
  const marineData =
    getData(
      request,
      "marine-data"
    );

  const geoData =
    getData(
      request,
      "geo"
    );

  if (
    !marineData &&
    !geoData
  ) {
    return;
  }

  const area =
    marineData?.area;

  const coordinates =
    geoData
      ? {
          latitude:
            geoData.latitude,
          longitude:
            geoData.longitude,
        }
      : undefined;

  addVisualization(
    visualizations,
    {
      type: "map",
      title: "Marine Situation Map",
      priority: 3,

      data: {
        area,
        coordinates,

        nearbyRestrictedAreas:
          geoData
            ?.nearbyRestrictedAreas ??
          [],

        insideRestrictedArea:
          geoData
            ?.insideRestrictedArea ??
          false,

        boundaryDistanceKm:
          geoData
            ?.boundaryDistanceKm,
      },
    }
  );
}

function buildRouteVisualization(
  request: AgentRequest,
  visualizations: VisualizationSpec[]
) {
  const routeData =
    getData(
      request,
      "route"
    );

  if (!routeData) {
    return;
  }

  addVisualization(
    visualizations,
    {
      type: "route",
      title: "Route Analysis",
      priority: 2,

      data: {
        routes:
          routeData.routes ??
          [],

        selectedRoute:
          routeData.selectedRoute,
      },
    }
  );
}

function buildProductivityVisualization(
  request: AgentRequest,
  visualizations: VisualizationSpec[]
) {
  const oceanData =
    getData(
      request,
      "ocean"
    );

  if (!oceanData) {
    return;
  }

  const trend =
    oceanData.trend;

  const productivityIndex =
    oceanData.productivityIndex;

  const signal =
    oceanData.productivitySignal;

  const sst =
    oceanData.seaSurfaceTemperatureC;

  const chlorophyll =
    oceanData.chlorophyllMgM3;

  /*
   * A chart is most useful when there is a
   * trend/history available. Otherwise use
   * the same visualization contract with
   * current indicators only.
   */
  addVisualization(
    visualizations,
    {
      type: "chart",
      title: "Ocean Productivity",
      priority: 2,

      data: {
        chartType:
          "productivity",

        productivityIndex,

        productivitySignal:
          signal,

        trend,

        seaSurfaceTemperatureC:
          sst,

        chlorophyllMgM3:
          chlorophyll,

        drivers:
          oceanData.drivers ??
          [],
      },
    }
  );
}

function buildProductivityTable(
  request: AgentRequest,
  visualizations: VisualizationSpec[]
) {
  const oceanData =
    getData(
      request,
      "ocean"
    );

  if (!oceanData) {
    return;
  }

  const rows = [
    {
      metric: "Productivity index",
      value:
        oceanData.productivityIndex ??
        "—",
    },
    {
      metric: "Productivity signal",
      value:
        oceanData.productivitySignal ??
        "—",
    },
    {
      metric: "Trend",
      value:
        oceanData.trend ??
        "—",
    },
    {
      metric: "Sea-surface temperature",
      value:
        oceanData.seaSurfaceTemperatureC ??
        "—",
    },
    {
      metric: "Chlorophyll",
      value:
        oceanData.chlorophyllMgM3 ??
        "—",
    },
  ];

  addVisualization(
    visualizations,
    {
      type: "table",
      title: "Ocean Indicators",
      priority: 4,

      data: {
        columns: [
          "metric",
          "value",
        ],

        rows,
      },
    }
  );
}

function buildGeofenceVisualization(
  request: AgentRequest,
  visualizations: VisualizationSpec[]
) {
  const geoData =
    getData(
      request,
      "geo"
    );

  if (!geoData) {
    return;
  }

  const restrictions =
    Array.isArray(
      geoData.nearbyRestrictedAreas
    )
      ? geoData.nearbyRestrictedAreas
      : [];

  if (
    restrictions.length === 0 &&
    !geoData.insideRestrictedArea
  ) {
    return;
  }

  addVisualization(
    visualizations,
    {
      type: "map",
      title: "Boundary & Geofence Status",
      priority: 1,

      data: {
        latitude:
          geoData.latitude,

        longitude:
          geoData.longitude,

        insideRestrictedArea:
          geoData.insideRestrictedArea,

        boundaryDistanceKm:
          geoData.boundaryDistanceKm,

        restrictedAreas:
          restrictions,
      },
    }
  );
}

function buildContextVisualization(
  request: AgentRequest,
  findings: AgentFinding[],
  visualizations: VisualizationSpec[]
) {
  const marine =
    getData(
      request,
      "marine-data"
    );

  const weather =
    getData(
      request,
      "weather"
    );

  const ocean =
    getData(
      request,
      "ocean"
    );

  if (
    !marine &&
    !weather &&
    !ocean
  ) {
    return;
  }

  addVisualization(
    visualizations,
    {
      type: "table",
      title: "Marine Situation Summary",
      priority: 5,

      data: {
        columns: [
          "indicator",
          "value",
        ],

        rows: [
          {
            indicator:
              "Wind",
            value:
              weather?.windSpeedKnots ??
              marine?.area &&
              typeof marine.area ===
                "object"
                ? (
                    marine.area as Record<
                      string,
                      unknown
                    >
                  ).conditions &&
                  typeof (
                    marine.area as Record<
                      string,
                      unknown
                    >
                  ).conditions ===
                    "object"
                  ? (
                      (
                        marine.area as Record<
                          string,
                          unknown
                        >
                      ).conditions as Record<
                        string,
                        unknown
                      >
                    ).windSpeedKnots ??
                    "—"
                  : "—"
                : "—",
          },

          {
            indicator:
              "Wave height",
            value:
              weather?.waveHeightM ??
              "—",
          },

          {
            indicator:
              "Visibility",
            value:
              weather?.visibilityKm ??
              "—",
          },

          {
            indicator:
              "Productivity",
            value:
              ocean?.productivitySignal ??
              "—",
          },

          {
            indicator:
              "Risk",
            value:
              getData(
                request,
                "risk"
              )?.riskLevel ??
              "—",
          },
        ],
      },
    }
  );
}

function chooseVisualizations(
  request: AgentRequest,
  findings: AgentFinding[]
): VisualizationSpec[] {
  const visualizations: VisualizationSpec[] = [];

  switch (request.intent) {
    case "alerts":
    case "safety":
      buildAlertVisualization(
        request,
        findings,
        visualizations
      );

      buildRiskVisualization(
        request,
        findings,
        visualizations
      );

      buildGeofenceVisualization(
        request,
        visualizations
      );

      buildMarineMapVisualization(
        request,
        visualizations
      );
      break;

    case "pfz":
      buildProductivityVisualization(
        request,
        visualizations
      );

      buildRiskVisualization(
        request,
        findings,
        visualizations
      );

      buildGeofenceVisualization(
        request,
        visualizations
      );

      buildMarineMapVisualization(
        request,
        visualizations
      );

      buildProductivityTable(
        request,
        visualizations
      );
      break;

    case "productivity":
      buildProductivityVisualization(
        request,
        visualizations
      );

      buildProductivityTable(
        request,
        visualizations
      );
      break;

    case "route":
      buildRouteVisualization(
        request,
        visualizations
      );

      buildRiskVisualization(
        request,
        findings,
        visualizations
      );

      buildGeofenceVisualization(
        request,
        visualizations
      );

      buildMarineMapVisualization(
        request,
        visualizations
      );
      break;

    case "geofence":
      buildGeofenceVisualization(
        request,
        visualizations
      );

      buildRiskVisualization(
        request,
        findings,
        visualizations
      );

      buildMarineMapVisualization(
        request,
        visualizations
      );
      break;

    case "marine_conditions":
      buildMarineMapVisualization(
        request,
        visualizations
      );

      buildRiskVisualization(
        request,
        findings,
        visualizations
      );

      buildContextVisualization(
        request,
        findings,
        visualizations
      );
      break;

    case "tide":
      buildContextVisualization(
        request,
        findings,
        visualizations
      );
      break;

    case "general":
    default:
      buildContextVisualization(
        request,
        findings,
        visualizations
      );

      if (
        hasAgent(
          request,
          "risk"
        )
      ) {
        buildRiskVisualization(
          request,
          findings,
          visualizations
        );
      }
      break;
  }

  /*
   * Avoid duplicate visualization types with
   * identical titles and keep a small number
   * of useful visuals for a conversational UI.
   */
  const unique =
    new Map<string, VisualizationSpec>();

  for (const visualization of visualizations) {
    const key =
      `${visualization.type}-${visualization.title ?? ""}`;

    if (!unique.has(key)) {
      unique.set(
        key,
        visualization
      );
    }
  }

  return Array.from(
    unique.values()
  )
    .sort(
      (a, b) =>
        (a.priority ?? 99) -
        (b.priority ?? 99)
    )
    .slice(0, 6);
}

export async function runVisualizationAgent(
  request: AgentRequest
): Promise<
  AgentResponse<VisualizationAgentData>
> {
  try {
    const findings =
      collectFindings(request);

    const visualizations =
      chooseVisualizations(
        request,
        findings
      );

    const hasVisualOutput =
      visualizations.length > 0;

    const visualizationFinding: AgentFinding =
      {
        id: `visualization-${request.requestId}`,

        agent: "visualization",

        title:
          hasVisualOutput
            ? "Visual evidence selected"
            : "Text-first response selected",

        summary:
          hasVisualOutput
            ? `${visualizations.length} visual output(s) were selected to support the current marine analysis.`
            : "The current request does not require a specialized visual output.",

        severity: "info",

        confidence:
          hasVisualOutput
            ? 0.93
            : 0.8,

        data: {
          visualizationCount:
            visualizations.length,

          visualizationTypes:
            visualizations.map(
              (item) =>
                item.type
            ),
        },
      };

    return {
      agent: "visualization",

      status: "success",

      findings: [
        visualizationFinding,
      ],

      evidence: [],

      data: {
        visualizations,
      },

      confidence:
        hasVisualOutput
          ? 0.93
          : 0.8,

      nextAgents: [
        "reporting",
      ],
    };
  } catch (error) {
    return {
      agent: "visualization",

      status: "failed",

      findings: [],
      evidence: [],

      confidence: 0,

      error:
        error instanceof Error
          ? error.message
          : "Visualization planning failed.",
    };
  }
}

export default runVisualizationAgent;