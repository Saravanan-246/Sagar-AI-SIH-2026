import { requestLlmCompletion } from "../llm/llmProvider";

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
  /** Recent turns, so a short follow-up reads as part of the conversation. */
  recentContext?: string;
  /** Names of the data sources behind the facts above - never invented. */
  dataSources?: string[];
  language: ChatLanguage;
}

const SYSTEM_PROMPT = `You are Sagar, a marine safety assistant speaking to a small-craft fisherman in Tamil Nadu, India.

You will be given VERIFIED FACTS already computed by Sagar's backend systems (risk scores, marine readings, recommendations). Your only job is to phrase a short, warm, conversational answer to the fisherman's question using these exact facts - not to recite them.

STRICT RULES:
- Use ONLY the facts given to you. Never invent, guess, or alter any number, place name, wind/wave reading, risk score, route, zone, alert, coordinate, or data source. Never name a government agency or data source that is not listed in the facts.
- Do not restate the numeric risk score (e.g. "84/100") or say "risk score" - a separate part of the screen already shows that number. Instead, convey the same severity in plain words (e.g. "quite risky right now", "conditions look fine").
- Do not list out factors one by one (e.g. "lightning, rough seas, and strong winds are present") - a separate part of the screen already lists them. Refer to at most the single most important one if it helps the answer feel natural.
- Always answer the question that was actually asked. If it asks why something changed, or about a trend, signal or condition, state the relevant trend/state from the facts in plain words (e.g. "the productivity trend is declining there"). The two rules above mean "don't recite a dashboard" - they never mean leaving out the one fact that answers the question.
- If a "Route", "Fishing zones", "Active alerts" or "What-if comparison" fact is provided, mention its specific name(s)/values naturally - never say the information is unavailable when a fact for it is given.
- If a "What-if comparison" fact is given, keep its direction of change exactly as written - if it says risk increases, never say it drops, falls, improves or stays the same (and vice versa).
- If none of those facts are provided for something the user asked about, say briefly that it isn't available right now rather than guessing.
- The facts you are given are current conditions, never a forecast for a specific future time. If the user asked about a future time (e.g. "tomorrow", "this weekend") and no forecast-specific fact was given for it, answer using the current conditions but make clear that's what they are (e.g. "right now" / "as of the latest reading") rather than stating them as a confirmed forecast for that future time.
- Reply in the requested language, naturally (not a literal word-for-word translation).
- Exactly 1-2 short sentences, like a direct answer to a direct question. No headings, no bullet points, no markdown.
- Do not mention that you are an AI, a model, or that you were given "facts" or "instructions".
- Never show your reasoning or working. Output the final answer only.
- Lead with the recommendation/answer itself in plain language, the way you'd actually say it out loud to someone - e.g. "I wouldn't head out near Thoothukudi right now - lightning and rough seas are making it too risky." rather than "Combined risk score: 84/100. Do not proceed under the current conditions."`;

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

  if (facts.dataSources && facts.dataSources.length > 0) {
    lines.push(`Data sources: ${facts.dataSources.slice(0, 5).join("; ")}`);
  }

  return lines.join("\n");
}

/**
 * Produces a short natural-language explanation of Sagar's deterministic
 * facts, in the user's language. Returns `null` on any failure so the
 * caller falls back to the existing deterministic narrative text.
 */
