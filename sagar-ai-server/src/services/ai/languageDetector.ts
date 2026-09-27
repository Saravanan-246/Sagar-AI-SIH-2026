export type SupportedLanguage = "en" | "ta" | "te" | "ml" | "kn" | "hi";

export interface LanguageDetectionResult {
  language: SupportedLanguage;
  script: string;
  isTransliterated: boolean;
  isCodeSwitched: boolean;
  confidence: number;
}

const unicodePatterns: Array<{
  language: SupportedLanguage;
  script: string;
  pattern: RegExp;
}> = [
  { language: "ta", script: "Tamil", pattern: /[\u0B80-\u0BFF]/ },
  { language: "te", script: "Telugu", pattern: /[\u0C00-\u0C7F]/ },
  { language: "ml", script: "Malayalam", pattern: /[\u0D00-\u0D7F]/ },
  { language: "kn", script: "Kannada", pattern: /[\u0C80-\u0CFF]/ },
  { language: "hi", script: "Devanagari", pattern: /[\u0900-\u097F]/ },
];

const tanglishWords = [
  "kadal", "epdi", "eppadi", "irukku", "iruka",
  "naalaiku", "nalaiki", "pogalama", "polama",
  "anga", "ange", "angae", "inga", "inge", "ingae",
  "enna", "yenna", "eppo", "romba", "konjam",
  "nalla", "illa", "illai", "meen", "meenavar",
  "veliya", "paadhukaappu", "paathukaappu", "padhukappu",
];

const teluguLatinWords = [
  "vellavacha", "ela undi", "akkada", "ikkada", "repu",
];

const hindiLatinWords = [
  "ja sakte", "kahan", "wahan", "yahan", "udhar", "idhar",
];

function hasKeyword(message: string, words: string[]) {
  const text = message.toLowerCase().trim();
  return words.some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$|[?!.,])`, "i").test(text);
  });
}

export function detectLanguageWithMetadata(
  message: string,
): LanguageDetectionResult {
  for (const item of unicodePatterns) {
    if (item.pattern.test(message)) {
      return {
        language: item.language,
        script: item.script,
        isTransliterated: false,
        isCodeSwitched: /[a-zA-Z]/.test(message),
        confidence: 0.97,
      };
    }
  }

  if (hasKeyword(message, tanglishWords)) {
    return {
      language: "ta",
      script: "Latin",
      isTransliterated: true,
      isCodeSwitched: true,
      confidence: 0.80,
    };
  }

  if (hasKeyword(message, teluguLatinWords)) {
    return {
      language: "te",
      script: "Latin",
      isTransliterated: true,
      isCodeSwitched: false,
      confidence: 0.75,
    };
  }

  if (hasKeyword(message, hindiLatinWords)) {
    return {
      language: "hi",
      script: "Latin",
      isTransliterated: true,
      isCodeSwitched: false,
      confidence: 0.75,
    };
  }

  return {
    language: "en",
    script: "Latin",
    isTransliterated: false,
    isCodeSwitched: false,
    confidence: 0.50,
  };
}