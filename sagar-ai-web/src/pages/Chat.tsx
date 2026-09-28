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
import { useVoiceInput } from "../hooks/useVoiceInput";
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
import { micLabelsFor, type MicState } from "../utils/voiceLabels";
import {
  detectConversationalIntent,
  isDecisionChangeQuestion,
} from "../services/ai/conversationalIntent";
import { analyzeIntent } from "../services/ai/intent";
import {
  isChatLanguage,
  recognitionLocaleFor,
  speechLocaleFor,
} from "../utils/voiceLocale";

import "./Chat.css";

type ThinkingInfo = {
  label: string;
  /** Only the real pipeline stages that actually apply to this message -
   * never a fixed list, never marked done here (the caller only ever
   * renders these as pending; the whole bubble is replaced by the real
   * answer the moment it arrives). Omitted entirely for a casual message,
   * which the backend answers without touching marine data at all. */
  stages?: string[];
};

// Mirrors the backend's casual-message gate in chat.routes.ts for the
// short acknowledgements ("ok", "bro") that are not in the
// conversational router.
const CASUAL_THINKING_PATTERN =
  /^(hi|hello|hey|yo|sup|bro|ok|okay|k|thanks|thank you|thx|good morning|good afternoon|good evening|bye|goodbye)[.!? ]*$/i;

const EVIDENCE_THINKING_PATTERN =
  /why|what data|which data|what sources|evidence|ஏன்|क्यों/i;

const WHAT_IF_THINKING_PATTERN = /what if|what happens if|simulate/i;

/*
 * The pending-reply indicator shows only the work the backend will
 * really do for this message. It uses the same deterministic routing
 * the backend uses (conversationalIntent + the keyword intent rules),
 * so a greeting, "thanks" or "Can you speak Tamil?" - answered without
 * any marine data - never shows "Fetching marine conditions…".
 */
