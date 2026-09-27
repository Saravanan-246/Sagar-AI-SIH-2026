import routesData from "../../data/routes.json";
import fishingZonesData from "../../data/fishingZones.json";
import alertsData from "../../data/alerts.json";
import { getMarineAreas } from "../marine/marineData";
import { stripReasoning } from "../llm/ollamaProvider";

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
