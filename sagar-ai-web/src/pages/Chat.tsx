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

const VOICE_LANGUAGE_OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "ta", label: "தமிழ்" },
  { value: "hi", label: "हिन्दी" },
];

type MicState = "idle" | "listening" | "thinking" | "speaking" | "error";

function getThinkingLabel(lastUserMessage: string | null): string {
  if (!lastUserMessage) {
    return "Sagar is checking marine conditions…";
  }

  const text = lastUserMessage.toLowerCase();

  if (/\broute|path|passage|sail\b/.test(text)) {
    return "Sagar is plotting the safest route…";
  }

  if (/\bzone|fishing|pfz\b/.test(text)) {
    return "Sagar is scanning fishing zones…";
  }

  if (/\bwind|storm|cyclone|weather|what if\b/.test(text)) {
    return "Sagar is modelling the scenario…";
  }

  if (/\balert|warning\b/.test(text)) {
    return "Sagar is checking active alerts…";
  }

  return "Sagar is checking marine conditions…";
}

export default function Chat() {
  const navigate = useNavigate();

  /*
   * A clarification chip needs to retry the question after the location
   * is set, but retryLastQuestion comes from the very hook these
   * handlers are passed into - the refs break that cycle without
   * re-creating the hook on every render.
   */
  const retryRef = useRef<(() => void) | null>(null);
  const requestLocationRef = useRef<(() => Promise<boolean>) | null>(null);

  // Set when the user opened the area picker from a chat chip, so
  // picking an area re-asks the question instead of leaving it hanging.
  const retryAfterAreaSelectRef = useRef(false);

  const handleClarifyUseMyLocation = useCallback(async () => {
    setLocationNotice(null);
    setAreaPickerOpen(false);

    const granted = await requestLocationRef.current?.();

    if (granted) {
      retryRef.current?.();
      return;
    }

    // Requirement of the browser permission model: we can offer the
    // area picker, but we can never re-prompt once it is blocked.
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
  const [locationNotice, setLocationNotice] = useState<string | null>(
    null,
  );

  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [savedChats, setSavedChats] = useState<SavedChat[]>(() =>
    listSavedChats(),
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const locationLabel = useAppStore((state) => state.locationLabel);
  const setSelectedArea = useAppStore((state) => state.setSelectedArea);
  const clearLocation = useAppStore((state) => state.clearLocation);
  const selectedAreaId = useAppStore((state) => state.selectedAreaId);
  const currentLocation = useAppStore((state) => state.currentLocation);
  const locationPermission = useAppStore((state) => state.locationPermission);

  const { requestLocation, status: locationStatus } = useUserLocation();

  useEffect(() => {
    requestLocationRef.current = requestLocation;
  }, [requestLocation]);

  const voiceOutput = useVoiceOutput();

  /*
   * TTS is an optional enhancement, not a chat failure - the text
   * answer already succeeded regardless of whether it can be read
   * aloud. This is a small, self-dismissing toast (never the same
   * bold banner a real send/network error gets) so a voice hiccup
   * never reads as "the app is broken". Re-shows and restarts its
   * timer on every new voiceOutput "error" transition; manual
   * dismiss closes it early.
   */
  const [voiceToastVisible, setVoiceToastVisible] = useState(false);

  useEffect(() => {
    if (voiceOutput.status !== "error") {
      return;
    }

    setVoiceToastVisible(true);

    const timer = window.setTimeout(() => {
      setVoiceToastVisible(false);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [voiceOutput.status]);

  const locale = LOCALE_BY_LANGUAGE[language] ?? "en-IN";

  const marineAreas = useMemo(() => getMarineAreas(), []);

  // Deterministic, local-data-only suggestions (no AI call) that change
  // with the selected area/location and interaction language.
  const suggestions = useMemo(
    () =>
      getSuggestedQuestions({
        areaId: selectedAreaId,
        coordinates: currentLocation,
        language,
      }),
    [selectedAreaId, currentLocation, language],
  );

  const handleVoiceTranscript = (transcript: string) => {
    setInput(transcript);
    void submitMessage(transcript, { spokenAloud: true });
  };

  const voiceInput = useVoiceInput({
    language: locale,
    onResult: handleVoiceTranscript,
  });

  const micState: MicState =
    voiceInput.status === "listening"
      ? "listening"
      : voiceInput.status === "error"
        ? "error"
        : loading
          ? "thinking"
          : voiceOutput.status === "speaking"
            ? "speaking"
            : "idle";

  const VOICE_ERROR_LABEL: Record<string, string> = {
    denied: "Mic permission blocked — allow it in your browser, then tap to retry",
    "no-speech": "Didn't catch that — tap to try again",
    unsupported: "Voice input isn't supported in this browser",
    network: "Voice recognition needs an internet connection — tap to retry",
    unknown: "Couldn't hear that — tap to retry",
  };

  const micLabel: Record<MicState, string> = {
    idle: "Tap to speak",
    listening: "Listening…",
    thinking: "Sagar is analyzing…",
    speaking: "Sagar is responding…",
    error:
      VOICE_ERROR_LABEL[voiceInput.errorReason ?? "unknown"] ??
      VOICE_ERROR_LABEL.unknown,
  };

  /*
   * One compact line covering the distinct location states: none,
   * using the device location (with the supported area the backend
   * resolved it to, once known), a manually selected area, or blocked.
   * The raw coordinates are never shown.
   */
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

  const chatMessages: ChatItem[] = messages.map(
    (message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      timestamp: message.timestamp,
      structured: message.structured,
      language: message.language,
    }),
  );

  // The map only ever reflects the most recent answer that actually
  // resolved something map-relevant (route/zone/alert/area) - a purely
  // conversational reply leaves the map exactly as it was, per the
  // requirement not to force a map update into every message.
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

  const thinkingLabel = useMemo(
    () => getThinkingLabel(lastUserMessage),
    [lastUserMessage],
  );

  const activeChat = currentChatId
    ? (savedChats.find((chat) => chat.id === currentChatId) ?? null)
    : null;

  const headerTitle = activeChat?.title ?? "Sagar AI";

  const localeForMessage = (messageLanguage?: string) =>
    LOCALE_BY_LANGUAGE[(messageLanguage as AppLanguage) ?? language] ?? locale;

  const submitMessage = async (
    value: string,
    options: { spokenAloud?: boolean } = {},
  ) => {
    const text = value.trim();

    if (!text || loading) {
      return;
    }

    // "Use my current location" is a location command, not a marine
    // question - browser geolocation permission also requires this
    // direct user-gesture path rather than an AI classification
    // round-trip.
    if (/\buse (my )?(current )?location\b/i.test(text)) {
      setInput("");
      await handleUseMyLocation();
      return;
    }

    // "Set location to X" / "check near X" / "show ... near X" - resolve
    // deterministically against the configured marine areas and persist
    // it as the working location, then still let the question through.
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

  // Always-current snapshot for the autosave effect below, so it never
  // needs these values in its dependency array (which would re-fire it
  // on every unrelated change) or reads them stale.
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

  // Opening a saved conversation shouldn't re-save it (that would just
  // bump its recency for no reason) - this flag skips exactly one
  // autosave pass right after restoreMessages runs.
  const skipAutosaveRef = useRef(false);

  /*
   * Sagar conversations autosave as they happen, the way a modern chat
   * app does - reusing the exact same saveChat/listSavedChats utilities
   * the app already had for manual saving, just triggered automatically
   * instead of via a button.
   */
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
    if (micState === "listening") {
      voiceInput.stop();
      return;
    }

    if (voiceOutput.status === "speaking") {
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

    // Only auto-retry when the picker was opened from a chat
    // clarification - changing area mid-conversation from elsewhere
    // should not silently re-send the previous question.
    if (area && retryAfterAreaSelectRef.current) {
      retryAfterAreaSelectRef.current = false;
      retryRef.current?.();
    }
  };

  // Mobile drawer: lock background scroll and allow Escape to close.
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
    <div className="chat-shell">
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
        language={language}
        languageOptions={VOICE_LANGUAGE_OPTIONS}
        onSetLanguage={setLanguage}
        voiceSupported={voiceInput.isSupported}
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
            thinkingLabel={thinkingLabel}
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
              <span>Voice playback unavailable on this device.</span>
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
            placeholder="Message Sagar about sea conditions, alerts, fishing zones or routes..."
            micSupported={voiceInput.isSupported}
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
