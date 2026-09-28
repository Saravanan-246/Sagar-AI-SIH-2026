import routesData from "../../data/routes.json";
import fishingZonesData from "../../data/fishingZones.json";
import alertsData from "../../data/alerts.json";
import { getMarineAreas } from "../marine/marineData";
import { stripReasoning } from "../llm/ollamaProvider";
import { detectLanguageWithMetadata } from "./languageDetector";

import type { LanguageContext } from "../../types/chat";

/*
 * The only gate between an LLM's wording and the user. An LLM may
 * rephrase Sagar's computed facts; it may not add, drop or change them.
 * Every check here is deterministic and cheap - when one fails the
 * caller keeps Sagar's own deterministic answer, which is always
 * already correct.
 */

export interface NarrationCheckInput {
  /** Every fact the LLM was given, joined - the only allowed source. */
  factsText: string;
  /** The user's own words - numbers/places they said may be echoed. */
  userText: string;
  riskLevel?: string;
  language: string;
  /** True when facts carried an explicit staleness/estimate caveat. */
  requiresFreshnessCaveat?: boolean;
  /** The request's language decision - the reply must honour it. */
  languageContext?: LanguageContext;
}

export type NarrationCheck = { ok: true } | { ok: false; reason: string };

const MAX_NARRATION_CHARS = 700;

const FILLER_OPENERS =
  /^(?:(?:according to (?:the )?(?:system|data|sagar|available data)|based on (?:the )?(?:available|provided|given) (?:data|facts|information)|as per (?:the )?(?:system|data))[,:]?\s*)/i;

const SPEAKER_LABEL = /^(?:sagar|assistant|ai)\s*:\s*/i;

/** Presentation clean-up only - never changes the words of the answer. */
export function sanitizeNarration(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let text = stripReasoning(raw);
  if (!text) return null;

  text = text
    .replace(SPEAKER_LABEL, "")
    .replace(/^\s*["“'`]+|["”'`]+\s*$/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(FILLER_OPENERS, "");

  if (!text) return null;
  // Capitalise after a stripped opener ("according to the system, the sea…").
  text = text.charAt(0).toUpperCase() + text.slice(1);

  return text;
}

function collectNames(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNames(item, into));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if ((key === "name" || key === "title") && typeof child === "string" && child.length > 3) {
        into.add(child.toLowerCase());
      } else {
        collectNames(child, into);
      }
    }
  }
}

let knownNames: string[] | null = null;

/** Configured areas, routes, zones and alert titles - the named things
 * an LLM could plausibly (and wrongly) swap in. */
function getKnownNames(): string[] {
  if (!knownNames) {
    const names = new Set<string>();
    collectNames(routesData, names);
    collectNames(fishingZonesData, names);
    collectNames(alertsData, names);
    getMarineAreas().forEach((area) => names.add(area.name.toLowerCase()));
    knownNames = [...names];
  }
  return knownNames;
}

const KNOWN_SOURCES = [
  "incois", "imd", "isro", "noaa", "copernicus", "open-meteo", "openmeteo",
  "nasa", "esa", "ecmwf", "coast guard", "fisheries department",
];

/** "2.40" and "2.4" are the same value. */
function canonicalNumber(raw: string): string {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? String(value) : raw;
}

function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d+(?:[.,]\d+)*/g) ?? []).map(canonicalNumber));
}

const RISK_LEVELS = ["low", "moderate", "high", "critical"] as const;

/** Risk level the text explicitly states ("low risk", "risk is high"). */
function statedRiskLevel(text: string): string | null {
  const match =
    text.match(/\b(low|moderate|medium|high|critical)[- ]risk\b/i) ??
    text.match(/\brisk (?:level )?(?:is|looks|remains|stays|of)\s+(?:quite |very |fairly |a )?(low|moderate|medium|high|critical)\b/i);
  if (!match) return null;
  const level = match[1].toLowerCase();
  return level === "medium" ? "moderate" : level;
}

const DISCOURAGE =
  /\b(wouldn'?t (?:head|go|recommend)|don'?t (?:go|head|venture)|do not (?:go|head|proceed|venture)|avoid (?:going|heading|the sea)|not safe|unsafe|too (?:risky|dangerous)|stay (?:ashore|in harbou?r|on shore)|should not go)\b/i;
const ENCOURAGE =
  /\b(safe to (?:go|head|fish|sail)|good to go|fine to (?:go|head)|go ahead|conditions (?:look|are) (?:good|fine|calm|safe))\b/i;

const SCRIPT_PATTERNS = {
  latin: /[A-Za-z]/g,
  ta: /[஀-௿]/g,
  hi: /[ऀ-ॿ]/g,
  te: /[ఀ-౿]/g,
  ml: /[ഀ-ൿ]/g,
  kn: /[ಀ-೿]/g,
} as const;

/** Letters from scripts Sagar never answers in (CJK, Cyrillic, Arabic,
 * Thai...) - a local model occasionally drifts into these. */
const FOREIGN_SCRIPT = /[Ѐ-ӿ؀-ۿ฀-๿぀-ヿ㐀-鿿가-힯]/;

