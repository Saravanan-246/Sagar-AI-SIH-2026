import type { VoiceInputErrorReason } from "../hooks/useVoiceInput";

export type MicState = "idle" | "listening" | "processing" | "ready" | "thinking" | "speaking" | "error";

/*
 * A small, per-string translation table for the mic's own chrome text
 * (state labels + error copy) - the same lightweight pattern already
 * used elsewhere in this codebase (e.g. useSagar.ts's CLARIFY_LABELS),
 * not a second localization system. Scoped to English/Tamil/Hindi,
 * matching the three languages voice conversation actually targets;
 * Telugu/Malayalam/Kannada conversations fall back to the English
 * labels here (chrome text only - the conversation itself still
 * answers in whatever language the backend detected).
 */
export const MIC_LABELS: Record<
  "en" | "ta" | "hi",
  Record<Exclude<MicState, "error">, string> & {
    errors: Record<VoiceInputErrorReason, string>;
    stop: string;
    retry: string;
    voiceLanguage: string;
    auto: string;
  }
> = {
  en: {
    idle: "Tap to speak",
    listening: "Listening…",
    processing: "Processing speech…",
    ready: "Got it — sending to Sagar…",
    thinking: "Sagar is analyzing…",
    speaking: "Sagar is responding…",
    stop: "Stop",
    retry: "Retry",
    voiceLanguage: "Voice language",
    auto: "Auto",
    errors: {
      denied: "Microphone permission required — allow it in your browser, then tap to retry",
      "no-speech": "Didn't catch that — tap to try again",
      unsupported: "Voice input unavailable in this browser — use text input",
      insecure: "Voice input needs a secure (https) connection — use text input",
      "audio-capture": "No microphone found — check your device, then tap to retry",
      network: "Voice recognition needs an internet connection — tap to retry",
      unknown: "Voice input failed — tap to retry, or type instead",
    },
  },
  ta: {
    idle: "பேச தட்டவும்",
    listening: "கேட்கிறேன்…",
    processing: "செயலாக்குகிறேன்…",
    ready: "புரிந்தது — சாகருக்கு அனுப்புகிறேன்…",
    thinking: "சாகர் பகுப்பாய்வு செய்கிறார்…",
    speaking: "சாகர் பதிலளிக்கிறார்…",
    stop: "நிறுத்து",
    retry: "மீண்டும்",
    voiceLanguage: "குரல் மொழி",
    auto: "தானியங்கி",
    errors: {
      denied: "மைக் அனுமதி தேவை — உலாவியில் அனுமதி அளித்து மீண்டும் தட்டவும்",
      "no-speech": "கேட்கவில்லை — மீண்டும் தட்டவும்",
      unsupported: "இந்த உலாவியில் குரல் உள்ளீடு இல்லை — தட்டச்சு செய்யவும்",
      insecure: "குரல் உள்ளீட்டுக்கு பாதுகாப்பான (https) இணைப்பு தேவை — தட்டச்சு செய்யவும்",
      "audio-capture": "மைக்ரோஃபோன் கிடைக்கவில்லை — சாதனத்தைச் சரிபார்த்து மீண்டும் தட்டவும்",
      network: "குரல் அறிதலுக்கு இணைய இணைப்பு தேவை — மீண்டும் தட்டவும்",
      unknown: "கேட்க முடியவில்லை — மீண்டும் தட்டவும்",
    },
  },
  hi: {
    idle: "बोलने के लिए टैप करें",
    listening: "सुन रहा हूँ…",
    processing: "प्रोसेस कर रहा हूँ…",
    ready: "समझ गया — सागर को भेज रहा हूँ…",
    thinking: "सागर विश्लेषण कर रहा है…",
    speaking: "सागर जवाब दे रहा है…",
    stop: "रोकें",
    retry: "फिर से",
    voiceLanguage: "आवाज़ की भाषा",
    auto: "ऑटो",
    errors: {
      denied: "माइक अनुमति आवश्यक — ब्राउज़र में अनुमति दें, फिर टैप करें",
      "no-speech": "कुछ सुनाई नहीं दिया — फिर से टैप करें",
      unsupported: "इस ब्राउज़र में वॉइस इनपुट उपलब्ध नहीं — टाइप करें",
      insecure: "वॉइस इनपुट के लिए सुरक्षित (https) कनेक्शन चाहिए — टाइप करें",
      "audio-capture": "माइक्रोफ़ोन नहीं मिला — डिवाइस जाँचें, फिर टैप करें",
      network: "वॉइस पहचान के लिए इंटरनेट कनेक्शन चाहिए — फिर से टैप करें",
      unknown: "सुनाई नहीं दिया — फिर से टैप करें",
    },
  },
};

/** Mic chrome text for a conversation language - Telugu, Malayalam and
 * Kannada fall back to English chrome (the conversation itself still
 * answers in the detected language). */
export function micLabelsFor(language: string) {
  return language === "ta" || language === "hi" ? MIC_LABELS[language] : MIC_LABELS.en;
}
