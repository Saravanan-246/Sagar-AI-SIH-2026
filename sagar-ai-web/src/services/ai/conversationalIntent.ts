import type { ChatLanguage, ChatLanguageStyle, LanguageContext } from "../../types/chat";

/*
 * Fast, deterministic routing for messages that need no marine data at
 * all - greetings, thanks, goodbyes, "what can you do?" and language
 * capability questions ("Can you speak Tamil?", "தமிழில் பேச
 * முடியுமா?", "हिंदी समझते हो?"). The chat route answers these before
 * any LLM classification, area resolution or agent run, so they reply
 * in milliseconds instead of waiting on the marine pipeline.
 *
 * Only structural patterns are matched (a language name plus a
 * speak/understand verb, a meta question about Sagar itself, a message
 * made only of greeting/thanks words). A message that also names a
 * marine topic ("tell me the sea condition in Tamil") is never taken
 * here - it goes through the full pipeline.
 *
 * NOTE: mirrors sagar-ai-server/src/services/ai/conversationalIntent.ts -
 * used client-side for offline replies and so the thinking indicator
 * never shows marine pipeline steps for these messages. Keep the two in
 * step.
 */

export type ConversationalIntent =
  | "greeting"
  | "thanks"
  | "farewell"
  | "help"
  | "language_capability"
  | "language_generation";

export const CONVERSATIONAL_INTENTS: readonly ConversationalIntent[] = [
  "greeting",
  "thanks",
  "farewell",
  "help",
  "language_capability",
  "language_generation",
];

/** A language the user asked about, with the style when they named
 * Tanglish/Hinglish. */
export interface LanguageTarget {
  language: ChatLanguage;
  style: ChatLanguageStyle;
}

export interface ConversationalMatch {
  intent: ConversationalIntent;
  /** language_capability: the language(s) asked about - empty means
   * "which languages do you speak?". language_generation: the one
   * language to say something in. */
  targets: LanguageTarget[];
  /** The user called Sagar "bro" - a casual reply may say it back. */
  casual?: boolean;
}

