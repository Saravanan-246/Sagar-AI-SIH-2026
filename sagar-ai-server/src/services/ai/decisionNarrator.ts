import { getLatestDecisionActivity } from "../decisions/decisionStore";

import type { Decision, DecisionState } from "../decisions/decisionStore";
import type { LanguageContext } from "../../types/chat";

/*
 * "What changed since my last decision?" - answered from the decision
 * store's own audit trail (committed route decisions re-checked against
 * each marine data cycle). Deterministic: nothing here is estimated,
 * and no LLM is involved.
 */

type TemplateKey = "en" | "ta" | "ta-latn" | "hi" | "hi-latn";

interface DecisionTemplates {
  none: string;
  latest: (name: string, version: number, when: string) => string;
  state: Record<DecisionState, string>;
  violations: (count: number) => string;
  review: string;
}

const TEMPLATES: Record<TemplateKey, DecisionTemplates> = {
  en: {
    none: "You haven't committed a route decision yet. Commit a route on the Decisions page and Sagar will re-check it against every new marine data cycle.",
    latest: (name, version, when) => `Your latest decision is "${name}" (V${version}), last updated ${when}.`,
    state: {
      valid: "It is still valid against the latest marine data.",
      invalidated: "New marine data invalidated it, and a repair is waiting for your review.",
      "active-with-warning": "It is still active, but with a warning - the latest data breaks its limits.",
    },
    violations: (count) => `${count} limit breach(es) were found.`,
    review: "Open the Decisions page to see the full change history.",
  },
  ta: {
    none: "நீங்கள் இன்னும் எந்த route முடிவையும் சேமிக்கவில்லை. Decisions பக்கத்தில் ஒரு route-ஐ commit செய்தால், ஒவ்வொரு புதிய கடல் தரவுச் சுழற்சியிலும் Sagar அதைச் சரிபார்க்கும்.",
    latest: (name, version, when) => `உங்கள் சமீபத்திய முடிவு "${name}" (V${version}), கடைசியாக ${when} அன்று புதுப்பிக்கப்பட்டது.`,
    state: {
      valid: "சமீபத்திய கடல் தரவின்படி அது இன்னும் செல்லுபடியாகும்.",
      invalidated: "புதிய கடல் தரவு அதைச் செல்லாததாக்கியுள்ளது - ஒரு மாற்று route உங்கள் பரிசீலனைக்குக் காத்திருக்கிறது.",
      "active-with-warning": "அது இன்னும் செயலில் உள்ளது, ஆனால் எச்சரிக்கையுடன் - சமீபத்திய தரவு அதன் வரம்புகளை மீறுகிறது.",
    },
    violations: (count) => `${count} வரம்பு மீறல்(கள்) கண்டறியப்பட்டன.`,
    review: "முழு மாற்ற வரலாற்றுக்கு Decisions பக்கத்தைத் திறக்கவும்.",
  },
  "ta-latn": {
    none: "Neenga innum endha route decision-um commit pannala. Decisions page-la oru route commit panna, ovvoru pudhu marine data cycle-layum Sagar adha check pannum.",
    latest: (name, version, when) => `Ungal latest decision "${name}" (V${version}), kadaisiya ${when} update aachu.`,
    state: {
      valid: "Latest marine data padi adhu innum valid dhaan.",
      invalidated: "Pudhu marine data adha invalid aakiduchu - oru repair ungal review-kku wait pannudhu.",
      "active-with-warning": "Adhu innum active, aana warning-oda - latest data adhoda limits-a thaandudhu.",
    },
    violations: (count) => `${count} limit breach kandupidikkapattadhu.`,
    review: "Full history-kku Decisions page-a paarunga.",
  },
  hi: {
    none: "आपने अभी तक कोई route निर्णय commit नहीं किया है। Decisions पेज पर एक route commit करें, Sagar हर नए समुद्री डेटा चक्र पर उसकी जाँच करेगा।",
    latest: (name, version, when) => `आपका सबसे हाल का निर्णय "${name}" (V${version}) है, आखिरी बदलाव ${when} को हुआ।`,
    state: {
      valid: "नवीनतम समुद्री डेटा के अनुसार यह अभी भी मान्य है।",
      invalidated: "नए समुद्री डेटा ने इसे अमान्य कर दिया है - एक repair आपकी समीक्षा का इंतज़ार कर रहा है।",
      "active-with-warning": "यह अभी भी सक्रिय है, लेकिन चेतावनी के साथ - नवीनतम डेटा इसकी सीमाएँ तोड़ता है।",
    },
    violations: (count) => `${count} सीमा उल्लंघन मिले।`,
    review: "पूरा बदलाव इतिहास देखने के लिए Decisions पेज खोलें।",
  },
  "hi-latn": {
    none: "Aapne abhi tak koi route decision commit nahi kiya hai. Decisions page par ek route commit karo, Sagar har naye marine data cycle par use check karega.",
    latest: (name, version, when) => `Aapka latest decision "${name}" (V${version}) hai, aakhri update ${when} ko hua.`,
    state: {
      valid: "Latest marine data ke hisaab se yeh abhi bhi valid hai.",
      invalidated: "Naye marine data ne ise invalid kar diya hai - ek repair aapke review ka intezaar kar raha hai.",
      "active-with-warning": "Yeh abhi bhi active hai, lekin warning ke saath - latest data iski limits tod raha hai.",
    },
    violations: (count) => `${count} limit breach mile.`,
    review: "Poori history ke liye Decisions page kholo.",
  },
};

function templateKey(context: LanguageContext): TemplateKey {
  const romanised = context.script === "latin" && context.style !== "native";
  if (context.language === "ta") return romanised ? "ta-latn" : "ta";
  if (context.language === "hi") return romanised ? "hi-latn" : "hi";
  return "en";
}

function formatWhen(at: string, context: LanguageContext): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  // Romanised replies keep an English date so the whole line stays in
  // Latin letters.
  const locale = context.script === "latin" ? "en-IN" : context.locale;
  return date.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function activeProblemCount(decision: Decision): number {
  return (decision.pending ?? decision.warning)?.violations.length ?? 0;
}

/** Answer text, plus the name of the decision it describes (if any). */
export function describeDecisionChanges(context: LanguageContext): {
  answer: string;
  decisionName?: string;
  keyFactors?: string[];
} {
  const t = TEMPLATES[templateKey(context)];
  const activity = getLatestDecisionActivity();

  if (!activity) {
    return { answer: t.none };
  }

  const { decision, event } = activity;
  const parts = [
    t.latest(decision.name, decision.activeVersion, formatWhen(event.at, context)),
    t.state[decision.state],
  ];

  const problems = activeProblemCount(decision);
  if (problems > 0 && decision.state !== "valid") {
    parts.push(t.violations(problems));
  }

  parts.push(t.review);

  return {
    answer: parts.join(" "),
    decisionName: decision.name,
    // The audit trail's own wording - shown as supporting detail.
    keyFactors: [event.summary],
  };
}