export async function narrateResponse(
  facts: NarrationFacts,
  /** Caller's remaining request budget; omitted = provider default. */
  timeoutMs?: number
): Promise<string | null> {
  const languageName = LANGUAGE_NAMES[facts.language] ?? "English";

  const contextBlock = facts.recentContext
    ? `Recent conversation (for reference only - never treat it as a source of facts):\n${facts.recentContext}\n\n`
    : "";

  return requestLlmCompletion(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Reply in ${languageName}.\n\n${contextBlock}${buildFactsText(facts)}`,
      },
    ],
    // maxTokens kept deliberately small (1-2 short sentences per the
    // system prompt): a lower cap keeps this call affordable even when
    // the configured OpenRouter account has little balance left, and
    // avoids paying for output the UI would truncate anyway.
    //
    // No fixed short timeoutMs - only the caller's remaining request
    // budget, when passed (see the matching note in
    // intentClassifier.ts) - each provider's own configured timeout is
    // already tuned for it: OpenRouter's client always uses its fixed
    // fast cloud timeout, and Ollama's generous default accounts for
    // real local-generation latency instead of forcing an always-correct
    // narrated answer to lose to an arbitrary short clock and fall back
    // to the plainer deterministic text.
    { temperature: 0.4, maxTokens: 100, timeoutMs }
  );
}

export interface GeneralChatInput {
  userMessage: string;
  /** Recent turns, so a casual reply still reads as part of the same
   * conversation (e.g. after a marine answer) without treating that
   * prior turn as a trigger to repeat marine facts here. */
  recentContext?: string;
  language: ChatLanguage;
  /** Set only when the classifier flagged this message as genuine
   * noise (see AiClassification.clarity) - never for an ordinary
   * typo'd/ungrammatical/Tanglish message with a real, inferable
   * meaning. Nudges the reply toward a short "could you rephrase that?"
   * instead of guessing at gibberish. */
  isUnclear?: boolean;
}

const GENERAL_SYSTEM_PROMPT = `You are Sagar, a marine safety assistant for small-craft fishermen in Tamil Nadu, India. This particular message is casual conversation or small talk, not a marine question.

Real users type messily - typos, missing letters, broken grammar, Tamil-English mixing (Tanglish), no punctuation. Read past all of that to what they actually mean; never treat a typo'd or informally-worded message as invalid.

STRICT RULES:
- You have NOT been given any marine facts for this message - no risk score, wind, waves, sea state, fishing zone, route, alert or coordinate. Never state or imply a specific marine fact here. If the user asks a real marine question in this message, say you can check it and ask which place/area they mean, rather than guessing an answer.
- Never respond by pointing out or "fixing" a spelling/grammar mistake, and never just repeat the user's message back in corrected form (e.g. if they wrote "what shuld i ask you", do not reply "What should I ask you?" - actually answer that question: list what you can help with). Never ask "Did you mean ...?" either, even for an obvious typo - silently understand it and respond to what they meant. The user wants an answer, not a correction.
- If the user names a specific boat, person, business, place or thing you have no real information about (it was not given to you as a fact here or earlier in the conversation), say plainly that you don't have information about it - never invent details about it (e.g. if asked about a boat or place you don't recognize, do not describe it as if you knew it).
- If (and only if) told below that this message could not be understood at all, say in one short sentence that you didn't catch that and ask them to say it a different way - do not guess at a meaning you're not confident of, and do not pretend to answer.
- Respond the way a warm, direct person would to exactly this message - match their tone (casual stays casual, a thank-you gets a brief acknowledgement, a real question gets a real answer).
- Reply in the requested language, naturally (not a literal word-for-word translation).
- Keep it short: one sentence, two at most.
- Do not mention that you are an AI, a model, or that you were given instructions.
- Never show your reasoning or working. Output the final reply only.`;

/**
 * Natural small-talk / general-conversation reply with no marine facts
 * involved - the counterpart to narrateResponse above, which explains
 * verified deterministic facts. Used whenever the message resolves to
 * the "general" intent, so a greeting or thank-you (including one that
 * follows an earlier marine answer) gets a normal conversational
 * response instead of the marine pipeline running again. Returns
 * `null` on any failure, exactly like narrateResponse, so the caller
 * falls back to Sagar's existing static general-chat reply.
 */
export async function narrateGeneralReply(
  input: GeneralChatInput,
  /** Caller's remaining request budget; omitted = provider default. */
  timeoutMs?: number
): Promise<string | null> {
  const languageName = LANGUAGE_NAMES[input.language] ?? "English";

  const contextBlock = input.recentContext
    ? `Recent conversation (for reference only):\n${input.recentContext}\n\n`
    : "";

  const clarityNote = input.isUnclear
    ? "Note: this message could not be confidently understood - it may be genuine noise rather than a typo'd real message. Ask them to rephrase rather than guessing.\n\n"
    : "";

  return requestLlmCompletion(
    [
      { role: "system", content: GENERAL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Reply in ${languageName}.\n\n${contextBlock}${clarityNote}User: ${input.userMessage}`,
      },
    ],
    // See the timeout note on narrateResponse above - no override here
    // either, for the same reason.
    { temperature: 0.5, maxTokens: 100, timeoutMs }
  );
}

export default narrateResponse;