function getThinkingInfo(
  lastUserMessage: string | null,
  hasLocation: boolean,
): ThinkingInfo {
  const text = lastUserMessage?.trim() ?? "";

  if (!text || CASUAL_THINKING_PATTERN.test(text) || detectConversationalIntent(text)) {
    return { label: "Sagar is replying…" };
  }

  if (isDecisionChangeQuestion(text)) {
    return { label: "Checking your saved decisions…" };
  }

  // Each stage names an operation the backend's chat pipeline really
  // performs for this kind of question - shown as pending, never as
  // completed.
  const understand = "Understanding request…";
  const locationStage = hasLocation ? ["Resolving your area…"] : [];
  const fetchMarine = "Fetching marine conditions…";
  const freshness = "Checking data freshness…";
  const assessRisk = "Assessing risk…";

  if (WHAT_IF_THINKING_PATTERN.test(text)) {
    return {
      label: "Sagar is modelling the scenario…",
      stages: [understand, ...locationStage, fetchMarine, "Comparing the what-if scenario…"],
    };
  }

  if (EVIDENCE_THINKING_PATTERN.test(text)) {
    return {
      label: "Sagar is gathering the evidence…",
      stages: [understand, ...locationStage, fetchMarine, freshness],
    };
  }

  switch (analyzeIntent(text).intent) {
    case "route":
      return {
        label: "Sagar is plotting the safest route…",
        stages: [understand, ...locationStage, fetchMarine, "Assessing route impact…"],
      };
    case "pfz":
    case "productivity":
      return {
        label: "Sagar is scanning fishing zones…",
        stages: [understand, ...locationStage, "Ranking fishing zones…"],
      };
    case "alerts":
      return {
        label: "Sagar is checking active alerts…",
        stages: [understand, ...locationStage, "Checking active alerts…"],
      };
    case "safety":
    case "marine_conditions":
    case "tide":
    case "geofence":
      return {
        label: "Sagar is checking marine conditions…",
        stages: [understand, ...locationStage, fetchMarine, freshness, assessRisk],
      };
    default:
      // Not placed by the keyword rules: the backend first works out
      // what is being asked, and only runs marine work if it is marine.
      return { label: "Sagar is understanding your question…" };
  }
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
  const setVoiceLanguageOverride = useAppStore((state) => state.setVoiceLanguageOverride);
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

  const showFallbackVoiceNotice =
    voiceOutput.status === "speaking" && voiceOutput.usingFallbackVoice;

  useEffect(() => {
    if (
      voiceOutput.status !== "error" &&
      voiceOutput.status !== "unavailable" &&
      !showFallbackVoiceNotice
    ) {
      return;
    }

    setVoiceToastVisible(true);

    const timer = window.setTimeout(() => {
      setVoiceToastVisible(false);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [voiceOutput.status, showFallbackVoiceNotice]);

  const voiceToastMessage =
    voiceOutput.status === "unavailable"
      ? "No voice available for this language on this device — showing text only."
      : showFallbackVoiceNotice
        ? "No native voice for this language on this device — reading with an English voice."
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

  const locale = recognitionLocaleFor(conversationLanguage);

  // The configured route the conversation started from (Home / Route
  // page), kept for follow-ups until a new conversation starts - the
  // backend only uses it when a question is about a route.
  const [contextRouteId, setContextRouteId] = useState<string | null>(null);
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

  const requestSeqRef = useRef(0);

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

  const micLabelSet = micLabelsFor(conversationLanguage);

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

  const isKnownAppLanguage = (value?: string): value is AppLanguage => isChatLanguage(value);

  const submitMessage = async (
    value: string,
    options: { spokenAloud?: boolean; areaId?: string; routeId?: string } = {},
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

    // A new question supersedes whatever Sagar was saying, and only the
    // reply to the latest request may be spoken.
    voiceOutput.stop();
    const requestId = ++requestSeqRef.current;

    const reply = await sendMessage(text, {
      areaId: options.areaId,
      routeId: options.routeId ?? contextRouteId ?? undefined,
    });

    if (requestId !== requestSeqRef.current) {
      return;
    }

    // Chat language lock: the backend independently detects language
    // fresh from each message's own text (never a client-supplied
    // override - see chat.routes.ts's detectQueryLanguage), so simply
    // carrying its result forward as the next turn's starting point is
    // enough to keep the conversation in the language it's actually
    // in, without a second detection pass on the frontend.
    // After "Can you speak Tamil?" the next voice turn listens in Tamil,
    // even though that question itself was asked in English.
    if (isKnownAppLanguage(reply?.requestedLanguage)) {
      setAutoDetectedLanguage(reply.requestedLanguage);
    } else if (isKnownAppLanguage(reply?.language)) {
      setAutoDetectedLanguage(reply.language);
    }

    // Spoken question -> spoken answer, in the reply's own language.
    // Voice is optional: without speech synthesis the text reply above
    // is the whole answer and nothing here throws.
    if (reply && options.spokenAloud && voiceOutput.isSupported) {
      voiceOutput.speak(reply.text, {
        id: reply.id,
        language: speechLocaleFor(reply.text),
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

    const request = pendingChatPrompt;
    clearPendingChatPrompt();

    if (request.routeId) {
      setContextRouteId(request.routeId);
    }

    void submitMessage(request.text, {
      spokenAloud: request.spoken,
      areaId: request.areaId,
      routeId: request.routeId,
    });
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
    requestSeqRef.current += 1;
    voiceOutput.stop();
    voiceInput.cancel();
    setAutoDetectedLanguage(language);
    setContextRouteId(null);
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
    requestSeqRef.current += 1;
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
                        language: speechLocaleFor(message.text),
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
              voiceLanguageOptions={[
                { value: "auto", label: micLabelSet.auto },
                { value: "en", label: "English" },
                { value: "ta", label: "தமிழ்" },
                { value: "hi", label: "हिन्दी" },
              ]}
              voiceLanguageValue={voiceLanguageOverride}
              voiceLanguageBadge={conversationLanguage.toUpperCase()}
              voiceLanguageMenuTitle={micLabelSet.voiceLanguage}
              onVoiceLanguageChange={(value) => {
                if (value === "auto" || isChatLanguage(value)) {
                  setVoiceLanguageOverride(value);
                }
              }}
              onStopSpeaking={voiceOutput.stop}
              stopSpeakingLabel={micLabelSet.stop}
              retryLabel={micLabelSet.retry}
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