function countScript(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * The reply must stay in the language (and script) the user used. A
 * reply that drifts to English for a Tamil question, or to Tamil
 * script for a Tanglish one, is rejected - the deterministic answer in
 * the right language is used instead.
 */
export function checkReplyLanguage(text: string, context: LanguageContext): NarrationCheck {
  if (FOREIGN_SCRIPT.test(text)) {
    return { ok: false, reason: "unexpected script" };
  }

  const counts = Object.fromEntries(
    Object.entries(SCRIPT_PATTERNS).map(([key, pattern]) => [key, countScript(text, pattern)])
  ) as Record<keyof typeof SCRIPT_PATTERNS, number>;

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total === 0) return { ok: true };

  const { language, style } = context;
  const nativeCount = language === "en" ? 0 : counts[language];
  const otherIndic = total - counts.latin - nativeCount;

  if (otherIndic > 0) {
    return { ok: false, reason: "reply uses another Indian script" };
  }

  if (language === "en") {
    return counts.latin / total >= 0.85
      ? { ok: true }
      : { ok: false, reason: "English question answered in another language" };
  }

  if (style === "native" || style === "mixed") {
    // Technical terms, names and units stay in Latin, so a native-script
    // reply is still mostly - not entirely - in its own script.
    return nativeCount / total >= 0.4
      ? { ok: true }
      : { ok: false, reason: `reply is not in ${language} script` };
  }

  // Romanised styles (Tanglish/Hinglish): Latin letters, but it must
  // still read as that language rather than plain English.
  if (nativeCount / total > 0.2) {
    return { ok: false, reason: "romanised question answered in native script" };
  }

  const detected = detectLanguageWithMetadata(text);
  if (detected.language !== language || !detected.isTransliterated) {
    return { ok: false, reason: `reply does not read as ${style}` };
  }

  // A few Tanglish words up front followed by plain English sentences
  // is still an English answer.
  const englishSentence = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.split(/\s+/).length >= 5)
    .find((sentence) => {
      const meta = detectLanguageWithMetadata(sentence);
      return meta.language === "en" && meta.confidence >= 0.6;
    });

  return englishSentence
    ? { ok: false, reason: `plain English sentence in a ${style} reply` }
    : { ok: true };
}

/**
 * Lightweight consistency check of LLM wording against the facts.
 * Rejects rather than repairs: the deterministic answer is the repair.
 */
export function checkNarration(text: string, input: NarrationCheckInput): NarrationCheck {
  if (!text.trim()) return { ok: false, reason: "empty" };
  if (text.length > MAX_NARRATION_CHARS) return { ok: false, reason: "too long" };
  if (/^[[{]/.test(text.trim())) return { ok: false, reason: "structured output" };
  if (/\b(llm|language model|as an ai|prompt|the facts (?:given|provided))\b/i.test(text)) {
    return { ok: false, reason: "mentions internals" };
  }

  if (input.languageContext) {
    const languageCheck = checkReplyLanguage(text, input.languageContext);
    if (!languageCheck.ok) return languageCheck;
  }

  // A reply cut off by the token limit ends mid-word - in any script.
  if (!/[.!?।॥)"'”’]\s*$/.test(text)) return { ok: false, reason: "incomplete (cut off)" };

  // The screen already shows the score; the prompt forbids restating it.
  if (/\d+\s*\/\s*100\b/.test(text)) return { ok: false, reason: "restates the numeric score" };

  const allowed = `${input.factsText}\n${input.userText}`.toLowerCase();

  const allowedNumbers = numbersIn(allowed);
  for (const value of numbersIn(text)) {
    if (!allowedNumbers.has(value)) {
      return { ok: false, reason: `number ${value} not in facts` };
    }
  }

  const lower = text.toLowerCase();

  for (const name of getKnownNames()) {
    if (lower.includes(name) && !allowed.includes(name)) {
      return { ok: false, reason: `unsupported name "${name}"` };
    }
  }

  for (const source of KNOWN_SOURCES) {
    const pattern = new RegExp(`\\b${source.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}\\b`, "i");
    if (pattern.test(text) && !pattern.test(allowed)) {
      return { ok: false, reason: `unsupported source "${source}"` };
    }
  }

  // Wording checks below are English-only; other languages are guarded
  // by the language-independent checks above.
  if (input.language !== "en") return { ok: true };

  const level = input.riskLevel?.toLowerCase();
  const stated = statedRiskLevel(text);
  if (stated && level && (RISK_LEVELS as readonly string[]).includes(level) && stated !== level) {
    return { ok: false, reason: `risk "${stated}" contradicts "${level}"` };
  }

  if (level === "low" && DISCOURAGE.test(text)) {
    return { ok: false, reason: "discourages a low-risk trip" };
  }
  if ((level === "high" || level === "critical") && ENCOURAGE.test(text) && !DISCOURAGE.test(text)) {
    return { ok: false, reason: `encourages a ${level}-risk trip` };
  }

  // Sagar's facts are current readings; presenting them as a forecast
  // ("waves will be 1.2 m tomorrow") claims something never computed.
  if (
    !/\bforecast/.test(allowed) &&
    /\b(will (?:be|face|have|remain|stay|see|reach|pick up|ease|drop|rise)|(?:is|are) (?:expected|forecast|predicted|likely) to|forecast(?:ed)? to|expected to (?:be|reach)|(?:still )?(?:flagged|in place) (?:for )?tomorrow)\b/i.test(text)
  ) {
    return { ok: false, reason: "presents current readings as a forecast" };
  }

  // "Safe to go tomorrow" from current readings must say it is based on
  // the current picture.
  if (
    !/\bforecast/.test(allowed) &&
    /\btomorrow\b/i.test(text) &&
    !/\b(right now|currently|current|at the moment|as of|latest|today|for now|so far)\b/i.test(text)
  ) {
    return { ok: false, reason: "answers for tomorrow without saying it is based on current conditions" };
  }

  if (!/\balerts?\b/.test(allowed) && /\b(?:active|new|issued) (?:alert|warning)s?\b/i.test(text)) {
    return { ok: false, reason: "invents an alert" };
  }

  if (
    input.requiresFreshnessCaveat &&
    !/\b(latest|last|recent|estimate[sd]?|may|might|could|as of|older|stale|cached|not live|check again|re-?check)\b/i.test(text)
  ) {
    return { ok: false, reason: "drops the freshness caveat" };
  }

  return { ok: true };
}
