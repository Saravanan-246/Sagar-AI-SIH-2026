export type SupportedLanguage =
  | "en"
  | "ta"
  | "te"
  | "ml"
  | "kn"
  | "hi";

export type SagarIntent =
  | "marine_conditions"
  | "safety"
  | "alerts"
  | "pfz"
  | "route"
  | "productivity"
  | "geofence"
  | "tide"
  | "evidence"
  | "general";

export type IntentResult = {
  intent: SagarIntent;
  language: SupportedLanguage;
  confidence: number;
};

type IntentRule = {
  intent: SagarIntent;
  keywords: string[];
};

const rules: IntentRule[] = [
  {
    intent: "safety",
    keywords: [
      "safe",
      "safety",
      "is it safe",
      "can i go",
      "should i go",
      // Everyday "can I head out?" phrasings - previously none matched,
      // so they paid for an AI classification round-trip (~7 s
      // measured) and could come back as ungrounded small talk.
      "go out",
      "go to sea",
      "ok to go",
      "okay to go",
      "fine to go",
      "go fishing",
      "safe to fish",
      "venture",
      "fishing tomorrow",
      "tomorrow morning",
      "danger",
      "risk",
      "பாதுகாப்பு",
      "பாதுகாப்பான",
      "கடலுக்கு செல்ல",
      "நாளை",
      "రేపు",
      "సురక్షితం",
      "సముద్రానికి వెళ్ల",
      "നാളെ",
      "സുരക്ഷിത",
      "കടലിൽ പോക",
      "ನಾಳೆ",
      "ಸುರಕ್ಷಿತ",
      "ಸಮುದ್ರಕ್ಕೆ",
      "कल",
      "सुरक्षित",
      "समुद्र में",
    ],
  },
  {
    intent: "alerts",
    keywords: [
      "alert",
      "alerts",
      "warning",
      "cyclone",
      "lightning",
      "storm",
      "thunder",
      "hazard",
      "weather warning",
      "சூறாவளி",
      "மின்னல்",
      "எச்சரிக்கை",
      "புயல்",
      "తుఫాను",
      "మెరుపు",
      "హెచ్చరిక",
      "കാറ്റ്",
      "മിന്നൽ",
      "മുന്നറിയിപ്പ്",
      "ചുഴലിക്കാറ്റ്",
      "ಚಂಡಮಾರುತ",
      "ಮಿಂಚು",
      "ಎಚ್ಚರಿಕೆ",
      "तूफान",
      "बिजली",
      "चेतावनी",
    ],
  },
  {
    intent: "pfz",
    keywords: [
      "pfz",
      "fishing zone",
      "fishing zones",
      "fish zone",
      "best fishing",
      "fish productivity",
      "where to fish",
      "fishing area",
      "chlorophyll",
      "மீன்பிடி",
      "மீன் பகுதி",
      "மீன்பிடி பகுதி",
      "சிறந்த மீன்பிடி",
      "குளோரோபில்",
      "मछली पकड़ने",
      "मछली क्षेत्र",
      "मछली पकड़ने का क्षेत्र",
      "మత్స్య",
      "చేపల వేట",
      "മത്സ്യബന്ധനം",
      "മത്സ്യ മേഖല",
      "ಮೀನುಗಾರಿಕೆ",
      "ಮೀನುಗಾರಿಕೆ ಪ್ರದೇಶ",
    ],
  },
  {
    intent: "route",
    keywords: [
      "route",
      "routing",
      "navigation",
      "navigate",
      "safest route",
      "safe route",
      "shortest route",
      "alternative route",
      "travel time",
      "eta",
      "path",
      "வழி",
      "பாதை",
      "பாதுகாப்பான பாதை",
      "வழித்தடம்",
      "రూట్",
      "మార్గం",
      "సురక్షిత మార్గం",
      "റൂട്ട്",
      "വഴി",
      "സുരക്ഷിത പാത",
      "ಮಾರ್ಗ",
      "ಸುರಕ್ಷಿತ ಮಾರ್ಗ",
      "रूट",
      "मार्ग",
      "सुरक्षित मार्ग",
      "रास्ता",
      "सुरक्षित रास्ता",
    ],
  },
  {
    intent: "productivity",
    keywords: [
      "productivity",
      "decline",
      "declining",
      "trend",
      "historical",
      "history",
      "increase",
      "decrease",
      "chlorophyll trend",
      "fish productivity",
      "உற்பத்தி",
      "குறைவு",
      "அதிகரிப்பு",
      "போக்கு",
      "చేపల ఉత్పాదకత",
      "తగ్గుదల",
      "పెరుగుదల",
      "ട്രെൻഡ്",
      "ഉൽപ്പാദനക്ഷമത",
      "കുറവ്",
      "വർധന",
      "ಉತ್ಪಾದಕತೆ",
      "ಇಳಿಕೆ",
      "ಹೆಚ್ಚಳ",
      "उत्पादकता",
      "गिरावट",
      "बढ़ोतरी",
      "रुझान",
    ],
  },
  {
    intent: "geofence",
    keywords: [
      "restricted",
      "restriction",
      "boundary",
      "boundaries",
      "protected area",
      "marine protected",
      "no entry",
      "no fishing",
      "avoid zone",
      "geofence",
      "geofencing",
      "சட்டம்",
      "தடை",
      "தடைசெய்யப்பட்ட",
      "பாதுகாப்பு பகுதி",
      "எல்லை",
      "నిషేధిత",
      "సరిహద్దు",
      "రక్షిత ప్రాంతం",
      "పరిధి",
      "നിയന്ത്രണം",
      "നിരോധിത",
      "സംരക്ഷിത മേഖല",
      "അതിർത്തി",
      "ನಿರ್ಬಂಧಿತ",
      "ಗಡಿ",
      "ಸಂರಕ್ಷಿತ ಪ್ರದೇಶ",
      "प्रतिबंधित",
      "सीमा",
      "संरक्षित क्षेत्र",
      "प्रवेश निषेध",
    ],
  },
  {
    intent: "tide",
    keywords: [
      "tide",
      "high tide",
      "low tide",
      "tidal",
      "tide time",
      "tide height",
      "அலை",
      "உயர் அலை",
      "தாழ் அலை",
      "அலை நேரம்",
      "జలప్రవాహం",
      "పెరిగే అల",
      "తగ్గే అల",
      "വേലിയേറ്റം",
      "വേലിയിറക്കം",
      "തിര",
      "ಉಬ್ಬರ",
      "ಇಳಿಜಾರು",
      "ज्वार",
      "उच्च ज्वार",
      "निम्न ज्वार",
    ],
  },
  {
    intent: "marine_conditions",
    keywords: [
      "sea condition",
      "sea conditions",
      "marine conditions",
      "ocean condition",
      "ocean conditions",
      "ocean indicator",
      "ocean indicators",
      "wave",
      "waves",
      "swell",
      "swells",
      "current conditions",
      "conditions",
      // SST is a condition reading ("what is the SST?" -> today's value),
      // not a fishing-zone request.
      "sst",
      "sea temperature",
      "water temperature",
      "temperature",
      // Tamil/Tanglish "sea" typed in Latin script ("kadal eppadi irukku").
      "kadal",
      "wind",
      "weather",
      "forecast",
      // Bare "sea" (no qualifier) - verified live that "How is the sea
      // tomorrow?" otherwise matched no keyword at all and fell through
      // to general conversation instead of a real marine-conditions
      // question. Safe as an exact-word keyword in this narrowly
      // marine/fishing-scoped app (unlike the collapsed/fuzzy paths
      // above, which stay guarded against short candidates).
      "sea",
      "sea state",
      "visibility",
      "rain",
      "weather near",
      "conditions near",
      "கடல் நிலை",
      "கடல் நிலைமை",
      "அலை உயரம்",
      "காற்று",
      "தெரியும்",
      "సముద్ర పరిస్థితులు",
      "అలలు",
      "గాలి",
      "దృశ్యమానత",
      "കടൽ അവസ്ഥ",
      "തിരമാല",
      "കാറ്റ്",
      "ദൃശ്യപരത",
      "ಸಮುದ್ರದ ಸ್ಥಿತಿ",
      "ಅಲೆ",
      "ಗಾಳಿ",
      "दृश्यता",
      "समुद्र की स्थिति",
      "लहर",
      "हवा",
    ],
  },
  {
    intent: "evidence",
    keywords: [
      "what data",
      "what data are you using",
      "what sources",
      "which sources",
      "why is this",
      "why this area",
      "why is this risky",
      "why is this area risky",
      "show me the evidence",
      "show the evidence",
      "the evidence",
      "how did you decide",
      "how do you know",
      "what evidence",
      "which data",
      "data sources",
      "where is this",
      "which area is this",
      "which location",
      "ஏன் இது",
      "என்ன தரவு",
      "ஆதாரம் காட்டு",
      "எந்த பகுதி இது",
      "क्यों ऐसा",
      "क्या डेटा",
      "सबूत दिखाओ",
      "यह कहाँ है",
    ],
  },
];

