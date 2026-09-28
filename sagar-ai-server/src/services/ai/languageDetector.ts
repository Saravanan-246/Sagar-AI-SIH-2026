import type { ChatLanguageStyle, LanguageContext } from "../../types/chat";

export type SupportedLanguage = "en" | "ta" | "te" | "ml" | "kn" | "hi";

export interface LanguageDetectionResult {
  language: SupportedLanguage;
  script: string;
  isTransliterated: boolean;
  isCodeSwitched: boolean;
  confidence: number;
  /** How the languages were mixed - see ChatLanguageStyle. */
  style: ChatLanguageStyle;
}

/*
 * Deterministic, per-message language detection. Runs on the text the
 * user typed or the browser's speech recognizer produced - it never
 * sees audio, so a code-switched sentence ("Chennai la tomorrow weather
 * epdi irukku?") is classified from its words, not its sound.
 *
 * Confidence contract (callers switch language at >= 0.6):
 *   native script ............ 0.90-0.97
 *   transliterated markers ... 0.70-0.90 (more markers -> higher)
 *   clear English sentence ... 0.75
 *   short / ambiguous Latin .. 0.50 (caller keeps the session language)
 *
 * NOTE: sagar-ai-web/src/services/ai/languageDetector.ts mirrors this
 * file for the offline responder - keep the two in step.
 */

const unicodeScripts: Array<{
  language: SupportedLanguage;
  script: string;
  pattern: RegExp;
}> = [
  { language: "ta", script: "Tamil", pattern: /[஀-௿]/g },
  { language: "te", script: "Telugu", pattern: /[ఀ-౿]/g },
  { language: "ml", script: "Malayalam", pattern: /[ഀ-ൿ]/g },
  { language: "kn", script: "Kannada", pattern: /[ಀ-೿]/g },
  { language: "hi", script: "Devanagari", pattern: /[ऀ-ॿ]/g },
];

/*
 * Romanised markers per language. Entries ending in "*" are stems
 * matched as a word prefix, so inflected forms ("kadalukku",
 * "kadalla", "naalaikku") match without listing every suffix. Only
 * words that are not also common English words belong here - one
 * stray English word must never flip the language.
 */
const transliterationMarkers: Record<Exclude<SupportedLanguage, "en">, string[]> = {
  ta: [
    "kadal*", "epdi", "eppadi", "epadi", "yepdi", "irukk*", "iruku", "iruka", "irukum",
    "naalai*", "nalaiki", "nalaikku", "pogal*", "polama", "poga", "ponga",
    "anga", "ange", "angae", "inga", "inge", "ingae", "enga", "yenga",
    "enna", "yenna", "eppo", "ippo", "ipo", "romba", "konjam", "nalla", "illa", "illai",
    "meen*", "veliya", "paadhukaappu", "paathukaappu", "padhukappu",
    "yaanku", "yaanuku", "yenaku", "yenakku", "enaku", "enakku",
    "sollu", "solu", "soluu", "sollunga", "sollungo", "sollungal",
    "ethu", "edhu", "evlo", "evalavu", "paaru", "paarunga", "theriyuma",
    "kaathu", "kaatru", "alai", "mazhai", "vaanilai", "padagu", "vazhi",
    "indha", "intha", "andha", "antha", "inniku", "innaiku", "indru",
    "dhaan", "thaan", "kammi", "jaasthi", "adhigam", "kavanam*", "vendam",
    "venam", "venuma", "podhum", "aana", "mattum", "maadhiri", "maari",
    "pannu*", "panna*", "theriy*", "puriy*", "sariya", "seriya",
    "pesa*", "pesu*", "mudiy*", "kekka*", "kelunga", "badhil", "vanakkam", "nandri",
  ],
  te: [
    "vellavacha", "vellocha", "vellacha", "velladam", "ela", "elaa",
    "akkada", "ikkada", "ekkada", "repu", "undi", "unda", "untundi",
    "emiti", "enti", "cheppu", "cheppandi", "samudram", "chepala", "vatavaranam",
  ],
  hi: [
    "kya", "kaisa", "kaise", "kaisi", "kahan", "wahan", "yahan", "udhar", "idhar",
    "hai", "hain", "mausam", "samundar", "samudra", "batao", "bataiye",
    "sakte", "sakta", "sakti", "jaana", "machli", "aaj", "kal", "kaun", "sabse",
    "nahi", "nahin", "haan", "abhi", "kitna", "kitni", "kyun", "kyon",
    "hawa", "lehar*", "khatra", "khatarnak", "surakshit", "raasta", "rasta",
    "chahiye", "karo", "kijiye", "dikhao", "hoga", "hogi", "raha", "rahi", "mein",
    "namaste", "namaskar", "shukriya", "dhanyavaad", "dhanyawad",
    "bolo", "boliye", "kaho", "kahiye", "kuch", "kuchh", "baat",
  ],
  ml: [
    "engane", "enganeya", "evide", "kadalil", "pokamo", "pokan", "undo",
    "kaalavastha", "meenpidutham", "nallathu",
  ],
  kn: [
    "hege", "hegide", "elli", "hogabahuda", "hogbahuda", "samudra", "meenugarike",
    "naale", "ide", "illi", "alli",
  ],
};

