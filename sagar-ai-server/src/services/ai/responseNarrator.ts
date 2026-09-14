import { requestChatCompletion } from "./openRouterClient";

import type { ChatLanguage } from "../../types/chat";

const LANGUAGE_NAMES: Record<ChatLanguage, string> = {
  en: "English",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  hi: "Hindi",
};

export interface NarrationFacts {
  userQuestion: string;
  situation?: string;
  recommendation?: string;
  riskLevel?: string;
  riskScore?: number;
  keyFactors?: string[];
  areaName?: string;
  routeSummary?: string;
  zonesSummary?: string;
  alertsSummary?: string;
  whatIfSummary?: string;
  language: ChatLanguage;
}

const SYSTEM_PROMPT = `You are Sagar, a marine safety assistant speaking to a small-craft fisherman in Tamil Nadu, India.

You will be given VERIFIED FACTS already computed by Sagar's backend systems (risk scores, marine readings, recommendations). Your only job is to phrase a short, warm, natural explanation of these exact facts for the fisherman.

STRICT RULES:
- Use ONLY the facts given to you. Never invent, guess, or alter any number, place name, wind/wave reading, risk score, route, or zone.
- If a "Route", "Fishing zones", "Active alerts" or "What-if comparison" fact is provided, mention its specific name(s)/values naturally - never say the information is unavailable when a fact for it is given.
- If none of those facts are provided for something the user asked about, say briefly that it isn't available right now rather than guessing.
- Reply in the requested language, naturally (not a literal word-for-word translation).
- 2 to 4 short sentences maximum. No headings, no bullet points, no markdown.
- Do not mention that you are an AI, a model, or that you were given "facts" or "instructions".
- If a recommendation is present, lead with it in plain language.`;

function buildFactsText(facts: NarrationFacts): string {
  const lines: string[] = [];

  lines.push(`User's question: ${facts.userQuestion}`);

  if (facts.areaName) {
    lines.push(`Area: ${facts.areaName}`);
  }

  if (facts.situation) {
    lines.push(`Situation: ${facts.situation}`);
  }

  if (typeof facts.riskScore === "number" && facts.riskLevel) {
    lines.push(
      `Risk: ${facts.riskLevel} (${facts.riskScore}/100)`
    );
  }

  if (facts.recommendation) {
    lines.push(`Recommendation: ${facts.recommendation}`);
  }

  if (facts.keyFactors && facts.keyFactors.length > 0) {
    lines.push(
      `Key factors: ${facts.keyFactors.slice(0, 5).join("; ")}`
    );
  }

  if (facts.routeSummary) {
    lines.push(`Route: ${facts.routeSummary}`);
  }

  if (facts.zonesSummary) {
    lines.push(`Fishing zones: ${facts.zonesSummary}`);
  }

  if (facts.alertsSummary) {
    lines.push(`Active alerts: ${facts.alertsSummary}`);
  }

  if (facts.whatIfSummary) {
    lines.push(`What-if comparison: ${facts.whatIfSummary}`);
  }

  return lines.join("\n");
}

/**
 * Produces a short natural-language explanation of Sagar's deterministic
 * facts, in the user's language. Returns `null` on any failure so the
 * caller falls back to the existing deterministic narrative text.
 */
export async function narrateResponse(
  facts: NarrationFacts
): Promise<string | null> {
  const languageName = LANGUAGE_NAMES[facts.language] ?? "English";

  return requestChatCompletion(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Reply in ${languageName}.\n\n${buildFactsText(facts)}`,
      },
    ],
    { temperature: 0.4, maxTokens: 220 }
  );
}

export default narrateResponse;
