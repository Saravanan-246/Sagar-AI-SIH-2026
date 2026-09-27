import { requestLlmCompletion } from "../llm/llmProvider";
import { checkNarration, sanitizeNarration } from "./narrationGuard";

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
  /** Data freshness/confidence caveat that must survive rephrasing. */
  freshness?: string;
  /** Set when the freshness caveat is a real warning (stale/estimated). */
  freshnessIsWarning?: boolean;
  language: ChatLanguage;
}

const SYSTEM_PROMPT = `You are Sagar, a marine safety assistant talking with a small-craft fisherman in coastal India. Your reply is shown in the chat and may also be read aloud.

You are given VERIFIED FACTS already computed by Sagar (risk, marine readings, routes, zones, alerts). Your only job is to say them naturally. You never add to them.

FACTS - STRICT:
- Use ONLY the facts given. Never invent, estimate, convert or alter any number, unit, place, wind/wave/SST reading, risk level, route, fishing zone, alert or data source.
- Never contradict the risk level or the recommendation. If the risk is low, do not tell them to stay ashore; if it is high or critical, do not say it is fine to go.
- Never create a safety conclusion the facts do not support. If something they asked about is not in the facts, say briefly that you don't have it right now.
- If a freshness/confidence caveat is given (e.g. data is older than ideal, estimated), keep that caveat in plain words.
- The facts describe current conditions, not a forecast. If they ask about tomorrow and no forecast fact is given, answer with current conditions and say so ("right now", "as of the latest reading"). Never say what conditions "will be" or are "expected" to be.
- If a Route, Fishing zones, Active alerts or What-if fact is given, name it naturally. Keep a what-if's direction of change exactly as written.

STYLE:
- Answer first, in 2-3 short sentences. Mention only the one or two facts that answer the question; the screen already shows the full breakdown, score and factor list.
- Do not restate the numeric risk score ("84/100") - say the severity in words.
- Sound like a knowledgeable person talking: warm, direct, calm. No headings, lists, tables, markdown, emojis or quotation marks.
- Do not repeat the user's question. Do not open with "According to the system", "Based on the available data" or similar. No disclaimers or filler.
- Mention the area name at most once, and not at all if the conversation already established it.
- When it genuinely helps, end with one short next step (e.g. offer the safest route or the best zone).
- Reply in the requested language, naturally, not word for word. Keep place names, route names and zone names exactly as written in the facts.
- Never mention being an AI, a model, a prompt, "facts", agents or any internal system. Output only the final reply.`;

function buildFactsText(facts: NarrationFacts): string {
  const lines: string[] = [];

  lines.push(`User's question: ${facts.userQuestion}`);

  if (facts.areaName) {
    lines.push(`Area: ${facts.areaName}`);
  }

  if (facts.situation) {
    lines.push(`Situation: ${facts.situation}`);
  }

  // Level only: the screen shows the numeric score, and a model given
  // "22/100" tends to recite it (which the guard then rejects).
  if (facts.riskLevel) {
    lines.push(`Risk level: ${facts.riskLevel}`);
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

  if (facts.freshness) {
    lines.push(`Data freshness: ${facts.freshness}`);
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

  const factsText = buildFactsText(facts);

  const raw = await requestLlmCompletion(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Reply in ${languageName}.

${contextBlock}${factsText}`,
      },
    ],
    // Budget for 2-3 short sentences. Non-Latin scripts cost several
    // times more tokens per word, so a Tamil/Hindi answer gets more room
    // rather than being cut off mid-sentence (a cut-off answer would be
    // rejected below and fall back anyway).
    //
    // No fixed short timeoutMs - only the caller's remaining request
    // budget, when passed (see the matching note in
    // intentClassifier.ts) - each provider's own configured timeout is
    // already tuned for it.
    {
      temperature: 0.4,
      maxTokens: facts.language === "en" ? 160 : 320,
      timeoutMs,
    }
  );

  return acceptNarration(raw, {
    factsText,
    userText: facts.userQuestion,
    riskLevel: facts.riskLevel,
    language: facts.language,
    requiresFreshnessCaveat: facts.freshnessIsWarning,
  });
}

/** Sanitises LLM output and keeps it only if it is consistent with the
 * facts; `null` sends the caller to the deterministic answer. */
function acceptNarration(
  raw: string | null,
  check: Parameters<typeof checkNarration>[1]
): string | null {
  const text = sanitizeNarration(raw);

  if (!text) {
    return null;
  }

  const verdict = checkNarration(text, check);

  if (!verdict.ok) {
    console.warn(
      `[llm] narration rejected (${verdict.reason}) - using the deterministic answer. Rejected: "${text.slice(0, 160)}"`
    );
    return null;
  }

  return text;
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
- Do not repeat the user's message back, and do not open with filler like "Great question".
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

  const raw = await requestLlmCompletion(
    [
      { role: "system", content: GENERAL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Reply in ${languageName}.

${contextBlock}${clarityNote}User: ${input.userMessage}`,
      },
    ],
    // See the timeout note on narrateResponse above - no override here
    // either, for the same reason.
    {
      temperature: 0.5,
      maxTokens: input.language === "en" ? 120 : 240,
      timeoutMs,
    }
  );

  // No marine facts were given, so any marine number in the reply is
  // invented - only numbers the user said themselves may appear.
  return acceptNarration(raw, {
    factsText: "",
    userText: input.userMessage,
    language: input.language,
  });
}

export default narrateResponse;
