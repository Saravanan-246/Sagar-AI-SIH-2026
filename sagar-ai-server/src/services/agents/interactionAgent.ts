import {
  analyzeIntent,
  detectQueryIntent,
  detectQueryLanguage,
  type SupportedLanguage,
  type SagarIntent,
} from "../ai/intent";

import type {
  AgentFinding,
  AgentRequest,
  AgentResponse,
  InteractionAgentData,
} from "./agentTypes";

function normalizeQuery(
  message: string
): string {
  return message
    .replace(/\s+/g, " ")
    .trim();
}

function toChatLanguage(
  language: SupportedLanguage
): InteractionAgentData["detectedLanguage"] {
  switch (language) {
    case "ta":
      return "ta";

    case "te":
      return "te";

    case "ml":
      return "ml";

    case "kn":
      return "kn";

    case "hi":
      return "hi";

    case "en":
    default:
      return "en";
  }
}

function toChatIntent(
  intent: SagarIntent
): InteractionAgentData["detectedIntent"] {
  switch (intent) {
    case "marine_conditions":
    case "safety":
    case "alerts":
    case "pfz":
    case "route":
    case "productivity":
    case "geofence":
    case "tide":
    case "general":
      return intent;

    default:
      return "general";
  }
}

function buildQueryContext(
  request: AgentRequest,
  language: InteractionAgentData["detectedLanguage"],
  intent: InteractionAgentData["detectedIntent"]
) {
  return {
    ...request.context,

    language,
    intent,

    lastUserMessage:
      request.message.trim(),

    areaName:
      request.context.areaName ??
      request.area?.name,
  };
}

function buildFinding(
  request: AgentRequest,
  language: InteractionAgentData["detectedLanguage"],
  intent: InteractionAgentData["detectedIntent"],
  normalizedQuery: string
): AgentFinding {
  return {
    id: `interaction-${request.requestId}`,
    agent: "interaction",

    title: "User request understood",

    summary: `Detected ${language} language and ${intent.replace(
      /_/g,
      " "
    )} intent.`,

    severity: "info",

    confidence: 0.96,

    data: {
      normalizedQuery,
      language,
      intent,
    },
  };
}

export async function runInteractionAgent(
  request: AgentRequest
): Promise<
  AgentResponse<InteractionAgentData>
> {
  try {
    const normalizedQuery =
      normalizeQuery(request.message);

    if (!normalizedQuery) {
      return {
        agent: "interaction",
        status: "failed",

        findings: [],
        evidence: [],

        confidence: 0,

        error:
          "The user query is empty.",
      };
    }

    /*
     * Detect language independently so the
     * response can stay in the user's language.
     */
    const detectedLanguage =
      toChatLanguage(
        detectQueryLanguage(
          normalizedQuery
        )
      );

    /*
     * Detect intent from the normalized query.
     */
    const detectedIntent =
      toChatIntent(
        detectQueryIntent(
          normalizedQuery
        )
      );

    /*
     * Run the combined analyzer as well.
     * This keeps language + intent interpretation
     * centralized in intent.ts.
     */
    let analysisLanguage =
      detectedLanguage;

    let analysisIntent =
      detectedIntent;

    try {
      const analysis =
        analyzeIntent(
          normalizedQuery
        );

      if (
        analysis &&
        typeof analysis === "object"
      ) {
        const candidate =
          analysis as {
            language?: SupportedLanguage;
            intent?: SagarIntent;
          };

        if (candidate.language) {
          analysisLanguage =
            toChatLanguage(
              candidate.language
            );
        }

        if (candidate.intent) {
          analysisIntent =
            toChatIntent(
              candidate.intent
            );
        }
      }
    } catch {
      /*
       * The direct detectors above are still
       * valid fallbacks.
       */
    }

    const context =
      buildQueryContext(
        request,
        analysisLanguage,
        analysisIntent
      );

    const data: InteractionAgentData = {
      detectedLanguage:
        analysisLanguage,

      detectedIntent:
        analysisIntent,

      normalizedQuery,

      responseLanguage:
        analysisLanguage,
    };

    const finding =
      buildFinding(
        request,
        analysisLanguage,
        analysisIntent,
        normalizedQuery
      );

    return {
      agent: "interaction",

      status: "success",

      findings: [finding],

      evidence: [],

      data,

      confidence: 0.96,

      nextAgents: ["planner"],

      warnings:
        analysisLanguage === "en" &&
        !request.message
          .trim()
          .match(/[a-zA-Z]/)
          ? [
              "Language detection confidence is limited for this query.",
            ]
          : undefined,
    };
  } catch (error) {
    return {
      agent: "interaction",

      status: "failed",

      findings: [],
      evidence: [],

      confidence: 0,

      error:
        error instanceof Error
          ? error.message
          : "Unable to understand the user request.",
    };
  }
}

export default runInteractionAgent;