const languagePatterns: Array<{
  language: SupportedLanguage;
  pattern: RegExp;
}> = [
  {
    language: "ta",
    pattern: /[\u0B80-\u0BFF]/,
  },
  {
    language: "te",
    pattern: /[\u0C00-\u0C7F]/,
  },
  {
    language: "ml",
    pattern: /[\u0D00-\u0D7F]/,
  },
  {
    language: "kn",
    pattern: /[\u0C80-\u0CFF]/,
  },
  {
    language: "hi",
    pattern: /[\u0900-\u097F]/,
  },
];

const normalized = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();

/** Strips the punctuation a phone keyboard/autocomplete routinely adds
 * around a word ("safe?", "tomorrow!!!", "weather....") without
 * touching internal characters - never used for phrase keywords, only
 * per-word comparisons, so it can't accidentally merge two words. */
const stripPunctuation = (value: string) =>
  value.replace(/[.,!?;:"'`()[\]{}]+/g, "");

/**
 * Collapses any run of 2+ identical characters down to one
 * ("weatherrr" -> "weather", "hellooo" -> "helo", "fisshing" ->
 * "fishing") - applied identically to BOTH the message and the keyword
 * before comparing, so a keyword with a genuine double letter (e.g. a
 * hypothetical "chlorophyll") still matches correctly against itself
 * post-collapse. This targets emphatic/typo character repetition
 * specifically (a distinct, very common typing pattern) rather than
 * relying on edit-distance budgets that would otherwise have to grow
 * without bound to tolerate "tomorrowwwww". Works for whole phrases
 * too, since spaces are left untouched.
 */
const collapseRepeats = (value: string) =>
  value.replace(/(.)\1+/g, "$1");

function detectLanguage(
  message: string,
): SupportedLanguage {
  for (const item of languagePatterns) {
    if (item.pattern.test(message)) {
      return item.language;
    }
  }

  return "en";
}

/**
 * Plain Levenshtein edit distance, used only to tolerate a real typo in
 * an otherwise-recognizable single word (see fuzzyWordMatches below) -
 * fishermen typing on a phone routinely drop/swap a letter ("wether",
 * "fshing", "condisn"), and the exact-substring matching above would
 * otherwise misroute the whole message to "general".
 */
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = new Array(rows * cols);

  for (let i = 0; i < rows; i += 1) dp[i * cols] = i;
  for (let j = 0; j < cols; j += 1) dp[j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      dp[i * cols + j] = Math.min(
        dp[(i - 1) * cols + j] + 1,
        dp[i * cols + (j - 1)] + 1,
        dp[(i - 1) * cols + (j - 1)] + cost,
      );
    }
  }

  return dp[rows * cols - 1];
}

