import type {
  AgentName,
  AgentRequest,
  AgentResponse,
  AgentExecutionTrace,
  AgentFinding,
  AgentEvidence,
  AgentPipelineResult,
  PlannerResult,
  VisualizationSpec,
} from "./agentTypes";

import { runPlannerAgent } from "./plannerAgent";
import { runMarineDataAgent } from "./marineDataAgent";
import { runWeatherAgent } from "./weatherAgent";
import { runOceanAgent } from "./oceanAgent";
import { runGeoAgent } from "./geoAgent";
import { runRiskAgent } from "./riskAgent";
import { runEvidenceAgent } from "./evidenceAgent";
import { runVisualizationAgent } from "./visualizationAgent";
import { runReportingAgent } from "./reportingAgent";
import { runInteractionAgent } from "./interactionAgent";

const AGENT_ORDER: AgentName[] = [
  "interaction",
  "planner",
  "marine-data",
  "weather",
  "ocean",
  "geo",
  "risk",
  "evidence",
  "visualization",
  "reporting",
];

function now(): string {
  return new Date().toISOString();
}

function createRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `sagar-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function mergeUnique<T extends { id: string }>(
  current: T[],
  incoming: T[]
): T[] {
  const map = new Map<string, T>();

  for (const item of current) {
    map.set(item.id, item);
  }

  for (const item of incoming) {
    map.set(item.id, item);
  }

  return Array.from(map.values());
}

function addUnique<T extends { id: string }>(
  target: T[],
  incoming: T[]
): void {
  const merged = mergeUnique(
    target,
    incoming
  );

  target.splice(
    0,
    target.length,
    ...merged
  );
}

function createTrace(
  requestId: string,
  agent: AgentName,
  status: AgentResponse["status"],
  startedAt: string,
  completedAt: string,
  summary?: string,
  error?: string
): AgentExecutionTrace {
  return {
    requestId,
    agent,
    status,
    startedAt,
    completedAt,
    durationMs:
      new Date(completedAt).getTime() -
      new Date(startedAt).getTime(),
    summary,
    error,
  };
}

async function runAgent(
  agent: AgentName,
  request: AgentRequest
): Promise<AgentResponse> {
  switch (agent) {
    case "interaction":
      return runInteractionAgent(
        request
      );

    case "planner":
      return runPlannerAgent(
        request
      );

    case "marine-data":
      return runMarineDataAgent(
        request
      );

    case "weather":
      return runWeatherAgent(
        request
      );

    case "ocean":
      return runOceanAgent(
        request
      );

    case "geo":
      return runGeoAgent(
        request
      );

    case "risk":
      return runRiskAgent(
        request
      );

    case "evidence":
      return runEvidenceAgent(
        request
      );

    case "visualization":
      return runVisualizationAgent(
        request
      );

    case "reporting":
      return runReportingAgent(
        request
      );

    default:
      return {
        agent,
        status: "failed",
        findings: [],
        evidence: [],
        confidence: 0,
        error: `Unknown agent: ${agent}`,
      };
  }
}

function buildNextRequest(
  request: AgentRequest,
  findings: AgentFinding[],
  evidence: AgentEvidence[],
  responses: Record<
    string,
    AgentResponse
  >,
  parameters?: Record<
    string,
    unknown
  >
): AgentRequest {
  return {
    ...request,

    previousFindings: [
      ...findings,
    ],

    previousEvidence: [
      ...evidence,
    ],

    parameters: {
      ...(request.parameters ?? {}),
      ...(parameters ?? {}),
      agentResponses: responses,
    },
  };
}

function getSuccessfulResponses(
  responses: Record<
    string,
    AgentResponse
  >
): Record<
  string,
  AgentResponse
> {
  return Object.fromEntries(
    Object.entries(
      responses
    ).filter(
      ([, response]) =>
        response.status ===
          "success" ||
        response.status ===
          "partial"
    )
  );
}

function getTaskMap(
  planner: PlannerResult
): Map<
  string,
  PlannerResult["tasks"][number]
> {
  return new Map(
    planner.tasks.map(
      (task) => [
        task.id,
        task,
      ]
    )
  );
}

function getRequiredTaskIds(
  planner: PlannerResult
): Set<string> {
  return new Set(
    planner.tasks
      .filter(
        (task) => task.required
      )
      .map(
        (task) => task.id
      )
  );
}

function getReadyTasks(
  planner: PlannerResult,
  completedTasks: Set<string>,
  failedTasks: Set<string>
): PlannerResult["tasks"] {
  return planner.tasks.filter(
    (task) => {
      if (
        completedTasks.has(
          task.id
        ) ||
        failedTasks.has(
          task.id
        )
      ) {
        return false;
      }

      const dependencies =
        task.dependsOn ?? [];

      return dependencies.every(
        (dependencyId) =>
          completedTasks.has(
            dependencyId
          )
      );
    }
  );
}

function markBlockedTasks(
  planner: PlannerResult,
  completedTasks: Set<string>,
  failedTasks: Set<string>
): void {
  let changed = true;

  while (changed) {
    changed = false;

    for (const task of planner.tasks) {
      if (
        completedTasks.has(
          task.id
        ) ||
        failedTasks.has(
          task.id
        )
      ) {
        continue;
      }

      const dependencies =
        task.dependsOn ?? [];

      const hasFailedDependency =
        dependencies.some(
          (dependencyId) =>
            failedTasks.has(
              dependencyId
            )
        );

      if (
        hasFailedDependency &&
        task.required
      ) {
        failedTasks.add(
          task.id
        );

        changed = true;
      }
    }
  }
}

async function executeTaskBatch(
  tasks: PlannerResult["tasks"],
  request: AgentRequest,
  findings: AgentFinding[],
  evidence: AgentEvidence[],
  responses: Record<
    string,
    AgentResponse
  >,
  traces: AgentExecutionTrace[],
  completedTasks: Set<string>,
  failedTasks: Set<string>
): Promise<void> {
  if (tasks.length === 0) {
    return;
  }

  const uniqueAgents = [
    ...new Set(
      tasks.map(
        (task) => task.agent
      )
    ),
  ].filter(
    (agent) =>
      agent !== "interaction" &&
      agent !== "planner" &&
      AGENT_ORDER.includes(
        agent
      )
  );

  if (
    uniqueAgents.length === 0
  ) {
    return;
  }

  /*
   * Every agent in the same ready batch receives
   * the same snapshot of completed work. This is
   * intentional: independent agents may execute
   * in parallel.
   */
  const snapshotFindings = [
    ...findings,
  ];

  const snapshotEvidence = [
    ...evidence,
  ];

  const snapshotResponses = {
    ...responses,
  };

  const results =
    await Promise.all(
      uniqueAgents.map(
        async (agent) => {
          const startedAt =
            now();

          try {
            const response =
              await runAgent(
                agent,
                buildNextRequest(
                  request,
                  snapshotFindings,
                  snapshotEvidence,
                  snapshotResponses
                )
              );

            const completedAt =
              now();

            return {
              agent,
              response,

              trace:
                createTrace(
                  request.requestId,
                  agent,
                  response.status,
                  startedAt,
                  completedAt,
                  `${agent} agent completed.`
                ),
            };
          } catch (error) {
            const completedAt =
              now();

            const message =
              error instanceof
              Error
                ? error.message
                : `The ${agent} agent failed.`;

            return {
              agent,

              response: {
                agent,

                status:
                  "failed" as const,

                findings: [],

                evidence: [],

                confidence: 0,

                error: message,
              },

              trace:
                createTrace(
                  request.requestId,
                  agent,
                  "failed",
                  startedAt,
                  completedAt,
                  undefined,
                  message
                ),
            };
          }
        }
      )
    );

  for (const result of results) {
    responses[result.agent] =
      result.response;

    addUnique(
      findings,
      result.response.findings
    );

    addUnique(
      evidence,
      result.response.evidence
    );

    traces.push(
      result.trace
    );

    const matchingTasks =
      tasks.filter(
        (task) =>
          task.agent ===
          result.agent
      );

    for (
      const task of matchingTasks
    ) {
      if (
        result.response.status ===
          "success" ||
        result.response.status ===
          "partial"
      ) {
        completedTasks.add(
          task.id
        );
      } else {
        failedTasks.add(
          task.id
        );
      }
    }
  }
}

async function executePlannedPipeline(
  planner: PlannerResult,
  request: AgentRequest,
  findings: AgentFinding[],
  evidence: AgentEvidence[],
  responses: Record<
    string,
    AgentResponse
  >,
  traces: AgentExecutionTrace[]
): Promise<{
  completedTasks: Set<string>;
  failedTasks: Set<string>;
}> {
  const completedTasks =
    new Set<string>();

  const failedTasks =
    new Set<string>();

  const taskMap =
    getTaskMap(planner);

  let rounds = 0;

  const MAX_ROUNDS = 20;

  while (
    rounds < MAX_ROUNDS
  ) {
    rounds += 1;

    markBlockedTasks(
      planner,
      completedTasks,
      failedTasks
    );

    const remaining =
      planner.tasks.filter(
        (task) =>
          !completedTasks.has(
            task.id
          ) &&
          !failedTasks.has(
            task.id
          ) &&
          task.agent !==
            "interaction" &&
          task.agent !==
            "planner"
      );

    if (remaining.length === 0) {
      break;
    }

    const readyTasks =
      getReadyTasks(
        planner,
        completedTasks,
        failedTasks
      ).filter(
        (task) =>
          task.agent !==
            "interaction" &&
          task.agent !==
            "planner"
      );

    if (
      readyTasks.length === 0
    ) {
      /*
       * Avoid an infinite scheduler loop.
       */
      for (
        const task of remaining
      ) {
        const unresolved =
          (
            task.dependsOn ??
            []
          ).filter(
            (dependencyId) =>
              !completedTasks.has(
                dependencyId
              ) &&
              !failedTasks.has(
                dependencyId
              )
          );

        if (
          unresolved.length > 0
        ) {
          failedTasks.add(
            task.id
          );
        }
      }

      break;
    }

    await executeTaskBatch(
      readyTasks,
      request,
      findings,
      evidence,
      responses,
      traces,
      completedTasks,
      failedTasks
    );

    /*
     * Safety check against impossible planner
     * dependency graphs.
     */
    if (
      rounds === MAX_ROUNDS
    ) {
      for (
        const task of taskMap.values()
      ) {
        if (
          !completedTasks.has(
            task.id
          ) &&
          !failedTasks.has(
            task.id
          )
        ) {
          failedTasks.add(
            task.id
          );
        }
      }
    }
  }

  return {
    completedTasks,
    failedTasks,
  };
}

export async function runAgentOrchestrator(
  baseRequest: Omit<
    AgentRequest,
    "requestId"
  > & {
    requestId?: string;
  }
): Promise<AgentPipelineResult> {
  const requestId =
    baseRequest.requestId ??
    createRequestId();

  const request: AgentRequest =
    {
      ...baseRequest,
      requestId,
    };

  const findings: AgentFinding[] =
    [];

  const evidence: AgentEvidence[] =
    [];

  const traces: AgentExecutionTrace[] =
    [];

  const responses: Record<
    string,
    AgentResponse
  > = {};

  /*
   * -------------------------------------------------
   * 1. INTERACTION AGENT
   * -------------------------------------------------
   */
  {
    const startedAt =
      now();

    try {
      const response =
        await runInteractionAgent(
          request
        );

      responses.interaction =
        response;

      const completedAt =
        now();

      addUnique(
        findings,
        response.findings
      );

      addUnique(
        evidence,
        response.evidence
      );

      traces.push(
        createTrace(
          requestId,
          "interaction",
          response.status,
          startedAt,
          completedAt,
          "User request interpreted."
        )
      );

      if (
        response.data &&
        "detectedIntent" in
          response.data
      ) {
        request.intent =
          response.data
            .detectedIntent;

        request.language =
          response.data
            .detectedLanguage;

        request.message =
          response.data
            .normalizedQuery;
      }
    } catch (error) {
      const completedAt =
        now();

      traces.push(
        createTrace(
          requestId,
          "interaction",
          "failed",
          startedAt,
          completedAt,
          undefined,
          error instanceof
          Error
            ? error.message
            : "Interaction agent failed."
        )
      );
    }
  }

  /*
   * -------------------------------------------------
   * 2. PLANNER AGENT
   * -------------------------------------------------
   */
  let planner:
    | PlannerResult
    | undefined;

  {
    const startedAt =
      now();

    try {
      const response =
        await runPlannerAgent(
          request
        );

      responses.planner =
        response;

      const completedAt =
        now();

      addUnique(
        findings,
        response.findings
      );

      addUnique(
        evidence,
        response.evidence
      );

      traces.push(
        createTrace(
          requestId,
          "planner",
          response.status,
          startedAt,
          completedAt,
          "Execution plan created."
        )
      );

      planner =
        response.data;
    } catch (error) {
      const completedAt =
        now();

      traces.push(
        createTrace(
          requestId,
          "planner",
          "failed",
          startedAt,
          completedAt,
          undefined,
          error instanceof
          Error
            ? error.message
            : "Planner agent failed."
        )
      );
    }
  }

  if (!planner) {
    return {
      requestId,

      status: "failed",

      intent:
        request.intent,

      language:
        request.language,

      findings,

      evidence,

      visualizations: [],

      traces,

      warnings: [
        "Sagar could not create an execution plan.",
      ],
    };
  }

  /*
   * -------------------------------------------------
   * 3. SPECIALIST AGENTS
   *
   * Dependencies from plannerAgent.ts decide
   * execution order automatically.
   *
   * Example:
   *
   * Marine Data
   *      ↓
   * Weather + Ocean + Geo
   *      ↓
   * Risk
   * -------------------------------------------------
   */
  const {
    completedTasks,
    failedTasks,
  } = await executePlannedPipeline(
    planner,
    request,
    findings,
    evidence,
    responses,
    traces
  );

  /*
   * -------------------------------------------------
   * 4. EVIDENCE AGENT
   * -------------------------------------------------
   */
  const evidenceTask =
    planner.tasks.find(
      (task) =>
        task.agent ===
        "evidence"
    );

  if (
    evidenceTask &&
    !failedTasks.has(
      evidenceTask.id
    ) &&
    !completedTasks.has(
      evidenceTask.id
    )
  ) {
    const startedAt =
      now();

    try {
      const response =
        await runEvidenceAgent(
          buildNextRequest(
            request,
            findings,
            evidence,
            getSuccessfulResponses(
              responses
            ),
            {
              planner,

              specialistResponses:
                getSuccessfulResponses(
                  responses
                ),
            }
          )
        );

      responses.evidence =
        response;

      const completedAt =
        now();

      addUnique(
        findings,
        response.findings
      );

      addUnique(
        evidence,
        response.evidence
      );

      traces.push(
        createTrace(
          requestId,
          "evidence",
          response.status,
          startedAt,
          completedAt,
          "Supporting evidence aggregated."
        )
      );

      if (
        response.status ===
          "success" ||
        response.status ===
          "partial"
      ) {
        completedTasks.add(
          evidenceTask.id
        );
      } else {
        failedTasks.add(
          evidenceTask.id
        );
      }
    } catch (error) {
      const completedAt =
        now();

      failedTasks.add(
        evidenceTask.id
      );

      traces.push(
        createTrace(
          requestId,
          "evidence",
          "failed",
          startedAt,
          completedAt,
          undefined,
          error instanceof
          Error
            ? error.message
            : "Evidence agent failed."
        )
      );
    }
  }

  /*
   * -------------------------------------------------
   * 5. VISUALIZATION AGENT
   * -------------------------------------------------
   */
  const visualizationTask =
    planner.tasks.find(
      (task) =>
        task.agent ===
        "visualization"
    );

  let visualizations:
    VisualizationSpec[] = [];

  if (
    visualizationTask &&
    !failedTasks.has(
      visualizationTask.id
    ) &&
    (
      !visualizationTask.dependsOn ||
      visualizationTask.dependsOn.every(
        (dependencyId) =>
          completedTasks.has(
            dependencyId
          )
      )
    )
  ) {
    const startedAt =
      now();

    try {
      const response =
        await runVisualizationAgent(
          buildNextRequest(
            request,
            findings,
            evidence,
            responses,
            {
              planner,

              specialistResponses:
                getSuccessfulResponses(
                  responses
                ),
            }
          )
        );

      responses.visualization =
        response;

      const completedAt =
        now();

      addUnique(
        findings,
        response.findings
      );

      addUnique(
        evidence,
        response.evidence
      );

      traces.push(
        createTrace(
          requestId,
          "visualization",
          response.status,
          startedAt,
          completedAt,
          "Visualization requirements determined."
        )
      );

      if (
        response.data &&
        "visualizations" in
          response.data
      ) {
        visualizations =
          response.data
            .visualizations;
      }

      if (
        response.status ===
          "success" ||
        response.status ===
          "partial"
      ) {
        completedTasks.add(
          visualizationTask.id
        );
      } else {
        failedTasks.add(
          visualizationTask.id
        );
      }
    } catch (error) {
      const completedAt =
        now();

      failedTasks.add(
        visualizationTask.id
      );

      traces.push(
        createTrace(
          requestId,
          "visualization",
          "failed",
          startedAt,
          completedAt,
          undefined,
          error instanceof
          Error
            ? error.message
            : "Visualization agent failed."
        )
      );
    }
  }

  /*
   * -------------------------------------------------
   * 6. REPORTING AGENT
   * -------------------------------------------------
   */
  const reportingTask =
    planner.tasks.find(
      (task) =>
        task.agent ===
        "reporting"
    );

  let finalResponse:
    | string
    | undefined;

  let finalRecommendation:
    | string
    | undefined;

  let situationSummary:
    | string
    | undefined;

  let reportTitle:
    | string
    | undefined;

  if (
    reportingTask &&
    !failedTasks.has(
      reportingTask.id
    ) &&
    (
      !reportingTask.dependsOn ||
      reportingTask.dependsOn.every(
        (dependencyId) =>
          completedTasks.has(
            dependencyId
          )
      )
    )
  ) {
    const startedAt =
      now();

    try {
      const response =
        await runReportingAgent(
          buildNextRequest(
            request,
            findings,
            evidence,
            responses,
            {
              planner,

              specialistResponses:
                getSuccessfulResponses(
                  responses
                ),

              visualizations,
            }
          )
        );

      responses.reporting =
        response;

      const completedAt =
        now();

      addUnique(
        findings,
        response.findings
      );

      addUnique(
        evidence,
        response.evidence
      );

      traces.push(
        createTrace(
          requestId,
          "reporting",
          response.status,
          startedAt,
          completedAt,
          "Final Sagar response generated."
        )
      );

      if (response.data) {
        const data =
          response.data as unknown as Record<
            string,
            unknown
          >;

        if (
          typeof data.response ===
          "string"
        ) {
          finalResponse =
            data.response;
        } else if (
          typeof data.summary ===
          "string"
        ) {
          finalResponse =
            data.summary;
        }

        if (
          typeof data.recommendation ===
          "string"
        ) {
          finalRecommendation =
            data.recommendation;
        }

        if (
          typeof data.summary ===
          "string"
        ) {
          situationSummary =
            data.summary;
        }

        if (
          typeof data.title ===
          "string"
        ) {
          reportTitle =
            data.title;
        }
      }

      if (
        response.status ===
          "success" ||
        response.status ===
          "partial"
      ) {
        completedTasks.add(
          reportingTask.id
        );
      } else {
        failedTasks.add(
          reportingTask.id
        );
      }
    } catch (error) {
      const completedAt =
        now();

      failedTasks.add(
        reportingTask.id
      );

      traces.push(
        createTrace(
          requestId,
          "reporting",
          "failed",
          startedAt,
          completedAt,
          undefined,
          error instanceof
          Error
            ? error.message
            : "Reporting agent failed."
        )
      );
    }
  }

  /*
   * -------------------------------------------------
   * 7. FINAL PIPELINE STATUS
   * -------------------------------------------------
   */
  const requiredTaskIds =
    getRequiredTaskIds(
      planner
    );

  const failedRequiredTasks =
    planner.tasks.filter(
      (task) =>
        requiredTaskIds.has(
          task.id
        ) &&
        failedTasks.has(
          task.id
        )
    );

  const unresolvedRequiredTasks =
    planner.tasks.filter(
      (task) =>
        requiredTaskIds.has(
          task.id
        ) &&
        !completedTasks.has(
          task.id
        ) &&
        !failedTasks.has(
          task.id
        )
    );

  let status:
    | "success"
    | "partial"
    | "failed";

  if (
    failedRequiredTasks.length ===
      0 &&
    unresolvedRequiredTasks.length ===
      0
  ) {
    status = "success";
  } else if (
    findings.length > 0 ||
    evidence.length > 0
  ) {
    status = "partial";
  } else {
    status = "failed";
  }

  const warnings: string[] =
    [];

  for (
    const task of failedRequiredTasks
  ) {
    warnings.push(
      `${task.agent} agent could not complete its required analysis.`
    );
  }

  for (
    const task of unresolvedRequiredTasks
  ) {
    warnings.push(
      `${task.agent} agent was not executed because its dependencies could not be satisfied.`
    );
  }

  if (
    !finalResponse &&
    status !== "failed"
  ) {
    warnings.push(
      "A final response was not returned by the reporting agent."
    );
  }

  return {
    requestId,

    status,

    intent:
      request.intent,

    language:
      request.language,

    findings:
      mergeUnique(
        [],
        findings
      ),

    evidence:
      mergeUnique(
        [],
        evidence
      ),

    visualizations,

    traces,

    finalRecommendation,

    finalResponse,

    situation:
      situationSummary,

    reportTitle,

    context:
      request.context,

    warnings:
      warnings.length > 0
        ? warnings
        : undefined,
  };
}

export async function askSagarWithAgents(
  input: {
    message: string;

    language:
      AgentRequest["language"];

    intent:
      AgentRequest["intent"];

    context:
      AgentRequest["context"];

    parameters?: Record<
      string,
      unknown
    >;
  }
): Promise<AgentPipelineResult> {
  return runAgentOrchestrator({
    requestId:
      createRequestId(),

    message:
      input.message,

    language:
      input.language,

    intent:
      input.intent,

    context:
      input.context,

    parameters:
      input.parameters,
  });
}

export default runAgentOrchestrator;