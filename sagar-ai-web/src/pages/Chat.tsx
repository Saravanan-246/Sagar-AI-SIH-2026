import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Pause, Square, Volume2, VolumeX, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import ChatHeader from "../components/chat/ChatHeader";
import ChatSidebar from "../components/chat/ChatSidebar";
import ChatInput from "../components/chat/ChatInput";
import ChatMapPanel from "../components/chat/ChatMapPanel";
import ChatWindow from "../components/chat/ChatWindow";
import type { ChatItem } from "../components/chat/ChatWindow";
import Modal from "../components/ui/Modal";
import useSagar from "../hooks/useSagar";
import { useConnectivity } from "../hooks/useConnectivity";
import { useOfflineSync, describeSnapshotAge } from "../hooks/useOfflineSync";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useUserLocation } from "../hooks/useUserLocation";
import { useVoiceInput, type VoiceInputErrorReason } from "../hooks/useVoiceInput";
import { useKeyboardViewport } from "../hooks/useKeyboardViewport";
import { useVoiceOutput } from "../hooks/useVoiceOutput";
import { getMarineAreas } from "../services/marine/marineData";
import { getSuggestedQuestions } from "../utils/chatSuggestions";
import { buildChatMapFocus } from "../utils/chatMapFocus";
import {
  deleteSavedChat,
  listSavedChats,
  saveChat,
  type SavedChat,
} from "../utils/savedChats";
import { useAppStore, type AppLanguage } from "../store/appStore";
import { ROUTES } from "../constants/routes";

import "./Chat.css";

const LOCALE_BY_LANGUAGE: Record<AppLanguage, string> = {
  en: "en-IN",
  ta: "ta-IN",
  te: "te-IN",
  ml: "ml-IN",
  kn: "kn-IN",
  hi: "hi-IN",
};

type MicState = "idle" | "listening" | "processing" | "ready" | "thinking" | "speaking" | "error";

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
const MIC_LABELS: Record<
  "en" | "ta" | "hi",
  Record<Exclude<MicState, "error">, string> & {
    errors: Record<VoiceInputErrorReason, string>;
  }
