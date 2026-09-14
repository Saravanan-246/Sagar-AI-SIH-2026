import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Compass,
  Fish,
  Mic,
  MicOff,
  Navigation,
  Pause,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Button from "../components/ui/Button";
import ChatInput from "../components/chat/ChatInput";
import ChatWindow from "../components/chat/ChatWindow";
import type { ChatItem } from "../components/chat/ChatWindow";
import useSagar from "../hooks/useSagar";
import { useUserLocation } from "../hooks/useUserLocation";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { useVoiceOutput } from "../hooks/useVoiceOutput";
import { getMarineAreas } from "../services/marine/marineData";
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

type MicState = "idle" | "listening" | "thinking" | "speaking" | "error";

export default function Chat() {
  const navigate = useNavigate();

  const {
    messages,
    loading,
    error,
    sendMessage,
    clearConversation,
  } = useSagar();

  const [input, setInput] = useState("");
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(
    null,
  );

  const language = useAppStore((state) => state.language);
  const locationLabel = useAppStore((state) => state.locationLabel);
  const setSelectedArea = useAppStore((state) => state.setSelectedArea);
  const clearLocation = useAppStore((state) => state.clearLocation);

  const { requestLocation, status: locationStatus } = useUserLocation();

  const voiceOutput = useVoiceOutput();

  const locale = LOCALE_BY_LANGUAGE[language] ?? "en-IN";

  const marineAreas = useMemo(() => getMarineAreas(), []);

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

  const micLabel: Record<MicState, string> = {
    idle: "Tap to speak",
    listening: "Listening…",
    thinking: "Sagar is analyzing…",
    speaking: "Sagar is responding…",
    error: "Couldn't hear that — tap to retry",
  };

  const chatMessages: ChatItem[] = messages.map(
    (message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      timestamp: message.timestamp,
      structured: message.structured,
    }),
  );

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
        language: locale,
      });
    }
  };

  const handleSend = () => submitMessage(input);

  const handleSuggestion = (value: string) => {
    setInput(value);
  };

  const handleClear = () => {
    clearConversation();
    setInput("");
    voiceOutput.stop();
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
        "Location permission is unavailable. Choose a marine area instead.",
      );
      setAreaPickerOpen(true);
    }
  };

  const handleSelectArea = (areaId: string) => {
    const area = marineAreas.find((item) => item.id === areaId);

    if (area) {
      setSelectedArea(area.id, area.name);
      setLocationNotice(null);
    }

    setAreaPickerOpen(false);
  };

  return (
    <AppShell>
      <PageContainer
        className="chat-page"
        fullHeight
      >
        <section className="chat-page-shell">
          <header className="chat-page-header">
            <div className="chat-page-heading">
              <button
                type="button"
                className="chat-back-button"
                onClick={() =>
                  navigate(ROUTES.HOME)
                }
                aria-label="Back to home"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="chat-page-avatar">
                <Bot size={18} />
              </div>

              <div>
                <div className="chat-page-title-row">
                  <h1>Ask Sagar</h1>

                  <span className="chat-online">
                    <i />
                    Ready
                  </span>
                </div>

                <p>
                  Marine intelligence for safer
                  decisions at sea.
                </p>
              </div>
            </div>

            {chatMessages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
              >
                <RotateCcw size={15} />
                New conversation
              </Button>
            )}
          </header>

          <div className="chat-location-bar">
            <div className="chat-location-status">
              <Compass size={13} />
              <span>
                {locationLabel
                  ? locationLabel
                  : "No location set"}
              </span>
            </div>

            <div className="chat-location-actions">
              <button
                type="button"
                className="chat-location-chip"
                onClick={handleUseMyLocation}
                disabled={locationStatus === "requesting"}
              >
                {locationStatus === "requesting"
                  ? "Locating…"
                  : "Use my location"}
              </button>

              <button
                type="button"
                className="chat-location-chip"
                onClick={() =>
                  setAreaPickerOpen((open) => !open)
                }
              >
                Select area
              </button>

              {locationLabel && (
                <button
                  type="button"
                  className="chat-location-chip chat-location-chip-ghost"
                  onClick={clearLocation}
                >
                  Clear
                </button>
              )}
            </div>

            {areaPickerOpen && (
              <div className="chat-area-picker">
                {marineAreas.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() =>
                      handleSelectArea(area.id)
                    }
                  >
                    {area.name}
                  </button>
                ))}
              </div>
            )}

            {locationNotice && (
              <p className="chat-location-notice">
                {locationNotice}
              </p>
            )}
          </div>

          <div className="chat-quick-actions">
            <button
              type="button"
              onClick={() => navigate(ROUTES.ALERTS)}
            >
              <AlertTriangle size={13} />
              Show alerts
            </button>

            <button
              type="button"
              onClick={() =>
                submitMessage(
                  "Which fishing zone is best right now?",
                )
              }
            >
              <Fish size={13} />
              Find fishing zone
            </button>

            <button
              type="button"
              onClick={() =>
                submitMessage("Give me the safest route.")
              }
            >
              <Navigation size={13} />
              Find safest route
            </button>
          </div>

          <div className="chat-page-content">
            <ChatWindow
              messages={chatMessages}
              loading={loading}
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
                        language: locale,
                      })
                    }
                    aria-label="Speak this response"
                  >
                    <Volume2 size={12} />
                    Speak
                  </button>
                );
              }}
            />
          </div>

          <div className="chat-page-composer">
            {error && (
              <div className="chat-error">
                <AlertTriangle size={15} />
                <span>{error}</span>
              </div>
            )}

            <div className="chat-composer-row">
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                disabled={loading}
                placeholder="Ask Sagar about sea conditions, alerts, fishing zones or routes..."
              />

              {voiceInput.isSupported && (
                <button
                  type="button"
                  className={`chat-mic-button chat-mic-${micState}`}
                  onClick={handleMicPress}
                  aria-label={micLabel[micState]}
                  title={micLabel[micState]}
                >
                  {micState === "error" ? (
                    <MicOff size={20} />
                  ) : (
                    <Mic size={20} />
                  )}
                </button>
              )}
            </div>

            <div className="chat-composer-footer">
              <div className="chat-composer-hint">
                <Sparkles size={13} />
                <span>
                  {voiceInput.isSupported
                    ? micLabel[micState]
                    : "Ask naturally. Sagar will use the available marine context."}
                </span>
              </div>

              <span className="chat-composer-shortcut">
                Enter to send
              </span>
            </div>
          </div>
        </section>
      </PageContainer>
    </AppShell>
  );
}
