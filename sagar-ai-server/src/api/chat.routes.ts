import { randomUUID } from "crypto";

import { Router } from "express";
import { z } from "zod";

import { runAgentOrchestrator } from "../services/agents/agentOrchestrator";
import {
  detectWhatIf,
  describeWhatIf,
  runWhatIf,
} from "../services/whatif/whatIfEngine";
import { calculateRouteOptions } from "../services/routes/routeService";
import { getMarineAreaByName, getMarineAreas } from "../services/marine/marineData";
import {
  classifyWithAi,
  type ConversationTurn,
} from "../services/ai/intentClassifier";
import { analyzeIntent, detectQueryLanguage } from "../services/ai/intent";
import { narrateResponse, narrateGeneralReply } from "../services/ai/responseNarrator";
import { buildDeterministicAnswer } from "../services/ai/fallbackNarrator";
import { isLlmEnabled } from "../services/llm/llmProvider";
import { asyncHandler } from "../middleware/validate";
import {
  buildAgentRequest,
  findNearestMarineAreaWithinCoverage,
  resolveArea,
} from "./shared";
import {
  shapeChatResponse,
  buildDataStatus,
  type ChatClarificationNeed,
  type ShapeChatResponseExtras,
  type StructuredSagarResponse,
} from "./responseShaper";

import type { ChatIntent, ChatLanguage } from "../types/chat";
import type { RoutePlan } from "../types/route";

const languageEnum = z.enum(["en", "ta", "te", "ml", "kn", "hi"]);

const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(2000),
});

const chatInputSchema = z.object({
  message: z.string().trim().min(1, "message is required"),
  language: languageEnum.optional(),
  areaId: z.string().optional(),
  areaName: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  history: z.array(historyTurnSchema).max(8).optional(),
});

type ChatInput = z.infer<typeof chatInputSchema>;

const router = Router();

// Deterministic "safest route from A to B" parsing - cheap, no AI call needed.
const FROM_TO_PATTERN = /\bfrom\s+(.+?)\s+to\s+(.+?)(?:[.?!]|$)/i;

function parseFromToRoute(
  message: string
): { from: string; to: string } | null {
  const match = message.match(FROM_TO_PATTERN);

  if (!match) {
    return null;
  }

  const from = match[1].trim();
  const to = match[2].trim();

  return from && to ? { from, to } : null;
}

type ExplicitRouteResult =
  | { kind: "none" }
  | { kind: "resolved"; route: RoutePlan | null }
  // The message named an explicit "from X to Y", but X and/or Y don't
  // match any configured marine area - never silently substitute the
  // default area here, that would render a fabricated route between
  // places Sagar has no real data for.
  | { kind: "unsupported"; from: string; to: string };

function resolveExplicitRoute(message: string): ExplicitRouteResult {
  const parsed = parseFromToRoute(message);

  if (!parsed) {
    return { kind: "none" };
  }

  // getMarineAreaByName (unlike resolveArea) returns undefined instead
  // of silently defaulting when nothing configured matches the name.
  const originArea = getMarineAreaByName(parsed.from);
  const destinationArea = getMarineAreaByName(parsed.to);

  if (!originArea || !destinationArea) {
    return { kind: "unsupported", from: parsed.from, to: parsed.to };
  }

  const options = calculateRouteOptions(
    originArea.coordinates,
    destinationArea.coordinates,
    { maxOptions: 1 }
  );

  return { kind: "resolved", route: options[0] ?? null };
}

const ROUTE_DECISION_PHRASE: Record<RoutePlan["routeDecision"], string> = {
  preferred: "This route is recommended",
  caution: "This route requires caution",
  avoid: "This route should be avoided",
  blocked: "This route is currently blocked",
};

/*
 * The reporting agent's situation/recommendation text is built from the
 * general area-wide risk assessment (weather/marine/alerts for wherever
 * the chat's context area happens to be) - it has no notion of a
 * specific resolved route and its own, usually very different, risk.
 * For a route intent, showing that generic area risk as "the answer"
 * is actively misleading (e.g. an 84/critical area alert score next to
 * a route whose whole point is a safe 18/low corridor that avoids that
 * exact hazard). Rebuild the answer directly from the resolved route's
 * own fields instead, so narration/fallback both explain the route
 * that was actually returned.
 */
function applyRouteAnswer(shaped: StructuredSagarResponse): void {
  const route = shaped.route;

  if (!route) {
    return;
  }

  shaped.riskLevel = route.risk.level;
  shaped.riskScore = route.risk.score;

  shaped.keyFactors = [
    route.reason,
    ...route.avoidedHazards.map((hazard) => `Avoids ${hazard}.`),
  ].filter((factor): factor is string => Boolean(factor && factor.trim()));

  shaped.situation = `${route.name} covers ${route.distanceKm.toFixed(1)} km with an estimated risk of ${route.risk.score}/100 (${route.risk.level}).`;

  shaped.recommendation = `${ROUTE_DECISION_PHRASE[route.routeDecision]} - ${route.reason}`;

  shaped.answer = `${shaped.situation} ${shaped.recommendation}`;
}