> = {
  en: {
    idle: "Tap to speak",
    listening: "Listening…",
    processing: "Processing speech…",
    ready: "Got it — sending to Sagar…",
    thinking: "Sagar is analyzing…",
    speaking: "Sagar is responding…",
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

type ThinkingInfo = {
  label: string;
  /** Only the real pipeline stages that actually apply to this message -
   * never a fixed list, never marked done here (the caller only ever
   * renders these as pending; the whole bubble is replaced by the real
   * answer the moment it arrives). Omitted entirely for a casual message,
   * which the backend answers without touching marine data at all. */
  stages?: string[];
};

// Mirrors (loosely - a false miss here only costs a slightly-generic
// loading line, never a wrong claim) the backend's own casual-message
// gate in chat.routes.ts, so a greeting/thanks never shows "Marine data
// checked" for a message that will never touch marine data.
const CASUAL_THINKING_PATTERN =
  /^(hi|hello|hey|yo|sup|bro|ok|okay|k|thanks|thank you|thx|good morning|good afternoon|good evening|bye|goodbye)[.!? ]*$/i;

function getThinkingInfo(
  lastUserMessage: string | null,
  hasLocation: boolean,
): ThinkingInfo {
  if (!lastUserMessage || CASUAL_THINKING_PATTERN.test(lastUserMessage.trim())) {
    return { label: "Sagar is replying…" };
  }

  const text = lastUserMessage.toLowerCase();
  // Each stage names an operation the backend's chat pipeline really
  // performs for this kind of question (intent classification, area
  // resolution, marine data retrieval with freshness classification,
  // risk/route/zone scoring) - shown as pending, never as completed.
  const understand = "Understanding request…";
  const locationStage = hasLocation ? ["Resolving your area…"] : [];
  const fetchMarine = "Fetching marine conditions…";
  const freshness = "Checking data freshness…";

  if (/\broute|path|passage|sail\b/.test(text)) {
    return {
      label: "Sagar is plotting the safest route…",
      stages: [understand, ...locationStage, fetchMarine, "Assessing route impact…"],
    };
  }

  if (/\bzone|fishing|pfz\b/.test(text)) {
    return {
      label: "Sagar is scanning fishing zones…",
      stages: [understand, ...locationStage, fetchMarine, "Ranking fishing zones…"],
    };
  }

  if (/\bwind|storm|cyclone|weather|what if\b/.test(text)) {
    return {
      label: "Sagar is modelling the scenario…",
      stages: [understand, ...locationStage, fetchMarine, "Assessing risk…"],
    };
  }

  if (/\balert|warning\b/.test(text)) {
    return {
      label: "Sagar is checking active alerts…",
      stages: [understand, ...locationStage, "Checking active alerts…"],
    };
  }

  if (/\bwhy|what data|what sources|what evidence|show me the evidence\b/.test(text)) {
    return {
      label: "Sagar is gathering the evidence…",
      stages: [understand, ...locationStage, fetchMarine, freshness],
    };
  }

  return {
    label: "Sagar is checking marine conditions…",
    stages: [understand, ...locationStage, fetchMarine, freshness, "Assessing risk…"],
  };
}

export default function Chat() {
  const navigate = useNavigate();

  const retryRef = useRef<(() => void) | null>(null);
  const requestLocationRef = useRef<(() => Promise<boolean>) | null>(null);
  const retryAfterAreaSelectRef = useRef(false);

  const handleClarifyUseMyLocation = useCallback(async () => {
    setLocationNotice(null);
    setAreaPickerOpen(false);

    const granted = await requestLocationRef.current?.();

    if (granted) {
      retryRef.current?.();
      return;
    }

    setLocationNotice(
      "Location access is blocked. You can choose an area instead.",
    );
    retryAfterAreaSelectRef.current = true;
    setAreaPickerOpen(true);
  }, []);

  const handleClarifyChooseArea = useCallback(() => {
    setLocationNotice(null);
    retryAfterAreaSelectRef.current = true;
    setAreaPickerOpen(true);
  }, []);

  const connectivity = useConnectivity();
  const offlineSync = useOfflineSync();

  const {
    messages,
    loading,
    error,
    sendMessage,
    clearConversation,
    restoreMessages,
    retryLastQuestion,
    resolvedAreaName,
  } = useSagar({
    onUseMyLocation: () => {
      void handleClarifyUseMyLocation();
    },
    onChooseArea: handleClarifyChooseArea,
    onConnectivityChange: connectivity.reportRequestOutcome,
  });

  const handleSync = useCallback(async () => {
    connectivity.setIsSyncing(true);
    await offlineSync.sync();
    connectivity.setIsSyncing(false);
  }, [connectivity, offlineSync]);

  useEffect(() => {
    retryRef.current = retryLastQuestion;
  }, [retryLastQuestion]);

  const [input, setInput] = useState("");
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [savedChats, setSavedChats] = useState<SavedChat[]>(() =>
    listSavedChats(),
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const voiceLanguageOverride = useAppStore((state) => state.voiceLanguageOverride);
  const locationLabel = useAppStore((state) => state.locationLabel);
  const setSelectedArea = useAppStore((state) => state.setSelectedArea);
  const clearLocation = useAppStore((state) => state.clearLocation);
  const selectedAreaId = useAppStore((state) => state.selectedAreaId);
  const currentLocation = useAppStore((state) => state.currentLocation);
  const locationPermission = useAppStore((state) => state.locationPermission);
  const pendingChatPrompt = useAppStore((state) => state.pendingChatPrompt);
  const clearPendingChatPrompt = useAppStore(
    (state) => state.clearPendingChatPrompt,
  );

  const { requestLocation, status: locationStatus } = useUserLocation();

  useEffect(() => {
    requestLocationRef.current = requestLocation;
  }, [requestLocation]);

  const voiceOutput = useVoiceOutput();
  const [voiceToastVisible, setVoiceToastVisible] = useState(false);

  useEffect(() => {
    if (voiceOutput.status !== "error" && voiceOutput.status !== "unavailable") {
      return;
    }

    setVoiceToastVisible(true);

    const timer = window.setTimeout(() => {
      setVoiceToastVisible(false);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [voiceOutput.status]);

  const voiceToastMessage =
    voiceOutput.status === "unavailable"
      ? "No voice available for this language on this device — showing text only."
      : "Voice playback unavailable on this device.";

  // The conversation's own rolling language, not the static app-wide
  // preference above - updated after every assistant reply from the
  // backend's own detected language (see submitMessage below), so
  // voice recognition's next hint, the mic's chrome text and the
  // welcome suggestions all follow what the conversation is actually
  // in right now ("chat language lock"), not a fixed setting the user
  // has to manage. Seeded from the app-wide preference only as a
  // starting point for a brand-new conversation.
  const [autoDetectedLanguage, setAutoDetectedLanguage] = useState<AppLanguage>(language);
  const conversationLanguage: AppLanguage =
    voiceLanguageOverride !== "auto" ? voiceLanguageOverride : autoDetectedLanguage;

  const locale = LOCALE_BY_LANGUAGE[conversationLanguage] ?? "en-IN";
  const marineAreas = useMemo(() => getMarineAreas(), []);

  const suggestions = useMemo(
    () =>
      getSuggestedQuestions({
        areaId: selectedAreaId,
        coordinates: currentLocation,
        language: conversationLanguage,
      }),
    [selectedAreaId, currentLocation, conversationLanguage],
  );

  const handleVoiceTranscript = (transcript: string) => {
    setInput(transcript);
    void submitMessage(transcript, { spokenAloud: true });
  };

  // The language hint SpeechRecognition needs before it can start (the
  // real browser API has no "detect any language from raw audio" mode
  // - see useVoiceInput's own doc comment) - this is the conversation's
  // own last-known language, which is the closest honest approximation
  // to "automatic" available: correct whenever the conversation stays
  // in one language (the common case), and always overridable via the
  // manual voice-language setting in Settings for anyone who needs it.
  const shellRef = useRef<HTMLDivElement>(null);
  useKeyboardViewport(shellRef);

  const voiceInput = useVoiceInput({
    language: locale,
    onResult: handleVoiceTranscript,
  });

  // Shows the real, live interim recognition result in the composer
  // while the user is still speaking - never guessed text, only what
  // the browser's own recognizer has actually hypothesized so far.
  useEffect(() => {
    if (voiceInput.status === "listening" && voiceInput.interimTranscript) {
      setInput(voiceInput.interimTranscript);
    }
  }, [voiceInput.status, voiceInput.interimTranscript]);

  const micState: MicState =
    voiceInput.status === "listening"
      ? "listening"
      : voiceInput.status === "processing"
        ? "processing"
        : voiceInput.status === "ready"
          ? "ready"
          : voiceInput.status === "error"
          ? "error"
          : loading
            ? "thinking"
            : voiceOutput.status === "speaking"
              ? "speaking"
              : "idle";

  const micLabelSet = MIC_LABELS[conversationLanguage as "en" | "ta" | "hi"] ?? MIC_LABELS.en;

  const micLabel: Record<MicState, string> = {
    idle: micLabelSet.idle,
    listening: micLabelSet.listening,
    processing: micLabelSet.processing,
    ready: micLabelSet.ready,
    thinking: micLabelSet.thinking,
    speaking: micLabelSet.speaking,
    error:
      micLabelSet.errors[voiceInput.errorReason ?? "unknown"] ??
      micLabelSet.errors.unknown,
  };

  const locationStateLabel = currentLocation
    ? resolvedAreaName
      ? `Using your location · ${resolvedAreaName}`
      : "Using your location"
    : selectedAreaId && locationLabel
      ? locationLabel
      : locationPermission === "denied" ||
          locationPermission === "unavailable"
        ? "Location unavailable"
        : "No location set";

  const chatMessages: ChatItem[] = messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    timestamp: message.timestamp,
    structured: message.structured,
    language: message.language,
    // The real resolved area for this specific answer, if any - never a
    // fallback/default name when it doesn't resolve against the
    // configured marine areas.
    locationLabel: message.affectedAreaId
      ? marineAreas.find((area) => area.id === message.affectedAreaId)?.name
      : undefined,
  }));

  const mapFocus = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];

      if (message.role !== "assistant") {
        continue;
      }

      const focus = buildChatMapFocus(
        {
          route: message.route,
          zones: message.zones,
          alerts: message.alerts,
          affectedAreaId: message.affectedAreaId,
        },
        marineAreas,
      );

      if (focus) {
        return focus;
      }
    }

    return null;
  }, [messages, marineAreas]);

  const [mapModalOpen, setMapModalOpen] = useState(false);
  const isDesktopMapLayout = useMediaQuery("(min-width: 1180px)");

  const lastUserMessage = useMemo(() => {
    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      if (chatMessages[i].role === "user") {
        return chatMessages[i].text;
      }
    }
    return null;
  }, [chatMessages]);

  const hasKnownLocation = Boolean(
    selectedAreaId || currentLocation || resolvedAreaName,
  );

  const thinkingInfo = useMemo(
    () => getThinkingInfo(lastUserMessage, hasKnownLocation),
    [lastUserMessage, hasKnownLocation],
  );

  const activeChat = currentChatId
    ? (savedChats.find((chat) => chat.id === currentChatId) ?? null)
    : null;

  const headerTitle = activeChat?.title ?? "Sagar AI";

  const localeForMessage = (messageLanguage?: string) =>
    LOCALE_BY_LANGUAGE[(messageLanguage as AppLanguage) ?? conversationLanguage] ?? locale;

  const isKnownAppLanguage = (value?: string): value is AppLanguage =>
    Boolean(value && value in LOCALE_BY_LANGUAGE);

  const submitMessage = async (
    value: string,
    options: { spokenAloud?: boolean } = {},
  ) => {
    const text = value.trim();

    if (!text || loading) {
      return;
    }

    if (/\buse (my )?(current )?location\b/i.test(text)) {
      setInput("");
      await handleUseMyLocation();
      return;
    }

    const setLocationMatch = text.match(
      /\b(?:set location to|switch (?:location )?to|use location|check near|near me at|show.*\bnear)\s+(.+?)[.?!]*$/i,
    );

    if (setLocationMatch) {
      const query = setLocationMatch[1].trim().toLowerCase();

      const matchedArea = marineAreas.find(
        (area) =>
          area.name.toLowerCase().includes(query) ||
          query.includes(area.name.toLowerCase()),
      );

      if (matchedArea) {
        setSelectedArea(matchedArea.id, matchedArea.name);
      }
    }

    setInput("");

    const reply = await sendMessage(text);

    // Chat language lock: the backend independently detects language
    // fresh from each message's own text (never a client-supplied
    // override - see chat.routes.ts's detectQueryLanguage), so simply
    // carrying its result forward as the next turn's starting point is
    // enough to keep the conversation in the language it's actually
    // in, without a second detection pass on the frontend.
    if (isKnownAppLanguage(reply?.language)) {
      setAutoDetectedLanguage(reply.language);
    }

    if (reply && options.spokenAloud && voiceOutput.isSupported) {
      voiceOutput.speak(reply.text, {
        id: reply.id,
        language: localeForMessage(reply.language),
      });
    }
  };

  const handleSend = () => submitMessage(input);

  const handleSuggestion = (value: string) => {
    void submitMessage(value);
  };

  // A question built from real page context elsewhere (e.g. the Route
  // page's selected route), asked through this same send pipeline the
  // moment Chat mounts - never a second chat mechanism.
  useEffect(() => {
    if (!pendingChatPrompt) {
      return;
    }

    clearPendingChatPrompt();
    void submitMessage(pendingChatPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChatPrompt]);

  const latestRef = useRef({
    currentChatId,
    language,
    selectedAreaId,
    locationLabel,
  });

  useEffect(() => {
    latestRef.current = {
      currentChatId,
      language,
      selectedAreaId,
      locationLabel,
    };
  });

  const skipAutosaveRef = useRef(false);

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }

    if (chatMessages.length === 0) {
      return;
    }

    const snapshot = latestRef.current;

    const saved = saveChat({
      id: snapshot.currentChatId,
      messages: chatMessages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        timestamp: message.timestamp,
        language: message.language,
        structured: message.structured
          ? {
              riskLevel: message.structured.riskLevel,
              riskScore: message.structured.riskScore,
              keyFactors: message.structured.keyFactors,
              evidenceTitles: message.structured.evidenceTitles,
              whatIfSummary: message.structured.whatIfSummary,
            }
          : undefined,
      })),
      language: snapshot.language,
      areaId: snapshot.selectedAreaId,
      areaLabel: snapshot.locationLabel,
    });

    if (saved.id !== snapshot.currentChatId) {
      setCurrentChatId(saved.id);
    }

    setSavedChats(listSavedChats());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const handleNewConversation = () => {
    clearConversation();
    setInput("");
    setCurrentChatId(null);
    voiceOutput.stop();
    voiceInput.cancel();
    setAutoDetectedLanguage(language);
    setMobileSidebarOpen(false);
  };

  const handleSelectChat = (id: string) => {
    const saved = savedChats.find((chat) => chat.id === id);

    if (!saved) {
      return;
    }

    skipAutosaveRef.current = true;

    restoreMessages(
      saved.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        timestamp: message.timestamp ?? new Date().toISOString(),
        language: message.language,
        structured: message.structured,
        route: null,
      })),
    );

    setLanguage(saved.language);
    if (isKnownAppLanguage(saved.language)) {
      setAutoDetectedLanguage(saved.language);
    }

    if (saved.areaId) {
      setSelectedArea(saved.areaId, saved.areaLabel ?? saved.areaId);
    }

    setCurrentChatId(saved.id);
    setInput("");
    voiceOutput.stop();
    setMobileSidebarOpen(false);
  };

  const handleDeleteChat = (id: string) => {
    deleteSavedChat(id);
    setSavedChats((current) => current.filter((chat) => chat.id !== id));

    if (id === currentChatId) {
      clearConversation();
      setCurrentChatId(null);
    }
  };

  const handleMicPress = () => {
    // Listening -> stop and keep what was heard; a second tap while the
    // recognizer is still finalising discards the attempt instead.
    if (micState === "listening") {
      voiceInput.stop();
      return;
    }

    if (micState === "processing" || micState === "ready") {
      voiceInput.cancel();
      return;
    }

    if (voiceOutput.status === "speaking" || voiceOutput.status === "paused") {
      voiceOutput.stop();
    }

    voiceInput.retry();
  };

  const handleUseMyLocation = async () => {
    setLocationNotice(null);
    setAreaPickerOpen(false);

    const granted = await requestLocation();

    if (!granted) {
      setLocationNotice(
        "Location access is blocked. You can choose an area instead.",
      );
      setAreaPickerOpen(true);
    }
  };

  const handleOpenAreaPicker = () => {
    setLocationNotice(null);
    setAreaPickerOpen(true);
  };

  const handleSelectArea = (areaId: string) => {
    const area = marineAreas.find((item) => item.id === areaId);

    if (area) {
      setSelectedArea(area.id, area.name);
      setLocationNotice(null);
    }

    setAreaPickerOpen(false);

    if (area && retryAfterAreaSelectRef.current) {
      retryAfterAreaSelectRef.current = false;
      retryRef.current?.();
    }
  };

  useEffect(() => {
    if (!mobileSidebarOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileSidebarOpen]);

  return (
    <div className="chat-shell" ref={shellRef}>
      <ChatSidebar
        chats={savedChats}
        activeChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewConversation}
        onDeleteChat={handleDeleteChat}
        open={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        onBackHome={() => navigate(ROUTES.HOME)}
        locationLabel={locationStateLabel}
        hasLocation={Boolean(locationLabel)}
        locationBusy={locationStatus === "requesting"}
        onUseMyLocation={handleUseMyLocation}
        onChooseArea={handleOpenAreaPicker}
        onClearLocation={clearLocation}
        profileHref={ROUTES.PROFILE}
        connectivityStatus={connectivity.status}
        snapshotAge={
          offlineSync.snapshot
            ? describeSnapshotAge(offlineSync.snapshot.createdAt)
            : null
        }
        syncStatus={offlineSync.syncStatus}
        onSync={handleSync}
      />

      <div className="chat-content-area">
        <div className="chat-main">
          <ChatHeader
            title={headerTitle}
            locationLabel={locationStateLabel}
            onMenuClick={() => setMobileSidebarOpen(true)}
            onNewChat={handleNewConversation}
          />

          <div className="chat-main-window">
            <ChatWindow
              messages={chatMessages}
              loading={loading}
              thinkingLabel={thinkingInfo.label}
              thinkingStages={thinkingInfo.stages}
              suggestions={suggestions}
              onSuggestion={handleSuggestion}
              renderVoiceControl={(message) => {
                if (!voiceOutput.isSupported) {
                  return null;
                }

                const isThisSpeaking =
                  voiceOutput.speakingId === message.id &&
                  voiceOutput.status === "speaking";

                const isThisPaused =
                  voiceOutput.speakingId === message.id &&
                  voiceOutput.status === "paused";

                if (isThisSpeaking) {
                  return (
                    <button
                      type="button"
                      className="chat-voice-control"
                      onClick={voiceOutput.pause}
                      aria-label="Pause"
                    >
                      <Pause size={12} />
                    </button>
                  );
                }

                if (isThisPaused) {
                  return (
                    <>
                      <button
                        type="button"
                        className="chat-voice-control"
                        onClick={voiceOutput.resume}
                        aria-label="Resume"
                      >
                        <Volume2 size={12} />
                      </button>
                      <button
                        type="button"
                        className="chat-voice-control"
                        onClick={voiceOutput.stop}
                        aria-label="Stop"
                      >
                        <Square size={12} />
                      </button>
                    </>
                  );
                }

                return (
                  <button
                    type="button"
                    className="chat-voice-control"
                    onClick={() =>
                      voiceOutput.speak(message.text, {
                        id: message.id,
                        language: localeForMessage(message.language),
                      })
                    }
                    aria-label="Speak this response"
                  >
                    <Volume2 size={12} />
                  </button>
                );
              }}
            />
          </div>

          <div className="chat-main-composer">
            {error && (
              <div className="chat-banner-stack">
                <div className="chat-banner chat-banner-error">
                  <AlertTriangle size={14} />
                  <span>{error}</span>
                </div>
              </div>
            )}

            <ChatMapPanel
              variant="card"
              focus={mapFocus}
              areas={marineAreas}
              onExpand={() => setMapModalOpen(true)}
            />

            {voiceToastVisible && (
              <div className="chat-voice-toast" role="status">
                <VolumeX size={13} />
                <span>{voiceToastMessage}</span>
                <button
                  type="button"
                  className="chat-voice-toast-dismiss"
                  onClick={() => setVoiceToastVisible(false)}
                  aria-label="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            <ChatInput
              value={input}
              onChange={setInput}
              onSend={handleSend}
              disabled={loading}
              placeholder="Ask Sagar about sea conditions, alerts, fishing zones or routes…"
              micSupported={voiceInput.isSupported}
              micUnavailableLabel={
                micLabelSet.errors[voiceInput.unavailableReason ?? "unsupported"]
              }
              micState={micState}
              micLabel={micLabel[micState]}
              onMicPress={handleMicPress}
              onUseMyLocation={handleUseMyLocation}
              onChooseArea={handleOpenAreaPicker}
            />
          </div>
        </div>

        {isDesktopMapLayout && (
          <div className="chat-map-panel-wrapper">
            <ChatMapPanel variant="inline" focus={mapFocus} areas={marineAreas} />
          </div>
        )}
      </div>

      <Modal
        open={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        size="lg"
      >
        <div className="chat-map-modal-canvas">
          <ChatMapPanel variant="inline" focus={mapFocus} areas={marineAreas} />
        </div>
      </Modal>

      <Modal
        open={areaPickerOpen}
        onClose={() => {
          setAreaPickerOpen(false);
          setLocationNotice(null);
        }}
        title="Choose a marine area"
        description={
          locationNotice ??
          "Sagar will use this area for marine questions until you change it."
        }
        size="sm"
      >
        <div className="chat-area-options">
          {marineAreas.map((area) => (
            <button
              key={area.id}
              type="button"
              className="chat-area-option"
              onClick={() => handleSelectArea(area.id)}
            >
              {area.name}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}