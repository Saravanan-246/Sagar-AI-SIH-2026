/*
 * Turns a visible Sagar answer into what should be spoken. Speech may be
 * shorter and differently punctuated than the text, but every number,
 * place, risk level, route and alert it keeps is copied verbatim - units
 * are only spelled out ("2.4 m" -> "2.4 metres"), never converted.
 */

/** Sentences split on terminal punctuation followed by a space or the
 * end - so the "." inside "2.4" never splits a number in two. */
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts: string[] = [];
  let current = "";
  // Walk token by token so decimals and abbreviations stay intact.
  for (const token of normalized.split(" ")) {
    current = current ? `${current} ${token}` : token;
    if (/[.!?।]["')\]]?$/.test(token) && !/^\d+\.$/.test(token)) {
      parts.push(current);
      current = "";
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Markdown, links, tables and screen-only blocks. */
function stripPresentation(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bwww\.\S+/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*(?:sources?|evidence|data sources?|references?)\s*:.*$/gim, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~\n]+)[*_~]{1,3}/g, "$1")
    .replace(/[#*_~|>]+/g, " ");
}

/** Inline screen labels ("Data sources: A, B.") that mean nothing aloud. */
function stripInlineLabels(text: string): string {
  return text
    .replace(/\b(?:Data sources?|Sources?)\s*:[^.]*\.\s*/g, " ")
    .replace(/\b(?:Key factors|Confidence|Situation|Recommendation)\s*:\s*/g, "");
}

/** Spoken pacing: dashes and brackets become commas. */
function speechPunctuation(text: string): string {
  return text
    .replace(/\s+[-–—]\s+/g, ", ")
    .replace(/\s*\(([^)]*)\)/g, ", $1,")
    .replace(/,\s*([.!?।])/g, "$1")
    .replace(/,\s*,/g, ",");
}

/** English unit words. Order matters: compound units first. */
const EN_UNITS: Array<[RegExp, string]> = [
  [/(\d)\s*km\/h\b/gi, "$1 kilometres per hour"],
  [/(\d)\s*kmph\b/gi, "$1 kilometres per hour"],
  [/(\d)\s*m\/s\b/g, "$1 metres per second"],
  [/(\d)\s*mg\/m(?:³|3)\b/g, "$1 milligrams per cubic metre"],
  [/(\d)\s*°\s*C\b/g, "$1 degrees Celsius"],
  [/(\d)\s*km\b/g, "$1 kilometres"],
  [/(\d)\s*(?:NM|nmi)\b/g, "$1 nautical miles"],
  [/(\d)\s*(?:kn|kt|kts)\b/g, "$1 knots"],
  [/(\d)\s*mm\b/g, "$1 millimetres"],
  [/(\d)\s*m\b/g, "$1 metres"],
  [/(\d)\s*hPa\b/g, "$1 hectopascals"],
  [/(\d)\s*%/g, "$1 percent"],
  [/(\d+)\s*\/\s*100\b/g, "$1 out of 100"],
];

function spellUnits(text: string): string {
  return EN_UNITS.reduce((acc, [pattern, words]) => acc.replace(pattern, words), text);
}

/** Full speech-safe rendering of the answer - nothing dropped. */
export function toSpeakableText(text: string, locale = "en-IN"): string {
  let spoken = stripInlineLabels(stripPresentation(text ?? ""));
  spoken = speechPunctuation(spoken);
  if (locale.toLowerCase().startsWith("en")) {
    spoken = spellUnits(spoken);
  }
  return spoken.replace(/\s+/g, " ").replace(/^[,\s]+/, "").trim();
}

/** Anything a listener must not miss - never dropped from speech. */
const SAFETY_CRITICAL =
  /\b(avoid|danger|dangerous|unsafe|not safe|do not|don'?t|warning|alert|cyclone|critical|high risk|blocked|restricted|stay ashore|caution)\b|ஆபத்து|எச்சரிக்கை|வேண்டாம்|खतरा|चेतावनी|मत|न जाएं|ప్రమాదం|హెచ్చరిక/i;

const SPOKEN_CHAR_BUDGET = 360;

/**
 * The spoken version: the speech-safe text, trimmed to the first few
 * sentences when the visible answer is long. The answer always leads,
 * and any safety-critical sentence is kept regardless of the budget.
 */
export function toSpokenSummary(text: string, locale = "en-IN"): string {
  const sentences = splitSentences(toSpeakableText(text, locale));
  const kept: string[] = [];
  let length = 0;

  sentences.forEach((sentence, index) => {
    const fits = index === 0 || length + sentence.length <= SPOKEN_CHAR_BUDGET;
    if (fits || SAFETY_CRITICAL.test(sentence)) {
      kept.push(sentence);
      length += sentence.length + 1;
    }
  });

  return kept.join(" ");
}

/** Numbers as written, for voice/text consistency checks. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map((value) => String(Number(value)));
}