/**
 * Whether `word` is a plausible typo of `keyword` - deliberately
 * conservative: only single, real words (never a multi-word phrase,
 * which would risk matching on a fragment of an unrelated sentence),
 * a minimum length so short words like "sst" or "eta" never fuzz-match
 * something unrelated, and a distance budget that grows slowly with
 * word length so a short word still needs a near-exact match.
 */
function fuzzyWordMatches(word: string, keyword: string): boolean {
  if (keyword.includes(" ") || keyword.length < 5) {
    return false;
  }

  if (Math.abs(word.length - keyword.length) > 2) {
    return false;
  }

  const maxDistance = keyword.length <= 6 ? 1 : 2;

  return levenshteinDistance(word, keyword) <= maxDistance;
}

function scoreIntent(
  message: string,
  rule: IntentRule,
): number {
  const text = normalized(message);
  const words = text
    .split(" ")
    .map(stripPunctuation)
    .filter(Boolean);

  const collapsedText = collapseRepeats(text);

  let score = 0;

  for (const keyword of rule.keywords) {
    const candidate = normalized(keyword);
    const isPhrase = candidate.includes(" ");

    if (text.includes(candidate)) {
      score += isPhrase ? 3 : 1;
      continue;
    }

    // Emphatic/typo character repetition ("weatherrr", "sea
    // conditiontodayyy") - collapsed identically on both sides, so a
    // legitimate double letter in the keyword itself still lines up.
    // Guarded to real-length keywords only: collapsing a short
    // technical abbreviation like "sst" or "pfz" down to 1-2 chars
    // ("st") would turn it into a near-universal substring that
    // matches almost any message by accident. A short keyword never
    // needs this anyway - a repeated-letter typo of it ("windddd")
    // already contains the real keyword as a literal prefix, so the
    // plain substring check above already covers it.
    if (
      candidate.length >= 5 &&
      collapsedText.includes(collapseRepeats(candidate))
    ) {
      score += isPhrase ? 3 : 1;
      continue;
    }

    if (
      !isPhrase &&
      words.some((word) => fuzzyWordMatches(word, candidate))
    ) {
      score += 1;
    }
  }

  return score;
}

function detectIntent(
  message: string,
): {
  intent: SagarIntent;
  confidence: number;
} {
  const scores = rules
    .map((rule) => ({
      intent: rule.intent,
      score: scoreIntent(message, rule),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scores[0];

  if (!best || best.score === 0) {
    return {
      intent: "general",
      confidence: 0.35,
    };
  }

  const confidence = Math.min(
    0.98,
    0.5 + best.score * 0.08,
  );

  return {
    intent: best.intent,
    confidence,
  };
}

export function analyzeIntent(
  message: string,
): IntentResult {
  const language = detectLanguage(
    message,
  );

  const detected = detectIntent(
    message,
  );

  return {
    intent: detected.intent,
    language,
    confidence: detected.confidence,
  };
}

export function detectQueryLanguage(
  message: string,
): SupportedLanguage {
  return detectLanguage(message);
}

export function detectQueryIntent(
  message: string,
): SagarIntent {
  return detectIntent(message).intent;
}