/*
 * Particles that are only a Tamil/Hindi signal alongside a stronger
 * marker ("route safe ah?" alone is still an English sentence; "indha
 * route safe ah iruka?" is Tanglish). Each counts half a marker, so
 * two of them never outweigh a single real word.
 */
const weakMarkers: Partial<Record<Exclude<SupportedLanguage, "en">, string[]>> = {
  ta: ["ah", "aa", "la", "da", "pa", "ma", "nu", "ku"],
  hi: ["ye", "yeh", "wo", "woh", "ho", "na", "to", "ka", "ki", "ke", "se"],
};

/** Common English function/marine words - used only to recognise a
 * clearly-English sentence, never to override a regional marker. */
const englishWords = new Set([
  "a", "an", "the", "is", "it", "to", "can", "i", "we", "you", "me", "my",
  "what", "which", "how", "where", "when", "why", "will", "should", "would",
  "are", "am", "be", "do", "does", "of", "in", "on", "at", "for", "near",
  "there", "here", "this", "that", "and", "or", "any", "go", "going", "out",
  "safe", "safer", "safest", "safety", "weather", "sea", "tomorrow", "today",
  "now", "find", "best", "fishing", "fish", "zone", "zones", "route", "routes",
  "wind", "wave", "waves", "show", "tell", "check", "alert", "alerts",
  "conditions", "condition", "please", "about", "from", "with", "boat",
  "morning", "evening", "tonight", "risk", "current", "good", "changed",
  "since", "last", "decision", "nearby", "area", "risky", "why", "my",
]);

function tokenize(message: string): string[] {
  return message
    .toLowerCase()
    .normalize("NFC")
    .split(/[^a-z\u0080-￿]+/)
    .filter(Boolean);
}

function markerMatches(token: string, marker: string): boolean {
  if (marker.endsWith("*")) {
    return token.startsWith(marker.slice(0, -1));
  }
  return token === marker;
}

function countMarkers(tokens: string[], markers: string[]): number {
  return tokens.filter((token) =>
    markers.some((marker) => markerMatches(token, marker)),
  ).length;
}

function countEnglish(tokens: string[]): number {
  return tokens.filter((token) => englishWords.has(token)).length;
}

/** Latin words of 2+ letters - "GPS", "route", "SST" - in a
 * native-script message make it a code-switched ("mixed") turn. */
function countLatinWords(message: string): number {
  return message.match(/[A-Za-z]{2,}/g)?.length ?? 0;
}

function romanizedStyle(language: SupportedLanguage): ChatLanguageStyle {
  if (language === "ta") return "tanglish";
  if (language === "hi") return "hinglish";
  return "romanized";
}

function detectNativeScript(message: string): LanguageDetectionResult | null {
  let best: { language: SupportedLanguage; script: string; count: number } | null = null;

  for (const item of unicodeScripts) {
    const count = message.match(item.pattern)?.length ?? 0;
    if (count > 0 && (!best || count > best.count)) {
      best = { language: item.language, script: item.script, count };
    }
  }

  if (!best) return null;

  const latinWords = countLatinWords(message);

  return {
    language: best.language,
    script: best.script,
    isTransliterated: false,
    isCodeSwitched: latinWords > 0,
    // Mostly-English sentence with one native word is still clearly
    // that language's speaker, but slightly less certain.
    confidence: latinWords > 0 ? 0.9 : 0.97,
    style: latinWords > 0 ? "mixed" : "native",
  };
}

