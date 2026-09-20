import type {
  AgentName,
  AgentRequest,
  AgentResponse,
  PlannerResult,
  PlannerTask,
} from "./agentTypes";

function createTask(
  id: string,
  agent: AgentName,
  description: string,
  required = true,
  dependsOn?: string[]
): PlannerTask {
  return {
    id,
    agent,
    description,
    required,
    dependsOn,
  };
}

export function planAgents(
  request: AgentRequest
): PlannerResult {
  const { intent } = request;

  const tasks: PlannerTask[] = [];

  tasks.push(
    createTask(
      "marine-data",
      "marine-data",
      "Retrieve relevant marine conditions and area observations.",
      true
    )
  );

  switch (intent) {
    case "marine_conditions":
      tasks.push(
        createTask(
          "weather",
          "weather",
          "Evaluate wind, waves, visibility and marine hazards.",
          true,
          ["marine-data"]
        ),
        // Same optional/non-blocking pattern already used for
        // safety/alerts below - a real INCOIS reading attached as
        // supplementary evidence only (never fed into risk), so "what
        // are the current sea conditions?" can actually answer "what
        // data are you using?" with a real external source, not just
        // the local dataset. Never required: a slow/failed external
        // call must not hold up an otherwise-fast sea-conditions answer.
        createTask(
          "ocean",
          "ocean",
          "Check a real external ocean reference (SST) alongside local marine conditions.",
          false,
          ["marine-data"]
        ),
        createTask(
          "risk",
          "risk",
          "Assess overall operational marine risk.",
          true,
          ["marine-data", "weather"]
        )
      );
      break;

    case "safety":
    case "alerts":
      tasks.push(
        createTask(
          "weather",
          "weather",
          "Check adverse weather and marine hazards.",
          true,
          ["marine-data"]
        ),
        createTask(
          "geo",
          "geo",
          "Check relevant restricted and protected areas.",
          true,
          ["marine-data"]
        ),
        createTask(
          "ocean",
          "ocean",
          "Check SST, chlorophyll and productivity signal alongside safety conditions.",
          false,
          ["marine-data"]
        ),
        createTask(
          "risk",
          "risk",
          "Combine hazards, geospatial restrictions and ocean conditions into a safety assessment.",
          true,
          ["marine-data", "weather", "geo"]
        )
      );
      break;

    case "pfz":
      tasks.push(
        createTask(
          "ocean",
          "ocean",
          "Analyse SST, chlorophyll, productivity and fishing-zone conditions.",
          true,
          ["marine-data"]
        ),
        createTask(
          "weather",
          "weather",
          "Check weather and sea conditions affecting fishing zones.",
          true,
          ["marine-data"]
        ),
        createTask(
          "geo",
          "geo",
          "Check fishing zones against configured geospatial restrictions.",
          true,
          ["marine-data"]
        ),
        createTask(
          "risk",
          "risk",
          "Rank fishing zones using productivity, hazards and restrictions.",
          true,
          ["ocean", "weather", "geo"]
        )
      );
      break;

    case "productivity":
      tasks.push(
        createTask(
          "ocean",
          "ocean",
          "Analyse productivity trends and environmental drivers.",
          true,
          ["marine-data"]
        ),
        createTask(
          "weather",
          "weather",
          "Check environmental conditions that may affect productivity.",
          false,
          ["marine-data"]
        )
      );
      break;

    case "route":
      tasks.push(
        createTask(
          "weather",
          "weather",
          "Evaluate marine hazards affecting the route.",
          true,
          ["marine-data"]
        ),
        createTask(
          "geo",
          "geo",
          "Identify restricted, protected and operational boundaries.",
          true,
          ["marine-data"]
        ),
        createTask(
          "risk",
          "risk",
          "Evaluate route safety using conditions and geospatial restrictions.",
          true,
          ["marine-data", "weather", "geo"]
        )
      );
      break;

    case "evidence":
      // Same real inputs a "why is this risky?" answer needs to explain
      // itself from - mirrors "safety" so the evidence/keyFactors this
      // intent reports on are reliably present, not best-effort.
      tasks.push(
        createTask(
          "weather",
          "weather",
          "Check adverse weather and marine hazards.",
          true,
          ["marine-data"]
        ),
        createTask(
          "geo",
          "geo",
          "Check relevant restricted and protected areas.",
          true,
          ["marine-data"]
        ),
        createTask(
          "ocean",
          "ocean",
          "Check SST, chlorophyll and productivity signal alongside the assessment.",
          false,
          ["marine-data"]
        ),
        createTask(
          "risk",
          "risk",
          "Combine hazards, geospatial restrictions and ocean conditions into the assessment being explained.",
          true,
          ["marine-data", "weather", "geo"]
        )
      );
      break;

    case "geofence":
      tasks.push(
        createTask(
          "geo",
          "geo",
          "Determine proximity to or intersection with maritime boundaries.",
          true,
          ["marine-data"]
        ),
        createTask(
          "risk",
          "risk",
          "Convert boundary proximity and restrictions into an operational warning.",
          true,
          ["geo"]
        )
      );
      break;

    case "tide":
      tasks.push(
        createTask(
          "marine-data",
          "marine-data",
          "Retrieve current and upcoming tide information.",
          true
        )
      );
      break;

    case "general":
    default:
      tasks.push(
        createTask(
          "weather",
          "weather",
          "Check relevant weather and marine hazards.",
          false,
          ["marine-data"]
        ),
        createTask(
          "ocean",
          "ocean",
          "Check relevant ocean and productivity indicators.",
          false,
          ["marine-data"]
        ),
        createTask(
          "geo",
          "geo",
          "Check relevant geospatial restrictions.",
          false,
          ["marine-data"]
        ),
        createTask(
          "risk",
          "risk",
          "Produce a general operational risk assessment when sufficient evidence exists.",
          false,
          ["marine-data", "weather", "ocean", "geo"]
        )
      );
      break;
  }

  const specialistTasks = tasks.filter(
    (task) =>
      ![
        "evidence",
        "visualization",
        "reporting",
      ].includes(task.agent)
  );

  tasks.push(
    createTask(
      "evidence",
      "evidence",
      "Aggregate the strongest supporting evidence for the final recommendation.",
      true,
      specialistTasks.map(
        (task) => task.id
      )
    )
  );

  tasks.push(
    createTask(
      "visualization",
      "visualization",
      "Determine whether the response should include a map, chart, route, risk or alert visualization.",
      false,
      ["evidence"]
    )
  );

  tasks.push(
    createTask(
      "reporting",
      "reporting",
      "Assemble the final explanation, recommendation and supporting evidence.",
      true,
      ["evidence"]
    )
  );

  const priority: AgentName[] = (
    [
      "marine-data",
      "weather",
      "ocean",
      "geo",
      "risk",
      "evidence",
      "visualization",
      "reporting",
    ] as AgentName[]
  ).filter((agent) =>
    tasks.some(
      (task) => task.agent === agent
    )
  );

  const firstParallelGroup: AgentName[] =
    ["marine-data"];

  const secondParallelGroup: AgentName[] =
    tasks
      .filter(
        (task) =>
          task.dependsOn?.includes(
            "marine-data"
          ) &&
          ["weather", "ocean", "geo"].includes(
            task.agent
          )
      )
      .map((task) => task.agent);

  const thirdParallelGroup: AgentName[] =
    tasks
      .filter(
        (task) =>
          task.agent === "risk"
      )
      .map((task) => task.agent);

  const parallelGroups: AgentName[][] = [
    [...new Set(firstParallelGroup)],
  ];

  if (
    secondParallelGroup.length > 0
  ) {
    parallelGroups.push([
      ...new Set(
        secondParallelGroup
      ),
    ]);
  }

  if (
    thirdParallelGroup.length > 0
  ) {
    parallelGroups.push([
      ...new Set(
        thirdParallelGroup
      ),
    ]);
  }

  let reasoning =
    "Plan generated from the detected user intent.";

  switch (intent) {
    case "safety":
    case "alerts":
      reasoning =
        "Safety planning combines marine hazards, geospatial restrictions and risk assessment.";
      break;

    case "evidence":
      reasoning =
        "Evidence planning re-runs the same hazard/risk assessment so the answer can explain the real data and factors behind it.";
      break;

    case "pfz":
      reasoning =
        "Fishing-zone planning correlates ocean productivity, weather and geospatial restrictions before ranking suitability.";
      break;

    case "productivity":
      reasoning =
        "Productivity planning focuses on ocean indicators, trends and environmental drivers.";
      break;

    case "route":
      reasoning =
        "Route planning combines marine conditions, hazards and geospatial restrictions before assessing route safety.";
      break;

    case "geofence":
      reasoning =
        "Geofence planning prioritizes spatial boundary analysis and operational risk.";
      break;

    case "tide":
      reasoning =
        "Tide planning retrieves the relevant tidal state and upcoming tidal events.";
      break;

    default:
      break;
  }

  return {
    intent,
    tasks,
    reasoning,
    priority,
    parallelGroups,
  };
}

export async function runPlannerAgent(
  request: AgentRequest
): Promise<
  AgentResponse<PlannerResult>
> {
  try {
    const plan = planAgents(request);

    return {
      agent: "planner",
      status: "success",

      findings: [
        {
          id: `planner-${request.requestId}`,
          agent: "planner",

          title: "Agent execution plan created",

          summary:
            `${plan.tasks.length} tasks were planned for the ${request.intent.replace(
              /_/g,
              " "
            )} request.`,

          severity: "info",

          confidence: 1,

          data: {
            intent: plan.intent,
            taskCount: plan.tasks.length,
            priority: plan.priority,
            parallelGroups:
              plan.parallelGroups,
          },
        },
      ],

      evidence: [],

      data: plan,

      confidence: 1,

      nextAgents: plan.priority,
    };
  } catch (error) {
    return {
      agent: "planner",
      status: "failed",

      findings: [],
      evidence: [],

      confidence: 0,

      error:
        error instanceof Error
          ? error.message
          : "Unable to create the agent execution plan.",
    };
  }
}

export default runPlannerAgent;