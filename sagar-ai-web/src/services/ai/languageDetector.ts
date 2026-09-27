export type SupportedLanguage = "en" | "ta" | "te" | "ml" | "kn" | "hi";

export interface LanguageDetectionResult {
  language: SupportedLanguage;
  script: string;
  isTransliterated: boolean;
  isCodeSwitched: boolean;
  confidence: number;
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
    "kadal*", "epdi", "eppadi", "epadi", "irukk*", "iruku", "iruka", "irukum",
    "naalai*", "nalaiki", "nalaikku", "pogal*", "polama", "poga", "ponga",
    "anga", "ange", "angae", "inga", "inge", "ingae", "enga", "yenga",
    "enna", "yenna", "eppo", "romba", "konjam", "nalla", "illa", "illai",
    "meen*", "veliya", "paadhukaappu", "paathukaappu", "padhukappu",
    "yaanku", "yaanuku", "yenaku", "yenakku", "enaku", "enakku",
    "sollu", "solu", "soluu", "sollunga", "sollungo", "sollungal",
    "ethu", "edhu", "evlo", "evalavu", "paaru", "paarunga", "theriyuma",
    "kaathu", "kaatru", "alai", "mazhai", "vaanilai", "padagu", "vazhi",
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
  "morning", "evening", "tonight", "risk", "current", "good",
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

function detectNativeScript(message: string): LanguageDetectionResult | null {
  let best: { language: SupportedLanguage; script: string; count: number } | null = null;

  for (const item of unicodeScripts) {
    const count = message.match(item.pattern)?.length ?? 0;
    if (count > 0 && (!best || count > best.count)) {
      best = { language: item.language, script: item.script, count };
    }
  }

  if (!best) return null;

  const hasLatin = /[a-zA-Z]/.test(message);

  return {
    language: best.language,
    script: best.script,
    isTransliterated: false,
    isCodeSwitched: hasLatin,
    // Mostly-English sentence with one native word is still clearly
    // that language's speaker, but slightly less certain.
    confidence: hasLatin ? 0.9 : 0.97,
  };
}

export function detectLanguageWithMetadata(
  message: string,
): LanguageDetectionResult {
  const native = detectNativeScript(message ?? "");
  if (native) return native;

  const tokens = tokenize(message ?? "");

  let bestLanguage: SupportedLanguage | null = null;
  let bestCount = 0;

  for (const [language, markers] of Object.entries(transliterationMarkers) as Array<
    [Exclude<SupportedLanguage, "en">, string[]]
  >) {
    const count = countMarkers(tokens, markers);
    // Ties keep the earlier entry: Tamil first, as Sagar's primary
    // audience is Tamil Nadu fishermen.
    if (count > bestCount) {
      bestLanguage = language;
      bestCount = count;
    }
  }

  const englishCount = countEnglish(tokens);

  if (bestLanguage) {
    return {
      language: bestLanguage,
      script: "Latin",
      isTransliterated: true,
      isCodeSwitched: englishCount > 0,
      confidence: Math.round(Math.min(0.9, 0.7 + bestCount * 0.05) * 100) / 100,
    };
  }

  // A full English sentence is a confident English turn; a short or
  // unrecognised fragment ("ok", "Thoothukudi?") is not, so the caller
  // falls back to the session language.
  const isClearEnglish =
    tokens.length >= 4 && englishCount / tokens.length >= 0.5;

  return {
    language: "en",
    script: "Latin",
    isTransliterated: false,
    isCodeSwitched: false,
    confidence: isClearEnglish ? 0.75 : 0.5,
  };
}