export function detectLanguageWithMetadata(
  message: string,
): LanguageDetectionResult {
  const native = detectNativeScript(message ?? "");
  if (native) return native;

  const tokens = tokenize(message ?? "");

  let bestLanguage: SupportedLanguage | null = null;
  let bestScore = 0;

  for (const [language, markers] of Object.entries(transliterationMarkers) as Array<
    [Exclude<SupportedLanguage, "en">, string[]]
  >) {
    const strong = countMarkers(tokens, markers);
    // Weak particles only count once a real marker is present.
    const weak = strong > 0 ? countMarkers(tokens, weakMarkers[language] ?? []) * 0.5 : 0;
    const score = strong + weak;
    // Ties keep the earlier entry: Tamil first, as Sagar's primary
    // audience is Tamil Nadu fishermen.
    if (score > bestScore) {
      bestLanguage = language;
      bestScore = score;
    }
  }

  const englishCount = countEnglish(tokens);

  if (bestLanguage) {
    return {
      language: bestLanguage,
      script: "Latin",
      isTransliterated: true,
      isCodeSwitched: englishCount > 0,
      confidence: Math.round(Math.min(0.9, 0.7 + bestScore * 0.05) * 100) / 100,
      style: romanizedStyle(bestLanguage),
    };
  }

  // A full English sentence is a confident English turn; a short or
  // unrecognised fragment ("ok", "Thoothukudi?") is not, so the caller
  // falls back to the session language.
  const isClearEnglish =
    (tokens.length >= 4 && englishCount / tokens.length >= 0.5) ||
    (tokens.length >= 2 && englishCount === tokens.length);

  return {
    language: "en",
    script: "Latin",
    isTransliterated: false,
    isCodeSwitched: false,
    confidence: isClearEnglish ? 0.75 : 0.5,
    style: "native",
  };
}

const LOCALE_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  en: "en-IN",
  ta: "ta-IN",
  te: "te-IN",
  ml: "ml-IN",
  kn: "kn-IN",
  hi: "hi-IN",
};

export function localeForLanguage(language: SupportedLanguage): string {
  return LOCALE_BY_LANGUAGE[language] ?? "en-IN";
}

function scriptOf(meta: LanguageDetectionResult): LanguageContext["script"] {
  if (meta.script === "Latin") return "latin";
  return meta.isCodeSwitched ? "mixed" : "native";
}

function contextFrom(
  meta: LanguageDetectionResult,
  source: LanguageContext["source"],
  language: SupportedLanguage = meta.language,
  style: ChatLanguageStyle = meta.style,
): LanguageContext {
  return {
    language,
    style,
    script: scriptOf(meta),
    confidence: meta.confidence,
    source,
    locale: localeForLanguage(language),
  };
}

/**
 * The one language decision for a request. The language changes per
 * turn only on a confident detection; otherwise the reply follows the
 * conversation (the AI classifier's reading, then the latest clearly
 * detected turn, then any earlier regional turn), then the caller's
 * fallback. A short "ok, tomorrow?" inside a Tanglish conversation
 * therefore stays Tanglish instead of snapping to English.
 */
export function resolveLanguageContext(
  message: string,
  historyTexts: string[],
  fallback: SupportedLanguage = "en",
  classifierLanguage?: SupportedLanguage,
): LanguageContext {
  const current = detectLanguageWithMetadata(message);
  if (current.confidence >= 0.6) return contextFrom(current, "message");

  const currentIsLatin = current.script === "Latin";

  if (classifierLanguage) {
    const style: ChatLanguageStyle =
      classifierLanguage === "en"
        ? "native"
        : currentIsLatin
          ? romanizedStyle(classifierLanguage)
          : current.style;
    return contextFrom(current, "classifier", classifierLanguage, style);
  }

  const history = [...historyTexts]
    .reverse()
    .map((text) => detectLanguageWithMetadata(text));

  const fromHistory =
    history.find((meta) => meta.confidence >= 0.6) ??
    history.find((meta) => meta.language !== "en");

  if (fromHistory) {
    return {
      ...contextFrom(current, "history", fromHistory.language, fromHistory.style),
      confidence: fromHistory.confidence,
    };
  }

  return contextFrom(
    current,
    "fallback",
    fallback,
    fallback === "en" ? "native" : currentIsLatin ? romanizedStyle(fallback) : "native",
  );
}

/** Language-only view of resolveLanguageContext, kept for callers
 * that only need the reply language. */
export function resolveTurnLanguage(
  message: string,
  historyTexts: string[],
  fallback: SupportedLanguage = "en",
  classifierLanguage?: SupportedLanguage,
): SupportedLanguage {
  return resolveLanguageContext(message, historyTexts, fallback, classifierLanguage).language;
}

/**
 * A language decision the client pins for a request it sends on the
 * user's behalf (e.g. a "Why this?" follow-up chip, whose text is
 * English), so the reply stays in the conversation's language.
 */
export function pinnedLanguageContext(
  language: SupportedLanguage,
  style: ChatLanguageStyle = "native",
): LanguageContext {
  const script: LanguageContext["script"] =
    language === "en" || style === "tanglish" || style === "hinglish" || style === "romanized"
      ? "latin"
      : style === "mixed"
        ? "mixed"
        : "native";

  return {
    language,
    style: language === "en" ? "native" : style,
    script,
    confidence: 1,
    source: "client",
    locale: localeForLanguage(language),
  };
}