/*
 * A real "what if X" question can land on almost any keyword-matched
 * primary intent (e.g. a wind-increase what-if scores a tie against
 * "productivity" in the deterministic classifier and loses to it) even
 * though whatIfEngine has already computed the correct, specific
 * before/after comparison for it. When that comparison exists, it is a
 * much more direct answer to "what happens if...?" than whatever
 * unrelated intent's generic summary would otherwise be shown.
 */
function applyWhatIfAnswer(shaped: StructuredSagarResponse): void {
  const whatIf = shaped.whatIf;

  if (!whatIf) {
    return;
  }

  shaped.riskLevel = whatIf.after.riskLevel;
  shaped.riskScore = whatIf.after.riskScore;

  shaped.keyFactors = [
    `Current risk: ${whatIf.before.riskScore}/100 (${whatIf.before.riskLevel}).`,
    `If ${whatIf.question}: ${whatIf.after.riskScore}/100 (${whatIf.after.riskLevel}).`,
  ];

  shaped.situation = whatIf.impact;
  shaped.recommendation = whatIf.recommendation;
  shaped.answer = `${whatIf.impact} ${whatIf.recommendation}`.trim();
}

/*
 * pfz/alerts/marine_conditions intents already carry the right
 * structured data (zones, alerts, ocean evidence) but the reporting
 * agent's prose answer only ever reflects the generic area-wide risk
 * finding - so three genuinely different questions about the same
 * area can read as an identical answer. Each of these reuses fields
 * already present on the shaped response (no new data, no new call).
 */
function applyZoneAnswer(shaped: StructuredSagarResponse): void {
  const zones = shaped.zones;

  if (!zones || zones.length === 0) {
    return;
  }

  const best = zones.find((zone) => zone.recommendation === "PREFER") ?? zones[0];
  const area = shaped.affectedArea?.name;
  const reason = best.reasons[0];

  shaped.keyFactors = best.reasons.slice(0, 3);
  shaped.situation = `${best.name} looks like the best fishing zone right now${area ? ` near ${area}` : ""}.`;
  shaped.recommendation = reason ?? `This zone is currently rated "${best.recommendation}".`;
  shaped.answer = `${shaped.situation} ${shaped.recommendation}`.trim();

  /*
   * The riskLevel/riskScore inherited from the shaper describe the
   * area-wide hazard assessment, not this zone - so a zone being
   * recommended on suitability/chlorophyll/SST renders under a
   * "CRITICAL 84/100" badge, directly contradicting the favourable
   * reasons listed beside it. Zones carry a PREFER/MONITOR/AVOID
   * recommendation but no equivalent 0-100 score, so drop the fields
   * rather than substitute a number Sagar has not computed; the client
   * already hides the risk row when they are absent.
   */
  shaped.riskLevel = undefined;
  shaped.riskScore = undefined;
}

function applyAlertsAnswer(shaped: StructuredSagarResponse): void {
  const alerts = shaped.alerts;

  if (!alerts || alerts.length === 0) {
    return;
  }

  const severityOrder: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
  const top = [...alerts].sort(
    (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0)
  )[0];
  const area = shaped.affectedArea?.name;

  shaped.situation = `${alerts.length} active alert${alerts.length === 1 ? "" : "s"}${area ? ` near ${area}` : ""}, the most severe being "${top.title}" (${top.severity}).`;
  shaped.recommendation = top.recommendation;
  shaped.answer = `${shaped.situation} ${shaped.recommendation}`.trim();
}

function applyOceanAnswer(shaped: StructuredSagarResponse): void {
  const oceanEvidence = shaped.evidence?.find(
    (item) => item.type === "ocean" && item.summary
  );

  if (!oceanEvidence?.summary) {
    return;
  }

  const area = shaped.affectedArea?.name;

  shaped.situation = `${oceanEvidence.summary}${area ? ` (${area})` : ""}`;
  shaped.answer = shaped.situation;
}

const UNSUPPORTED_LOCATION_MESSAGE: Record<"en" | "ta" | "hi", (from: string, to: string) => string> = {
  en: (from, to) =>
    `${from} and ${to} are not currently available as configured route points in Sagar. Please select one of the available marine areas or route endpoints.`,
  ta: (from, to) =>
    `${from} மற்றும் ${to} தற்போது Sagar-இல் கட்டமைக்கப்பட்ட பாதை புள்ளிகளாக இல்லை. கிடைக்கும் கடல் பகுதிகளில் ஒன்றை தேர்ந்தெடுக்கவும்.`,
  hi: (from, to) =>
    `${from} और ${to} अभी Sagar में कॉन्फ़िगर किए गए रूट पॉइंट के रूप में उपलब्ध नहीं हैं। कृपया उपलब्ध समुद्री क्षेत्रों में से किसी एक को चुनें।`,
};

