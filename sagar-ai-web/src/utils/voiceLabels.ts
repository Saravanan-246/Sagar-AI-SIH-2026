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
    dismiss: string;
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
    dismiss: "Dismiss",
    voiceLanguage: "Voice language",
    auto: "Auto",
    errors: {
      insecure: "Voice input requires HTTPS on this device — open Sagar over https://, or type instead",
      unsupported: "Voice recognition is not supported by this browser — type instead",
      "mic-unsupported": "This browser gives no access to a microphone — type instead",
      denied: "Microphone permission was denied — allow microphone access, then tap Retry",
      blocked: "Microphone is blocked for this site — allow it in your browser's site settings, then tap Retry",
      "audio-capture": "No microphone available — check it isn't in use by another app, then tap Retry",
      service: "Speech recognition service isn't available in this browser — type instead",
      network: "Voice recognition couldn't reach its service — check your internet, then tap Retry",
      language: "This browser can't recognise the selected voice language — pick another in the + menu",
      "no-speech": "Didn't catch that — tap to try again",
      unknown: "Voice input failed — tap Retry, or type instead",
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
    dismiss: "மூடு",
    voiceLanguage: "குரல் மொழி",
    auto: "தானியங்கி",
    errors: {
      insecure: "இந்தச் சாதனத்தில் குரல் உள்ளீட்டுக்கு HTTPS தேவை — https:// வழியாகத் திறக்கவும் அல்லது தட்டச்சு செய்யவும்",
      unsupported: "இந்த உலாவி குரல் அறிதலை ஆதரிக்கவில்லை — தட்டச்சு செய்யவும்",
      "mic-unsupported": "இந்த உலாவியில் மைக்ரோஃபோன் அணுகல் இல்லை — தட்டச்சு செய்யவும்",
      denied: "மைக் அனுமதி மறுக்கப்பட்டது — அனுமதி அளித்து மீண்டும் தட்டவும்",
      blocked: "இந்தத் தளத்திற்கு மைக் தடுக்கப்பட்டுள்ளது — உலாவியின் தள அமைப்புகளில் அனுமதித்து மீண்டும் தட்டவும்",
      "audio-capture": "மைக்ரோஃபோன் கிடைக்கவில்லை — வேறு செயலி பயன்படுத்தவில்லை என்பதைச் சரிபார்த்து மீண்டும் தட்டவும்",
      service: "இந்த உலாவியில் குரல் அறிதல் சேவை கிடைக்கவில்லை — தட்டச்சு செய்யவும்",
      network: "குரல் அறிதல் சேவையை அடைய முடியவில்லை — இணையத்தைச் சரிபார்த்து மீண்டும் தட்டவும்",
      language: "தேர்ந்தெடுத்த குரல் மொழியை இந்த உலாவி அறியாது — + மெனுவில் வேறு மொழியைத் தேர்ந்தெடுக்கவும்",
      "no-speech": "கேட்கவில்லை — மீண்டும் தட்டவும்",
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
    dismiss: "बंद करें",
    voiceLanguage: "आवाज़ की भाषा",
    auto: "ऑटो",
    errors: {
      insecure: "इस डिवाइस पर वॉइस इनपुट के लिए HTTPS ज़रूरी है — https:// से खोलें या टाइप करें",
      unsupported: "यह ब्राउज़र वॉइस पहचान सपोर्ट नहीं करता — टाइप करें",
      "mic-unsupported": "यह ब्राउज़र माइक्रोफ़ोन तक पहुँच नहीं देता — टाइप करें",
      denied: "माइक अनुमति अस्वीकार हुई — अनुमति दें, फिर टैप करें",
      blocked: "इस साइट के लिए माइक ब्लॉक है — ब्राउज़र की साइट सेटिंग्स में अनुमति दें, फिर टैप करें",
      "audio-capture": "माइक्रोफ़ोन उपलब्ध नहीं — जाँचें कि कोई दूसरा ऐप इसे इस्तेमाल न कर रहा हो, फिर टैप करें",
      service: "इस ब्राउज़र में वॉइस पहचान सेवा उपलब्ध नहीं — टाइप करें",
      network: "वॉइस पहचान सेवा तक नहीं पहुँच सके — इंटरनेट जाँचें, फिर टैप करें",
      language: "यह ब्राउज़र चुनी गई आवाज़ की भाषा नहीं पहचानता — + मेनू में दूसरी भाषा चुनें",
      "no-speech": "कुछ सुनाई नहीं दिया — फिर से टैप करें",
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
