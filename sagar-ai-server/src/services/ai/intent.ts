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
      "sst",
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
      "wind",
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

function scoreIntent(
  message: string,
  rule: IntentRule,
): number {
  const text = normalized(message);

  let score = 0;

  for (const keyword of rule.keywords) {
    const candidate = normalized(keyword);

    if (text.includes(candidate)) {
      score += candidate.includes(" ")
        ? 3
        : 1;
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