/*
 * ------------------------------------------------------------------
 * QUERY GATING
 * ------------------------------------------------------------------
 * Without this, ANY message - "bro", "what is the capital of India?",
 * a follow-up with no context, or even casual chat in the middle of an
 * existing marine conversation - still flows through the full agent
 * pipeline, which always resolves SOME marine area (falling through
 * to the configured default, Thoothukudi Coast, or whatever area a
 * prior turn established) and always runs the risk/weather agents for
 * it. That produces a confident-looking "Combined risk score:
 * 84/100... Thoothukudi Coast" answer for questions that have nothing
 * to do with Thoothukudi, or with marine safety at all - including a
 * "bro" that follows a real marine answer, which would otherwise just
 * repeat that answer. This gate runs first and short-circuits those
 * cases before the pipeline (and its area-defaulting) ever runs,
 * using the existing deterministic keyword classifier from
 * services/ai/intent.ts (reconciled with the AI classifier above, when
 * one ran) to decide intent - a stored location or prior marine turn
 * is never, on its own, treated as reason to run marine intelligence.
 * The "general" branch below does make its own Ollama call, but only
 * to phrase a natural conversational reply - never to produce marine
 * facts, which remain exclusively the deterministic services' job.
 */

// A short greeting/acknowledgement never needs marine data at all.
const CASUAL_PATTERN =
  /^(hi|hello|hey|yo|sup|bro|ok|okay|k|thanks|thank you|thx|good morning|good afternoon|good evening|bye|goodbye)[.!? ]*$/i;
const CASUAL_PATTERN_TA = /^(வணக்கம்|நன்றி|சரி)[.!?\s]*$/;
const CASUAL_PATTERN_HI = /^(नमस्ते|हाय|धन्यवाद|शुक्रिया|ठीक है)[.!?\s]*$/;

function isCasualMessage(message: string): boolean {
  const trimmed = message.trim();

  return (
    CASUAL_PATTERN.test(trimmed) ||
    CASUAL_PATTERN_TA.test(trimmed) ||
    CASUAL_PATTERN_HI.test(trimmed)
  );
}

/*
 * A deterministic safety net, not a response dictionary: this decides
 * intent only, never reply text (Ollama still writes the actual
 * answer in the "general" branch below). It exists because the AI
 * classifier is given recent conversation history so it can resolve a
 * genuine short follow-up ("what about tomorrow?") - but that same
 * history can lead a smaller/local model to misread an unrelated
 * "bro" or "thanks bro" said right after a marine answer as
 * continuing that marine topic, which is exactly the bug this whole
 * gate exists to prevent. A message built entirely from short
 * filler/acknowledgement words (however many of them, whatever order)
 * is never a marine follow-up, so it overrides the classifier here
 * regardless of what it returned.
 */
const FILLER_WORDS = new Set([
  "hi", "hello", "hey", "yo", "sup", "bro", "broo", "bruh", "bud", "buddy",
  "dude", "man", "boss",
  "ok", "okay", "k", "kk", "alright", "fine", "cool", "nice", "great", "sure",
  "thanks", "thank", "thx", "ty", "pls", "please",
  "yes", "yeah", "yep", "yup", "no", "nah", "nope",
  "good", "morning", "afternoon", "evening", "night",
  "bye", "goodbye", "see", "you", "later",
]);

function isFillerOnlyMessage(message: string): boolean {
  const stripped = message
    .trim()
    .replace(/[.!?,…]+$/g, "")
    .trim();

  // Bare punctuation ("...", "?", "??") or nothing at all.
  if (!/[a-zA-Z]/.test(stripped)) {
    return stripped.length <= 5;
  }

  const words = stripped.toLowerCase().split(/\s+/).filter(Boolean);

  return (
    words.length > 0 &&
    words.length <= 4 &&
    words.every((word) => FILLER_WORDS.has(word))
  );
}

// Intents that only mean something for a specific place - "is it
// safe?" or "ocean indicators?" with no place named anywhere is not
// answerable without guessing which of Sagar's configured areas the
// user meant.
const LOCATION_REQUIRED_INTENTS = new Set<ChatIntent>([
  "safety",
  "pfz",
  "marine_conditions",
  "tide",
  "geofence",
  "productivity",
]);