function normalize(message: string): string {
  return message
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.,!?;:'"`()[\]{}…।॥]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Marine topics: their presence always means "use the pipeline" ----

const MARINE_TOPIC =
  /\b(sea|ocean|weather|wind|winds|wave|waves|tide|tides|route|routes|fishing|fish|zone|zones|pfz|alert|alerts|warning|cyclone|storm|risk|risky|safe|safety|boat|sst|temperature|condition|conditions|forecast|hazard|kadal|samundar|samudra|mausam|hawa|machli|alai|vaanilai|meen)\b|கடல்|வானிலை|காற்று|அலை|மீன்|எச்சரிக்கை|பாதை|வழி|புயல்|ஆபத்|समुद्र|मौसम|हवा|लहर|मछली|चेतावनी|तूफान|रूट|मार्ग|खतर|जोखिम/;

// ---- Language capability ------------------------------------------------

const LANGUAGE_NAMES: Array<[RegExp, LanguageTarget]> = [
  [/\btanglish\b/, { language: "ta", style: "tanglish" }],
  [/\bhinglish\b/, { language: "hi", style: "hinglish" }],
  [/\b(tamil|tamizh|thamizh|thamil)\b|தமிழ|तमिल/, { language: "ta", style: "native" }],
  [/\b(hindi|hindhi)\b|हि(ं|न्)दी|(இ|ஹி)ந்தி/, { language: "hi", style: "native" }],
  [/\b(english|angrezi|angreji)\b|ஆங்கில|इंग्लिश|अंग्रे(ज़|ज)ी/, { language: "en", style: "native" }],
  [/\btelugu\b|తెలుగు|தெலுங்கு|तेलुगु/, { language: "te", style: "native" }],
  [/\bmalayalam\b|മലയാളം|மலையாள|मलयालम/, { language: "ml", style: "native" }],
  [/\bkannada\b|ಕನ್ನಡ|கன்னட|कन्नड़/, { language: "kn", style: "native" }],
];

// "speak / understand / reply" in the languages Sagar is asked in,
// including romanised Tamil/Hindi stems.
const CAPABILITY_VERB =
  /\b(speak|speaks|talk|talking|understand|understands|support|supports|know|knows|reply|respond|answer|chat|converse|communicate|use)\b|\b(pesa|pesu|pesuv|pesala|theriy|puriy|mudiy|bol|bolte|bolti|baat|samajh|samjh|aati|aata)|பேச|பேசு|தெரி|புரி|முடியு|பதில்|बात|बोल|समझ|आती|आता|जवाब|सकते|सकती/;

const LANGUAGES_QUESTION =
  /\b(which|what) languages?\b|\blanguages? (do|can) you\b|எந்த மொழி|என்ன மொழி|कौन सी भाषा|कौनसी भाषा|किन भाषाओं|\b(kaun si|kaunsi) bhasha|\benna (mozhi|language)|\bentha (mozhi|language)/;

// "Tamil Nadu" is a place, not a request about the Tamil language.
const PLACE_NAMES = /\b(tamil ?nadu|tamizh ?nadu)\b|தமிழ் ?நாடு|तमिल ?नाडु/g;

function languageTargets(rawText: string): LanguageTarget[] {
  const text = rawText.replace(PLACE_NAMES, " ");
  const targets: LanguageTarget[] = [];
  for (const [pattern, target] of LANGUAGE_NAMES) {
    if (!pattern.test(text)) continue;
    // "Tanglish" is listed first, so a message naming both Tanglish and
    // Tamil keeps the more specific Tanglish target.
    if (targets.some((item) => item.language === target.language)) continue;
    targets.push(target);
  }
  return targets;
}

// ---- Language generation ("say something in Tamil") --------------------

/*
 * Asking Sagar to actually produce the language, not asking whether it
 * can. Imperative "produce" verbs, matched as whole words so "பேசு"
 * (speak!) never matches "பேசுவீங்களா" (will you speak?).
 */
const GENERATION_VERBS = new Set([
  // English
  "say", "speak", "talk", "write", "give", "tell",
  // Tamil (romanised and script)
  "sollu", "sollunga", "sollungal", "sol", "pesu", "pesunga", "pesungal", "ezhuthu",
  "சொல்லு", "சொல்லுங்க", "சொல்லுங்கள்", "சொல்", "பேசு", "பேசுங்க", "பேசுங்கள்", "எழுது",
  // Hindi (romanised and script)
  "bolo", "boliye", "kaho", "kahiye", "karo", "kijiye", "likho", "sunao",
  "बोलो", "बोलिए", "कहो", "कहिए", "करो", "कीजिए", "लिखो", "सुनाओ",
]);

// English verbs that only mean "produce some text" with an object
// ("tell me something in Tamil", not "tell me the time").
const OBJECT_ONLY_VERBS = new Set(["write", "give", "tell"]);

// "something / a sentence / a few words" - the thing to be produced.
const GENERATION_OBJECT =
  /\b(something|anything|sentence|sentences|line|lines|words?|phrase|greeting|edhavadhu|ethavathu|edhachum|ethachum|edhavathu|oru|kuch|kuchh|ek|vakyam|vaakiyam)\b|ஏதாவது|ஏதேனும்|வாக்கியம்|ஒரு|வரி|कुछ|एक|वाक्य|लाइन/;

// Asking about ability ("can you / do you / முடியுமா / सकते") rather
// than asking for text.
const ABILITY_QUESTION =
  /\b(can|could|do|does|are|will|would) (you|u|sagar)\b|\bable to\b|\b(mudiyuma|mudiyum|theriyuma|theriyum|puriyuma|puriyum|sakte|sakta|sakti|aati|aata|samajh|samjh)\b|முடியுமா|முடியும்|தெரியுமா|தெரியும்|புரியுமா|புரியும்|ங்களா|सकते|सकती|सकता|आती|आता|समझ/;

function isGenerationRequest(text: string, tokens: string[]): boolean {
  // "tell me about ..." asks for information, not a sample of language.
  if (/\babout\b/.test(text)) return false;

  const hasObject = GENERATION_OBJECT.test(text);
  const hasVerb = tokens.some(
    (token) => GENERATION_VERBS.has(token) && (hasObject || !OBJECT_ONLY_VERBS.has(token))
  );

  // "Can you say something in Tamil?" asks for text; "Can you speak
  // Tamil?" asks about ability.
  return hasVerb && (hasObject || !ABILITY_QUESTION.test(text));
}

// ---- Help / meta questions about Sagar ------------------------------------

// Questions about how to ask Sagar things may name a marine topic
// ("how do I ask you about marine conditions?").
const HELP_ABOUT_ASKING =
  /\bwhat (can|should) i ask\b|\bhow (do|can|should) i ask\b|\bhow to ask\b|எப்படி கேட்க|कैसे पूछ|\bkaise (puchh|pooch)|\bepdi kekka/;

// Other meta questions about Sagar itself - only without a marine topic,
// so "how can I use the safest route?" stays a route question.
const HELP_META =
  /^(what|how) (can|could|do|should) (you|sagar) (do|help)\b|\bwhat (can|could) (you|sagar) (do|help)|\bhow (do|can|should) i (use|talk to)\b|\bhow to use\b|^who are you\b|^what are you\b|^what is sagar\b|\bwhat do you do\b|என்ன (செய்ய|உதவ) முடியும்|எப்படி பயன்படுத்த|நீ(ங்கள்|ங்க)? யார்|आप क्या (कर|मदद कर) सकते|कैसे (पूछ|इस्तेमाल)|आप कौन|\benna (panna|seiya|help pann?a) mudiyum|\b(nee|neenga) yaar|\bkya (kar|madad kar) sakte|\baap kaun\b|\bkaise (puchh|pooch|use)/;

// Bare "help" requests - only when no marine topic is named, otherwise
// "help me find a safe route" is a route question.
const HELP_BARE = /^(help|help me|help please|please help)$|^(உதவி|உதவுங்கள்|मदद|मदद करो|मदद कीजिए|madad|madad karo)$/;

// ---- Greeting / thanks / farewell (whole message) --------------------------

const FILLER = new Set([
  "sagar", "bro", "anna", "akka", "sir", "ji", "there", "all", "so", "much",
  "a", "lot", "very", "romba", "mikka", "bahut", "bohot", "you", "again",
  "dear", "friend", "machi", "da", "pa", "ma",
]);

const GREETING_WORDS = new Set([
  "hi", "hii", "hiii", "hello", "helo", "hey", "heyy", "vanakkam", "namaste",
  "namaskar", "namaskaram", "வணக்கம்", "नमस्ते", "नमस्कार", "good", "morning",
  "afternoon", "evening",
]);
const GREETING_KEYS = new Set([
  "hi", "hii", "hiii", "hello", "helo", "hey", "heyy", "vanakkam", "namaste",
  "namaskar", "namaskaram", "வணக்கம்", "नमस्ते", "नमस्कार", "morning",
  "afternoon", "evening",
]);

const THANKS_WORDS = new Set([
  "thanks", "thank", "thx", "ty", "nandri", "dhanyavaad", "dhanyawad",
  "dhanyavad", "shukriya", "நன்றி", "धन्यवाद", "शुक्रिया",
]);

const FAREWELL_WORDS = new Set([
  "bye", "goodbye", "see", "later", "alvida", "poitu", "varen", "varein",
  "அலவிடா", "अलविदा", "போய்", "வருகிறேன்", "வரேன்", "tata", "good", "night",
]);
const FAREWELL_KEYS = new Set([
  "bye", "goodbye", "later", "alvida", "poitu", "அலவிடா", "अलविदा", "போய்",
  "tata", "night",
]);

function isMadeOf(tokens: string[], words: Set<string>, keys: Set<string>): boolean {
  return (
    tokens.length > 0 &&
    tokens.length <= 6 &&
    tokens.some((token) => keys.has(token)) &&
    tokens.every((token) => words.has(token) || FILLER.has(token))
  );
}

/**
 * Deterministic conversational intent, or null when the message needs
 * Sagar's marine intelligence (or an LLM to understand it).
 */
export function detectConversationalIntent(message: string): ConversationalMatch | null {
  const text = normalize(message ?? "");
  if (!text) return null;

  const tokens = text.split(" ");
  const hasMarineTopic = MARINE_TOPIC.test(text);

  if (!hasMarineTopic) {
    if (isMadeOf(tokens, THANKS_WORDS, THANKS_WORDS)) return { intent: "thanks", targets: [] };
    if (isMadeOf(tokens, FAREWELL_WORDS, FAREWELL_KEYS)) return { intent: "farewell", targets: [] };
    if (isMadeOf(tokens, GREETING_WORDS, GREETING_KEYS)) return { intent: "greeting", targets: [] };
  }

  const wordCount = tokens.length;

  if (!hasMarineTopic && wordCount <= 12) {
    const targets = languageTargets(text);
    // Checked before capability: "tamil la pesu" (speak Tamil!) wants
    // Tamil text, "Tamil la pesa mudiyuma?" asks whether Sagar can.
    if (targets.length === 1 && isGenerationRequest(text, tokens)) {
      return {
        intent: "language_generation",
        targets,
        casual: tokens.some((token) => token === "bro" || token === "machi"),
      };
    }
    if (targets.length > 0 && CAPABILITY_VERB.test(text)) {
      return { intent: "language_capability", targets };
    }
    if (LANGUAGES_QUESTION.test(text)) {
      return { intent: "language_capability", targets: [] };
    }
  }

  if (wordCount <= 14 && HELP_ABOUT_ASKING.test(text)) return { intent: "help", targets: [] };
  if (!hasMarineTopic && wordCount <= 14 && HELP_META.test(text)) return { intent: "help", targets: [] };
  if (!hasMarineTopic && HELP_BARE.test(text)) return { intent: "help", targets: [] };

  return null;
}

/**
 * The language a marine question asks to be answered in - "tell me the
 * sea condition in Tamil", "tamil la route safe ah?", "தமிழில்
 * சொல்லுங்கள்". Only explicit "in <language>" phrasings count. Asking
 * the Tanglish/Hinglish way ("tamil la", "hindi mein") gets a
 * Tanglish/Hinglish answer; "in Tamil" gets Tamil script.
 */
export function requestedReplyLanguage(message: string): LanguageTarget | null {
  const text = normalize(message ?? "");

  const english = text.match(/\b(?:in|into) (tamil|tamizh|thamizh|hindi|english|tanglish|hinglish)\b/);
  if (english) return languageTargets(english[0])[0] ?? null;

  const romanised = text.match(/\b(tamil|tamizh|thamizh|hindi|english|tanglish|hinglish)[- ]?(?:la|le|lae|mein|me|mai)\b/);
  if (romanised) {
    const target = languageTargets(romanised[0])[0];
    if (target?.language === "ta") return { language: "ta", style: "tanglish" };
    if (target?.language === "hi") return { language: "hi", style: "hinglish" };
    return target ?? null;
  }

  const native = text.match(/(தமிழில்|தமிழ்ல|ஆங்கிலத்தில்|இந்தியில்|हिंदी में|हिन्दी में|तमिल में|अंग्रेज़ी में|अंग्रेजी में|इंग्लिश में)/);
  return native ? (languageTargets(native[0])[0] ?? null) : null;
}

// ---- Decision status ---------------------------------------------------------

// "What changed since my last decision?" - answered from the decision
// store by the chat route, also without the marine pipeline.
const DECISION_WORD = /\bdecisions?\b|\bmudivu|\bfaisl|\bnirnay|முடிவ|फ़ैसल|फैसल|निर्णय/i;
const CHANGE_OR_STATUS_WORD =
  /\b(chang|updat|status|valid|still|last|latest|my|since|maatr|badal|pichl|aakhri)|மாற்ற|கடைசி|என்|बदल|पिछल|आखिरी|मेरे|मेरा|स्थिति/i;

export function isDecisionChangeQuestion(message: string): boolean {
  return DECISION_WORD.test(message) && CHANGE_OR_STATUS_WORD.test(message);
}

// ---- Replies ------------------------------------------------------------------

type ReplyKey = "en" | "ta" | "ta-latn" | "hi" | "hi-latn";
type TargetKey = ChatLanguage | "tanglish" | "hinglish";

interface ReplyTemplates {
  greeting: string;
  thanks: string;
  farewell: string;
  help: string;
  languagesList: string;
  /** "Yes, I can speak <the language you are writing in>." */
  yesSame: string;
  /** "Yes, ask in X and I'll reply in X." */
  yesOther: (loc: string) => string;
  /** Languages Sagar understands but mostly answers in English. */
  limited: (name: string) => string;
  /** Short natural lines *in this language* for "say something in X".
   * "{bro}" becomes " bro" when the user was casual. */
  samples: string[];
  /** "Say something in Telugu" - understood, but not written reliably. */
  limitedGeneration: (name: string) => string;
  names: Record<TargetKey, string>;
  /** "in Tamil" in this reply language's grammar. */
  locative: Record<TargetKey, string>;
}

const ENGLISH_NAMES: Record<TargetKey, string> = {
  en: "English",
  ta: "Tamil",
  hi: "Hindi",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  tanglish: "Tanglish",
  hinglish: "Hinglish",
};

function mapNames(format: (name: string) => string): Record<TargetKey, string> {
  return Object.fromEntries(
    Object.entries(ENGLISH_NAMES).map(([key, name]) => [key, format(name)])
  ) as Record<TargetKey, string>;
}

const REPLIES: Record<ReplyKey, ReplyTemplates> = {
  en: {
    greeting: "Hello - I'm Sagar. Ask me about the sea, weather, alerts, fishing zones or your route.",
    thanks: "You're welcome. Ask me anytime - stay safe at sea.",
    farewell: "Goodbye - stay safe at sea.",
    help: 'I\'m Sagar, a marine safety assistant. Ask me about sea conditions, weather, alerts, fishing zones, route safety, what-if scenarios or why an area is risky - for example "How is the sea today?" or "Is my route safe?". You can type or speak in English, Tamil, Hindi, Tanglish or Hinglish.',
    languagesList:
      "I understand English, Tamil, Hindi, Tanglish and Hinglish. Type or speak in any of them and I'll reply the same way.",
    yesSame: "Yes - I'm answering you in English. You can also switch to Tamil, Hindi, Tanglish or Hinglish at any time.",
    yesOther: (loc) => `Yes - you can talk to Sagar ${loc}. Ask ${loc}, by typing or by voice, and I'll reply ${loc}.`,
    limited: (name) =>
      `I can understand ${name}, but my answers in ${name} are limited for now, so I may reply in English. Tamil, Hindi, Tanglish and Hinglish are fully supported.`,
    samples: [
      "Hello{bro}! I'm Sagar. It's nice to talk with you - how is your day going?",
      "Hello{bro}! Good to hear from you. Before you head out to sea, ask me anything - and stay safe.",
      "Have a good day{bro}! Ask me about the sea, the weather or fishing zones any time.",
    ],
    limitedGeneration: (name) =>
      `I understand ${name}, but I can't write ${name} reliably yet - I can answer in English, Tamil or Hindi.`,
    names: ENGLISH_NAMES,
    locative: mapNames((name) => `in ${name}`),
  },
  ta: {
    greeting:
      "வணக்கம் - நான் Sagar. கடல், வானிலை, எச்சரிக்கைகள், மீன்பிடி பகுதிகள் அல்லது உங்கள் route பற்றி கேளுங்கள்.",
    thanks: "மகிழ்ச்சி! எப்போது வேண்டுமானாலும் கேளுங்கள் - கடலில் பாதுகாப்பாக இருங்கள்.",
    farewell: "சென்று வாருங்கள் - கடலில் பாதுகாப்பாக இருங்கள்.",
    help: 'நான் Sagar, கடல் பாதுகாப்பு உதவியாளர். கடல் நிலை, வானிலை, எச்சரிக்கைகள், மீன்பிடி பகுதிகள், route பாதுகாப்பு, what-if சூழ்நிலைகள் பற்றி கேளுங்கள் - உதாரணமாக "இன்று கடல் நிலைமை எப்படி இருக்கு?". தமிழ், ஆங்கிலம், இந்தி அல்லது Tanglish-இல் தட்டச்சு செய்யலாம் அல்லது பேசலாம்.',
    languagesList:
      "எனக்கு தமிழ், ஆங்கிலம், இந்தி, Tanglish, Hinglish புரியும். இவற்றில் எதில் கேட்டாலும், அதே மொழியில் பதில் சொல்வேன்.",
    yesSame: "ஆம், நான் தமிழில் பேச முடியும். நீங்கள் தமிழிலேயே கேட்கலாம் - தட்டச்சு செய்தோ குரலிலோ.",
    yesOther: (loc) => `ஆம், Sagar-இடம் ${loc} பேசலாம். நீங்கள் ${loc} கேட்டால், நான் ${loc} பதில் சொல்வேன்.`,
    limited: (name) =>
      `எனக்கு ${name} புரியும், ஆனால் ${name} பதில்கள் இப்போது குறைவு - ஆங்கிலத்தில் பதில் வரலாம். தமிழ், இந்தி, Tanglish முழுமையாக ஆதரிக்கப்படுகின்றன.`,
    samples: [
      "வணக்கம்! நான் Sagar, உங்கள் கடல் பாதுகாப்பு உதவியாளர். இன்று எப்படி இருக்கிறீர்கள்?",
      "வணக்கம்! தமிழில் பேசுவது எனக்கு மகிழ்ச்சி. கடலுக்குச் செல்லும் முன் என்னிடம் கேளுங்கள் - பாதுகாப்பாகச் சென்று வாருங்கள்.",
      "உங்கள் நாள் இனிதாக அமையட்டும்! கடல் நிலை, வானிலை, மீன்பிடி பகுதிகள் - எதைப் பற்றியும் தமிழிலேயே கேட்கலாம்.",
    ],
    limitedGeneration: (name) =>
      `எனக்கு ${name} புரியும், ஆனால் ${name}-இல் இன்னும் நம்பகமாக எழுத முடியாது - தமிழ், ஆங்கிலம் அல்லது இந்தியில் பதில் சொல்ல முடியும்.`,
    names: {
      en: "ஆங்கிலம்",
      ta: "தமிழ்",
      hi: "இந்தி",
      te: "தெலுங்கு",
      ml: "மலையாளம்",
      kn: "கன்னடம்",
      tanglish: "Tanglish",
      hinglish: "Hinglish",
    },
    locative: {
      en: "ஆங்கிலத்தில்",
      ta: "தமிழில்",
      hi: "இந்தியில்",
      te: "தெலுங்கில்",
      ml: "மலையாளத்தில்",
      kn: "கன்னடத்தில்",
      tanglish: "Tanglish-இல்",
      hinglish: "Hinglish-இல்",
    },
  },
  "ta-latn": {
    greeting: "Vanakkam - naan Sagar. Kadal, weather, alerts, fishing zones illa unga route pathi kelunga.",
    thanks: "Paravaillai! Eppo venumnaalum kelunga - kadal-la safe-a irunga.",
    farewell: "Seri, poitu vaanga - kadal-la safe-a irunga.",
    help: 'Naan Sagar, marine safety assistant. Kadal nilamai, weather, alerts, fishing zones, route safety, what-if pathi kelunga - udhaaranama "Inniku kadal epdi irukku?". Tamil, English, Hindi, Tanglish-la type pannalaam illa pesalaam.',
    languagesList:
      "Enakku Tamil, English, Hindi, Tanglish, Hinglish puriyum. Edhula kettaalum, adhe maadhiri badhil solluven.",
    yesSame: "Aamaa, Tanglish-la pesalaam dhaan. Neenga Tanglish-laye kelunga - type pannalaam illa voice-la kekkalam.",
    yesOther: (loc) => `Aamaa, Sagar kitta ${loc} pesalaam. Neenga ${loc} kettaa, naan ${loc} badhil solluven.`,
    limited: (name) =>
      `Enakku ${name} puriyum, aana ${name} badhil ippo konjam kammi dhaan - English-la badhil varalaam. Tamil, Hindi, Tanglish full-a support aagudhu.`,
    samples: [
      "Vanakkam{bro}! Naan Sagar, Tamil-la pesuven. Eppadi irukkeenga?",
      "Vanakkam{bro}! Tamil-la pesuradhu romba santhosham. Kadal-ku pogum munnadi ennai kelunga - safe-a poitu vaanga.",
      "Nalla naal-a amaiyattum{bro}! Kadal nilamai, weather, fishing zones - edhu venumnaalum Tanglish-laye kelunga.",
    ],
    limitedGeneration: (name) =>
      `Enakku ${name} puriyum, aana ${name}-la innum sariyaa ezhudha mudiyaadhu - Tamil, English illa Hindi-la badhil solluven.`,
    names: ENGLISH_NAMES,
    locative: mapNames((name) => `${name}-la`),
  },
  hi: {
    greeting: "नमस्ते - मैं Sagar हूँ। समुद्र, मौसम, चेतावनी, मछली पकड़ने के क्षेत्र या अपने route के बारे में पूछें।",
    thanks: "आपका स्वागत है। कभी भी पूछें - समुद्र में सुरक्षित रहें।",
    farewell: "अलविदा - समुद्र में सुरक्षित रहें।",
    help: 'मैं Sagar हूँ, एक समुद्री सुरक्षा सहायक। मुझसे समुद्र की स्थिति, मौसम, चेतावनी, मछली पकड़ने के क्षेत्र, route की सुरक्षा या what-if स्थितियों के बारे में पूछें - जैसे "आज समुद्र की स्थिति कैसी है?"। आप हिंदी, अंग्रेज़ी, तमिल या Hinglish में लिख या बोल सकते हैं।',
    languagesList:
      "मैं हिंदी, अंग्रेज़ी, तमिल, Hinglish और Tanglish समझता हूँ। इनमें से किसी भी भाषा में पूछें, मैं उसी में जवाब दूँगा।",
    yesSame: "हाँ, मैं हिंदी में बात कर सकता हूँ। आप हिंदी में ही पूछ सकते हैं - लिखकर या बोलकर।",
    yesOther: (loc) => `हाँ, आप Sagar से ${loc} बात कर सकते हैं। आप ${loc} पूछेंगे तो मैं ${loc} जवाब दूँगा।`,
    limited: (name) =>
      `मैं ${name} समझ सकता हूँ, लेकिन ${name} में मेरे जवाब अभी सीमित हैं - जवाब अंग्रेज़ी में आ सकता है। हिंदी, तमिल और Hinglish पूरी तरह समर्थित हैं।`,
    samples: [
      "नमस्ते! मैं Sagar हूँ, और हिंदी में बात कर सकता हूँ। आज आपका दिन कैसा चल रहा है?",
      "नमस्ते! हिंदी में बात करके अच्छा लगा। समुद्र में जाने से पहले मुझसे पूछिए - सुरक्षित रहिए।",
      "आपका दिन शुभ हो! समुद्र की स्थिति, मौसम या मछली पकड़ने के क्षेत्र - कुछ भी हिंदी में पूछ सकते हैं।",
    ],
    limitedGeneration: (name) =>
      `मैं ${name} समझता हूँ, लेकिन अभी ${name} में भरोसेमंद ढंग से नहीं लिख सकता - हिंदी, अंग्रेज़ी या तमिल में जवाब दे सकता हूँ।`,
    names: {
      en: "अंग्रेज़ी",
      ta: "तमिल",
      hi: "हिंदी",
      te: "तेलुगु",
      ml: "मलयालम",
      kn: "कन्नड़",
      tanglish: "Tanglish",
      hinglish: "Hinglish",
    },
    locative: {
      en: "अंग्रेज़ी में",
      ta: "तमिल में",
      hi: "हिंदी में",
      te: "तेलुगु में",
      ml: "मलयालम में",
      kn: "कन्नड़ में",
      tanglish: "Tanglish में",
      hinglish: "Hinglish में",
    },
  },
  "hi-latn": {
    greeting: "Namaste - main Sagar hoon. Samundar, mausam, alerts, fishing zones ya aapke route ke baare mein poochho.",
    thanks: "Koi baat nahi! Kabhi bhi poochho - samundar mein safe rehna.",
    farewell: "Bye - samundar mein safe rehna.",
    help: 'Main Sagar hoon, marine safety assistant. Samundar ki halat, mausam, alerts, fishing zones, route safety ya what-if ke baare mein poochho - jaise "Aaj samundar ki halat kaisi hai?". Hindi, English, Tamil ya Hinglish mein type karo ya bolo.',
    languagesList:
      "Main Hindi, English, Tamil, Hinglish aur Tanglish samajhta hoon. Kisi mein bhi poochho, main usi tarah jawaab dunga.",
    yesSame: "Haan, Hinglish mein baat kar sakte ho. Aap Hinglish mein hi poochho - type karke ya bolkar.",
    yesOther: (loc) => `Haan, aap Sagar se ${loc} baat kar sakte ho. Aap ${loc} poochoge to main ${loc} jawaab dunga.`,
    limited: (name) =>
      `Main ${name} samajh sakta hoon, lekin ${name} mein mere jawaab abhi limited hain - jawaab English mein aa sakta hai. Hindi, Tamil aur Hinglish poori tarah supported hain.`,
    samples: [
      "Namaste{bro}! Main Sagar hoon, Hinglish mein baat kar sakta hoon. Aaj aapka din kaisa chal raha hai?",
      "Namaste{bro}! Hinglish mein baat karke accha laga. Samundar mein jaane se pehle mujhse poochho - safe rehna.",
      "Aapka din accha ho{bro}! Samundar ki halat, mausam ya fishing zones - kuch bhi Hinglish mein poochho.",
    ],
    limitedGeneration: (name) =>
      `Main ${name} samajhta hoon, lekin abhi ${name} mein theek se likh nahi sakta - Hindi, English ya Tamil mein jawaab de sakta hoon.`,
    names: ENGLISH_NAMES,
    locative: mapNames((name) => `${name} mein`),
  },
};

function replyKeyFor(context: Pick<LanguageContext, "language" | "style" | "script">): ReplyKey {
  const romanised = context.script === "latin" && context.style !== "native";
  if (context.language === "ta") return romanised ? "ta-latn" : "ta";
  if (context.language === "hi") return romanised ? "hi-latn" : "hi";
  return "en";
}

function targetKey(target: LanguageTarget): TargetKey {
  if (target.style === "tanglish") return "tanglish";
  if (target.style === "hinglish") return "hinglish";
  return target.language;
}

/** Fully supported reply languages (templates + narration). */
const FULLY_SUPPORTED = new Set<TargetKey>(["en", "ta", "hi", "tanglish", "hinglish"]);

export interface ConversationalReply {
  answer: string;
  /** Set when the answer is written in a language other than the
   * user's own (language_generation) - it is spoken with this. */
  replyLanguage?: LanguageTarget;
  /** Single supported language the user asked about - the client can
   * start listening for it on the next voice turn. */
  requestedLanguage?: ChatLanguage;
}

/** The reply, written in the user's own language and style. */
/** Which template set writes "say something in <asked>": the asked
 * language, in Latin letters when the user wrote Tanglish/Hinglish. */
function generationKey(asked: TargetKey, userKey: ReplyKey): ReplyKey {
  if (asked === "tanglish") return "ta-latn";
  if (asked === "hinglish") return "hi-latn";
  if (asked === "ta") return userKey === "ta-latn" ? "ta-latn" : "ta";
  if (asked === "hi") return userKey === "hi-latn" ? "hi-latn" : "hi";
  return "en";
}

export function buildConversationalReply(
  match: ConversationalMatch,
  context: Pick<LanguageContext, "language" | "style" | "script">,
  /** Rotates the sample line, so asking twice gets a different one. */
  variant = 0
): ConversationalReply {
  const key = replyKeyFor(context);
  const t = REPLIES[key];

  if (match.intent === "language_generation" && match.targets.length === 1) {
    const target = match.targets[0];
    const asked = targetKey(target);

    // Never fake a language Sagar has no reliable text for.
    if (!FULLY_SUPPORTED.has(asked)) {
      return { answer: t.limitedGeneration(t.names[asked]) };
    }

    const outKey = generationKey(asked, key);
    const romanised = outKey === "ta-latn" || outKey === "hi-latn";
    const samples = REPLIES[outKey].samples;
    const sample = samples[Math.abs(Math.trunc(variant)) % samples.length];

    return {
      answer: sample.replace("{bro}", match.casual && (romanised || outKey === "en") ? " bro" : ""),
      requestedLanguage: target.language,
      replyLanguage: {
        language: target.language,
        style: romanised ? (target.language === "ta" ? "tanglish" : "hinglish") : "native",
      },
    };
  }

  switch (match.intent) {
    case "greeting":
      return { answer: t.greeting };
    case "thanks":
      return { answer: t.thanks };
    case "farewell":
      return { answer: t.farewell };
    case "help":
      return { answer: t.help };
    case "language_capability":
    case "language_generation":
      break;
  }

  if (match.targets.length !== 1) {
    return { answer: t.languagesList };
  }

  const target = match.targets[0];
  const asked = targetKey(target);

  if (!FULLY_SUPPORTED.has(asked)) {
    return { answer: t.limited(t.names[asked]) };
  }

  // Asked about the language they are already using ("தமிழில் பேச
  // முடியுமா?", "Tamil la pesa mudiyuma?" is answered in Tanglish).
  const userKey: TargetKey =
    key === "ta-latn" ? "tanglish" : key === "hi-latn" ? "hinglish" : key;
  const sameLanguage =
    asked === userKey ||
    (key === "ta-latn" && asked === "ta") ||
    (key === "hi-latn" && asked === "hi");

  return {
    answer: sameLanguage ? t.yesSame : t.yesOther(t.locative[asked]),
    requestedLanguage: target.language,
  };
}