/** A configured marine area named (by full name or its first
 * significant word, e.g. "Thoothukudi" for "Thoothukudi Coast")
 * anywhere in the given text - used only to decide whether a location
 * was actually specified, never to invent one. */
function findMentionedArea(text: string) {
  const normalized = text.toLowerCase();

  return getMarineAreas().find((area) => {
    const nameLower = area.name.toLowerCase();

    if (normalized.includes(nameLower)) {
      return true;
    }

    return area.name
      .split(" ")
      .some((word) => word.length > 3 && normalized.includes(word.toLowerCase()));
  });
}

const CASUAL_REPLY: Record<ChatLanguage, string> = {
  en: "Hi - I'm Sagar. Ask me about marine safety, weather, ocean conditions, alerts, fishing zones or routes.",
  ta: "வணக்கம் - நான் சாகர். கடல் பாதுகாப்பு, வானிலை, கடல் நிலைகள், எச்சரிக்கைகள், மீன்பிடி பகுதிகள் அல்லது பாதைகள் பற்றி என்னிடம் கேளுங்கள்.",
  hi: "नमस्ते - मैं Sagar हूं। समुद्री सुरक्षा, मौसम, समुद्री स्थिति, चेतावनी, मछली पकड़ने के क्षेत्र या मार्गों के बारे में मुझसे पूछें।",
  te: "Hi - I'm Sagar. Ask me about marine safety, weather, ocean conditions, alerts, fishing zones or routes.",
  ml: "Hi - I'm Sagar. Ask me about marine safety, weather, ocean conditions, alerts, fishing zones or routes.",
  kn: "Hi - I'm Sagar. Ask me about marine safety, weather, ocean conditions, alerts, fishing zones or routes.",
};

const UNSUPPORTED_REPLY: Record<ChatLanguage, string> = {
  en: "That's outside Sagar's marine decision-support scope. I can help with marine safety, weather, ocean conditions, alerts, fishing zones, routes or what-if analysis.",
  ta: "இது சாகரின் கடல் முடிவு-துணை வரம்புக்கு வெளியே உள்ளது. கடல் பாதுகாப்பு, வானிலை, கடல் நிலைகள், எச்சரிக்கைகள், மீன்பிடி பகுதிகள், பாதைகள் அல்லது இதுவானால்-என்ன பகுப்பாய்வு குறித்து நான் உதவ முடியும்.",
  hi: "यह Sagar के समुद्री निर्णय-सहायता दायरे से बाहर है। मैं समुद्री सुरक्षा, मौसम, समुद्री स्थिति, चेतावनी, मछली पकड़ने के क्षेत्र, मार्ग या व्हाट-इफ विश्लेषण में मदद कर सकता हूं।",
  te: "That's outside Sagar's marine decision-support scope. I can help with marine safety, weather, ocean conditions, alerts, fishing zones, routes or what-if analysis.",
  ml: "That's outside Sagar's marine decision-support scope. I can help with marine safety, weather, ocean conditions, alerts, fishing zones, routes or what-if analysis.",
  kn: "That's outside Sagar's marine decision-support scope. I can help with marine safety, weather, ocean conditions, alerts, fishing zones, routes or what-if analysis.",
};

/*
 * Clarification copy is deliberately conversational rather than a
 * technical "Location required." - the user is talking to Sagar, not
 * configuring it. Each entry pairs with a `needs` descriptor so the
 * client can offer the matching action inline in the conversation.
 * These are plain templates, not an LLM call, so they stay instant and
 * work with the AI provider offline.
 */
const LOCATION_CLARIFICATION: Record<ChatLanguage, string> = {
  en: "Sure - I can check that. Would you like me to use your current location, or pick an area?",
  ta: "கண்டிப்பாக - நான் பார்க்கிறேன். உங்கள் தற்போதைய இருப்பிடத்தைப் பயன்படுத்தவா, அல்லது ஒரு பகுதியைத் தேர்ந்தெடுக்கிறீர்களா?",
  hi: "ज़रूर - मैं देख सकता हूं। क्या मैं आपकी वर्तमान लोकेशन का उपयोग करूं, या आप कोई क्षेत्र चुनना चाहेंगे?",
  te: "Sure - I can check that. Would you like me to use your current location, or pick an area?",
  ml: "Sure - I can check that. Would you like me to use your current location, or pick an area?",
  kn: "Sure - I can check that. Would you like me to use your current location, or pick an area?",
};

const OUT_OF_COVERAGE_CLARIFICATION: Record<ChatLanguage, string> = {
  en: "Your current location is outside the sea areas Sagar covers right now, so I don't have marine data for it. You can pick one of the available areas instead.",
  ta: "உங்கள் தற்போதைய இருப்பிடம் சாகர் தற்போது உள்ளடக்கிய கடல் பகுதிகளுக்கு வெளியே உள்ளது, அதற்கான கடல் தரவு என்னிடம் இல்லை. கிடைக்கும் பகுதிகளில் ஒன்றைத் தேர்ந்தெடுக்கலாம்.",
  hi: "आपकी वर्तमान लोकेशन उन समुद्री क्षेत्रों से बाहर है जिन्हें Sagar अभी कवर करता है, इसलिए मेरे पास उसका समुद्री डेटा नहीं है। आप उपलब्ध क्षेत्रों में से कोई एक चुन सकते हैं।",
  te: "Your current location is outside the sea areas Sagar covers right now. You can pick one of the available areas instead.",
  ml: "Your current location is outside the sea areas Sagar covers right now. You can pick one of the available areas instead.",
  kn: "Your current location is outside the sea areas Sagar covers right now. You can pick one of the available areas instead.",
};

/*
 * Ask only for the endpoint that is actually missing - never re-ask for
 * one the user has already given.
 */
const ROUTE_CLARIFICATION: Record<
  "both" | "origin" | "destination",
  Record<ChatLanguage, string>
> = {
  both: {
    en: "Sure. Where are you starting from, and where are you going?",
    ta: "கண்டிப்பாக. நீங்கள் எங்கிருந்து புறப்படுகிறீர்கள், எங்கே செல்கிறீர்கள்?",
    hi: "ज़रूर। आप कहां से शुरू कर रहे हैं, और कहां जाना है?",
    te: "Sure. Where are you starting from, and where are you going?",
    ml: "Sure. Where are you starting from, and where are you going?",
    kn: "Sure. Where are you starting from, and where are you going?",
  },
  origin: {
    en: "Sure - where are you starting from?",
    ta: "கண்டிப்பாக - நீங்கள் எங்கிருந்து புறப்படுகிறீர்கள்?",
    hi: "ज़रूर - आप कहां से शुरू कर रहे हैं?",
    te: "Sure - where are you starting from?",
    ml: "Sure - where are you starting from?",
    kn: "Sure - where are you starting from?",
  },
  destination: {
    en: "Got it. Where would you like to go?",
    ta: "சரி. நீங்கள் எங்கே செல்ல விரும்புகிறீர்கள்?",
    hi: "समझ गया। आप कहां जाना चाहेंगे?",
    te: "Got it. Where would you like to go?",
    ml: "Got it. Where would you like to go?",
    kn: "Got it. Where would you like to go?",
  },
};

// Which half of "from X to Y" the message already supplies, so the
// question back to the user only covers the genuinely missing part.
const ORIGIN_ONLY_PATTERN = /\bfrom\s+\S+/i;
const DESTINATION_ONLY_PATTERN = /\b(?:to|towards|toward)\s+\S+/i;

function detectMissingRouteEndpoints(
  message: string
): Array<"origin" | "destination"> {
  const hasOrigin = ORIGIN_ONLY_PATTERN.test(message);
  const hasDestination = DESTINATION_ONLY_PATTERN.test(message);

  if (hasOrigin && !hasDestination) return ["destination"];
  if (hasDestination && !hasOrigin) return ["origin"];

  return ["origin", "destination"];
}

function buildGateResponse(
  status: "unsupported" | "clarification_needed",
  intent: string,
  language: ChatLanguage,
  answer: string,
  needs?: ChatClarificationNeed
): StructuredSagarResponse {
  return {
    requestId: randomUUID(),
    status,
    intent,
    language,
    answer,
    timestamp: new Date().toISOString(),
    dataStatus: buildDataStatus(),
    ...(needs ? { needs } : {}),
  };
}

async function handleChat(input: ChatInput) {
  const history: ConversationTurn[] = input.history ?? [];

  const classification = isLlmEnabled()
    ? await classifyWithAi(input.message, history).catch(() => null)
    : null;

  const gateLanguage: ChatLanguage = (input.language ??
    classification?.language ??
    detectQueryLanguage(input.message)) as ChatLanguage;

  // A configured area named in this message, or (failing that) in the
  // most recent user message from history - lets a genuine follow-up
  // ("what about tomorrow?" after "is it safe near Thoothukudi?")
  // still resolve correctly without an AI call, while a message that
  // never names anywhere stays ungrounded rather than silently
  // defaulting.
  const mentionedArea =
    findMentionedArea(input.message) ??
    [...history]
      .reverse()
      .map((turn) => (turn.role === "user" ? findMentionedArea(turn.text) : undefined))
      .find(Boolean);

  const deterministicIntent = analyzeIntent(input.message).intent;

  /*
   * The AI classifier is better at follow-ups and phrasing, but it also
   * falls back to "general" whenever it is unsure - and a local model
   * does that fairly often on Tamil/Hindi script. Letting that vague
   * "general" override a confident keyword match silently drops real
   * questions into the out-of-scope reply (e.g. the Tamil fishing-zone
   * phrasing "இன்று எந்த மீன்பிடி பகுதி சிறந்தது?", which the
   * deterministic classifier already scores as "pfz"). Prefer the AI
   * label only when it actually commits to one - except a message
   * that is nothing but filler words, which is never a marine
   * follow-up no matter how confidently the classifier tied it to the
   * conversation's earlier marine topic.
   */
  const effectiveIntent = (
    isFillerOnlyMessage(input.message)
      ? "general"
      : classification?.intent && classification.intent !== "general"
        ? classification.intent
        : deterministicIntent
  ) as ChatIntent;

  const hasExplicitLocation = Boolean(
    input.areaId ||
      input.areaName ||
      classification?.areaHint ||
      (typeof input.latitude === "number" && typeof input.longitude === "number") ||
      mentionedArea
  );

  // A genuine "what if...?" hypothetical (detected the same way the
  // pipeline itself detects it below, independent of intent keyword
  // matching) is never truly location-ambiguous the way "is it safe?"
  // is - it reasonably applies to whatever area is already in context,
  // same as before this gate existed. Without this, "what happens if
  // wind increases?" would get blocked by the location-required check
  // below purely because its keyword-classified intent happens to be
  // "productivity" (a pre-existing classifier quirk), not because the
  // question is actually ambiguous.
  const isWhatIfQuery = Boolean(detectWhatIf(input.message) || classification?.isWhatIf);

  /*
   * Device coordinates that sit outside Sagar's configured marine areas
   * have no supported data behind them. resolveArea would still snap
   * them to the nearest configured area, which would present coverage
   * Sagar does not actually have - so say so plainly and offer the area
   * picker instead. Only applies to location-dependent questions; a
   * greeting is still just a greeting.
   */
  const needsCoverageCheck =
    LOCATION_REQUIRED_INTENTS.has(effectiveIntent) ||
    effectiveIntent === "route" ||
    isWhatIfQuery;

  if (
    needsCoverageCheck &&
    typeof input.latitude === "number" &&
    typeof input.longitude === "number" &&
    !input.areaId &&
    !input.areaName &&
    !findNearestMarineAreaWithinCoverage({
      latitude: input.latitude,
      longitude: input.longitude,
    })
  ) {
    return buildGateResponse(
      "clarification_needed",
      effectiveIntent,
      gateLanguage,
      OUT_OF_COVERAGE_CLARIFICATION[gateLanguage] ??
        OUT_OF_COVERAGE_CLARIFICATION.en,
      { kind: "location_out_of_coverage", missing: ["location"] }
    );
  }

  /*
   * Nothing in this message matched any known Sagar capability - small
   * talk, a thank-you, an unrelated question, or bare punctuation.
   * Never let that fall through to the pipeline's default marine area,
   * regardless of how much conversation history exists: a stored
   * location or an earlier marine answer is context for Ollama, not a
   * trigger to run marine intelligence again. Without the intent check
   * running unconditionally here (previously this only fired on the
   * very first message of a conversation), a later "bro" after "is it
   * safe near Thoothukudi?" fell straight through into the full agent
   * pipeline below, which always resolves an area and always runs
   * risk/weather for it - producing a confident-looking repeat of the
   * earlier marine answer for a message that was just small talk.
   *
   * Ollama - the same conversational layer used to narrate verified
   * marine facts elsewhere in this file - answers naturally here too,
   * with no marine facts to narrate, just the recent conversation for
   * continuity. The static templates below are only the fallback for
   * when Ollama is unavailable, exactly as they always have been.
   */
  if (effectiveIntent === "general" && !isWhatIfQuery) {
    const recentContext =
      history.length > 0
        ? history
            .slice(-4)
            .map(
              (turn) =>
                `${turn.role === "user" ? "User" : "Sagar"}: ${turn.text}`
            )
            .join("\n")
        : undefined;

    const conversational = isLlmEnabled()
      ? await narrateGeneralReply({
          userMessage: input.message,
          recentContext,
          language: gateLanguage,
        }).catch(() => null)
      : null;

    const reply =
      conversational ??
      (isCasualMessage(input.message)
        ? (CASUAL_REPLY[gateLanguage] ?? CASUAL_REPLY.en)
        : (UNSUPPORTED_REPLY[gateLanguage] ?? UNSUPPORTED_REPLY.en));

    return buildGateResponse("unsupported", "general", gateLanguage, reply);
  }

  // "Find the safest route." with no "from X to Y" and nothing else to
  // go on - ask rather than silently returning whatever the single
  // top-ranked route in the whole dataset happens to be.
  if (
    effectiveIntent === "route" &&
    !parseFromToRoute(input.message) &&
    !mentionedArea
  ) {
    const missing = detectMissingRouteEndpoints(input.message);

    const which =
      missing.length === 2
        ? "both"
        : missing[0] === "origin"
          ? "origin"
          : "destination";

    return buildGateResponse(
      "clarification_needed",
      "route",
      gateLanguage,
      ROUTE_CLARIFICATION[which][gateLanguage] ??
        ROUTE_CLARIFICATION[which].en,
      { kind: "route_endpoints", missing }
    );
  }

  // A location-specific question ("is it safe?", "ocean indicators?")
  // with no area named anywhere and none selected - ask instead of
  // silently defaulting to Thoothukudi Coast.
  if (
    LOCATION_REQUIRED_INTENTS.has(effectiveIntent) &&
    !hasExplicitLocation &&
    !isWhatIfQuery
  ) {
    return buildGateResponse(
      "clarification_needed",
      effectiveIntent,
      gateLanguage,
      LOCATION_CLARIFICATION[gateLanguage] ?? LOCATION_CLARIFICATION.en,
      { kind: "location", missing: ["location"] }
    );
  }

  const areaId = input.areaId;
  const areaName = input.areaName ?? classification?.areaHint ?? mentionedArea?.name;
  // The client rarely sends an explicit language; fall back to what the
  // AI classifier detected from the message itself so the response's
  // `language` field (driving TTS locale on the client) reflects the
  // language actually used, not just a hardcoded default.
  const language = input.language ?? classification?.language;

  const baseRequest = buildAgentRequest({
    message: input.message,
    language,
    areaId,
    areaName,
    latitude: input.latitude,
    longitude: input.longitude,
  });

  if (classification?.intent) {
    baseRequest.parameters = {
      ...baseRequest.parameters,
      // The reconciled intent, not the raw AI label - otherwise the
      // pipeline would still run on the "general" the gate just rejected.
      aiIntentHint: effectiveIntent,
    };
  }

  const pipeline = await runAgentOrchestrator(baseRequest);

  const explicitRoute = resolveExplicitRoute(input.message);

  const extras: ShapeChatResponseExtras = {
    secondaryIntents: classification?.secondaryIntents ?? [],
    resolvedRoute:
      explicitRoute.kind === "resolved"
        ? explicitRoute.route
        : explicitRoute.kind === "unsupported"
          ? null
          : undefined,
  };

  const whatIfDetection = detectWhatIf(input.message);

  if (whatIfDetection || classification?.isWhatIf) {
    const detection =
      whatIfDetection ??
      // AI flagged this as a what-if but couldn't be matched to a
      // specific deterministic kind - default to a wind-increase
      // scenario, the most common case, rather than guessing further.
      { kind: "wind_increase" as const, percent: 20 };

    const area = resolveArea({
      areaId,
      areaName,
      latitude: input.latitude,
      longitude: input.longitude,
    });

    const riskFinding = pipeline.findings.find(
      (finding) =>
        finding.agent === "risk" &&
        finding.data &&
        typeof (finding.data as Record<string, unknown>).riskScore ===
          "number"
    );

    const riskData = riskFinding?.data as
      | { riskScore: number; riskLevel: string }
      | undefined;

    const before = {
      riskScore: riskData?.riskScore ?? area.safety.riskScore,
      riskLevel: riskData?.riskLevel ?? area.safety.overallRisk,
    };

    const scenarioResult = runWhatIf(detection, area.id);
    const description = describeWhatIf(detection);

    extras.whatIf = {
      question: description,
      before,
      after: {
        riskScore: scenarioResult.riskScore,
        riskLevel: scenarioResult.riskLevel,
        operability: scenarioResult.operability,
      },
      impact: `Risk ${
        scenarioResult.riskScore > before.riskScore
          ? "increases"
          : "changes"
      } from ${before.riskScore}/100 (${before.riskLevel}) to ${scenarioResult.riskScore}/100 (${scenarioResult.riskLevel}) if ${description}.`,
      recommendation: scenarioResult.recommendation,
    };
  }

  const shaped = shapeChatResponse(
    pipeline,
    { areaId, areaName, latitude: input.latitude, longitude: input.longitude },
    extras
  );

  const resolvedLanguage = (classification?.language ??
    (shaped.language as ChatLanguage) ??
    "en") as ChatLanguage;

  if (explicitRoute.kind === "unsupported") {
    // An explicit "from X to Y" request where X/Y aren't configured
    // route points - answer honestly instead of falling back to a
    // default area (which would render as a fabricated route). No
    // AI call needed here: nothing to narrate, the facts are just
    // "this isn't available".
    const messageBuilder =
      UNSUPPORTED_LOCATION_MESSAGE[
        resolvedLanguage === "ta" || resolvedLanguage === "hi"
          ? resolvedLanguage
          : "en"
      ];

    shaped.answer = messageBuilder(explicitRoute.from, explicitRoute.to);
    shaped.situation = shaped.answer;
    shaped.recommendation = undefined;
    shaped.riskLevel = undefined;
    shaped.riskScore = undefined;
    shaped.keyFactors = undefined;
    shaped.evidence = undefined;
    shaped.dataSources = undefined;
    shaped.affectedArea = null;

    return shaped;
  }

  // Trigger on the presence of an actually-resolved route, not just a
  // "route" primary intent label: resolveExplicitRoute runs on the raw
  // message text regardless of how the intent classifier labelled it
  // (e.g. "Is the route safe from X to Y?" classifies as "safety" but
  // still names a real route that should drive the answer).
  if (shaped.route) {
    applyRouteAnswer(shaped);
  }

  // Likewise, a real what-if comparison (detected independently via
  // whatIfEngine's own pattern match) should drive the answer whenever
  // it exists, regardless of which primary intent the keyword
  // classifier happened to land on for the rest of the sentence.
  if (shaped.whatIf) {
    applyWhatIfAnswer(shaped);
  } else if (shaped.intent === "pfz") {
    applyZoneAnswer(shaped);
  } else if (shaped.intent === "alerts") {
    applyAlertsAnswer(shaped);
  } else if (shaped.intent === "marine_conditions") {
    applyOceanAnswer(shaped);
  }

  let narrated: string | null = null;

  if (isLlmEnabled()) {
    const routeSummary = shaped.route
      ? `${shaped.route.name}, ${shaped.route.distanceKm.toFixed(1)} km, risk ${shaped.route.risk.score}/100 (${shaped.route.risk.level}), ${shaped.route.routeDecision} - ${shaped.route.reason}`
      : undefined;

    const zonesSummary =
      shaped.zones && shaped.zones.length > 0
        ? shaped.zones
            .slice(0, 3)
            .map((zone) => `${zone.name} (${zone.recommendation})`)
            .join("; ")
        : undefined;

    const alertsSummary =
      shaped.alerts && shaped.alerts.length > 0
        ? shaped.alerts
            .slice(0, 3)
            .map((alert) => `${alert.title} (${alert.severity})`)
            .join("; ")
        : undefined;

    const whatIfSummary = shaped.whatIf
      ? `If ${shaped.whatIf.question}, ${shaped.whatIf.impact} ${shaped.whatIf.recommendation}`
      : undefined;

    // Only the last few turns, and only as conversational reference -
    // every fact the answer may state still comes from the verified
    // fields below.
    const recentContext =
      history.length > 0
        ? history
            .slice(-4)
            .map(
              (turn) =>
                `${turn.role === "user" ? "User" : "Sagar"}: ${turn.text}`
            )
            .join("\n")
        : undefined;

    narrated = await narrateResponse({
      userQuestion: input.message,
      situation: shaped.situation,
      recommendation: shaped.recommendation,
      riskLevel: shaped.riskLevel,
      riskScore: shaped.riskScore,
      keyFactors: shaped.keyFactors,
      areaName: shaped.affectedArea?.name,
      routeSummary,
      zonesSummary,
      alertsSummary,
      whatIfSummary,
      recentContext,
      dataSources: shaped.dataSources,
      language: resolvedLanguage,
    }).catch(() => null);
  }

  if (narrated) {
    shaped.answer = narrated;
  } else {
    // The configured LLM was unavailable (disabled, unreachable,
    // timed out, out of credits, or it returned nothing usable) - the
    // existing deterministic answer is already correct and grounded,
    // but it's only ever composed in English. For Tamil/Hindi, swap
    // in a short template-based answer built from these same facts
    // (no AI call, no new values) so the visible reply actually
    // matches the language the user asked in.
    const localized = buildDeterministicAnswer(resolvedLanguage, {
      intent: shaped.intent,
      areaName: shaped.affectedArea?.name,
      riskLevel: shaped.riskLevel,
      riskScore: shaped.riskScore,
      route: shaped.route,
      zones: shaped.zones,
      alerts: shaped.alerts,
      whatIf: shaped.whatIf,
    });

    if (localized) {
      shaped.answer = localized;
    }
  }

  return shaped;
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = chatInputSchema.parse(req.body);
    const result = await handleChat(input);
    res.json(result);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const input = chatInputSchema.parse({
      message: req.query.message,
      language: req.query.language,
      areaId: req.query.areaId,
      areaName: req.query.areaName,
      latitude: req.query.latitude,
      longitude: req.query.longitude,
    });
    const result = await handleChat(input);
    res.json(result);
  })
);

export default router;
