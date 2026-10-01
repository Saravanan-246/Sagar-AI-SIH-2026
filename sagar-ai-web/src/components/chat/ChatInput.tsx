import { useEffect, useRef, useState } from "react";
import "./ChatInput.css";

export type MicState =
  | "idle"
  | "listening"
  | "processing"
  | "ready"
  | "thinking"
  | "speaking"
  | "error";

export type VoiceLanguageOption = {
  value: string;
  /** Shown in the menu, in its own language ("தமிழ்", "हिन्दी"). */
  label: string;
};

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;

  micSupported: boolean;
  micUnavailableLabel?: string;
  micState: MicState;
  micLabel: string;
  onMicPress: () => void;

  onUseMyLocation: () => void;
  onChooseArea: () => void;

  /** Language the mic listens in - the browser recognizer must be told
   * before it starts. Optional so other composers need not offer it. */
  voiceLanguageOptions?: VoiceLanguageOption[];
  voiceLanguageValue?: string;
  /** Short code shown on the mic (e.g. "TA") so the user knows which
   * language it will listen for. */
  voiceLanguageBadge?: string;
  voiceLanguageMenuTitle?: string;
  onVoiceLanguageChange?: (value: string) => void;
  /** Stops Sagar reading a reply aloud. */
  onStopSpeaking?: () => void;
  stopSpeakingLabel?: string;
  retryLabel?: string;
  /** Whether the current voice error can be fixed by retrying; when
   * false (wrong browser, http page, …) the error offers Dismiss. */
  micRetryable?: boolean;
  onMicDismiss?: () => void;
  dismissLabel?: string;
};

// Voice states worth a visible line above the composer. "thinking" is
// already shown by the chat's own thinking bubble, "idle" needs nothing.
const VISIBLE_VOICE_STATES = new Set<MicState>([
  "listening",
  "processing",
  "ready",
  "speaking",
  "error",
]);

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Ask Sagar...",
  micSupported,
  micUnavailableLabel = "Voice input unavailable",
  micState,
  micLabel,
  onMicPress,
  onUseMyLocation,
  onChooseArea,
  voiceLanguageOptions,
  voiceLanguageValue,
  voiceLanguageBadge,
  voiceLanguageMenuTitle = "Voice language",
  onVoiceLanguageChange,
  onStopSpeaking,
  stopSpeakingLabel = "Stop",
  retryLabel = "Retry",
  micRetryable = true,
  onMicDismiss,
  dismissLabel = "Dismiss",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showActions, setShowActions] = useState(false);

  const canSend = value.trim().length > 0 && !disabled;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    // An empty box stays one line tall: Chrome counts a wrapped
    // placeholder in scrollHeight, which made the empty composer three
    // lines tall on a phone.
    if (!value) {
      textarea.style.overflowY = "hidden";
      return;
    }
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    // Scroll only once the cap is reached; otherwise sub-pixel rounding
    // shows an empty scrollbar track (a thin vertical line) on Android.
    textarea.style.overflowY = textarea.scrollHeight > 140 ? "auto" : "hidden";
  }, [value]);

  const isRecording = micState === "listening";
  const micText = !micSupported
    ? micUnavailableLabel
    : isRecording
      ? "Stop recording"
      : micLabel;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowActions(false);
      }
    };

    if (showActions) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showActions]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        onSend();
      }
    }
  };

  // An error is always shown - including "voice can't work here", which
  // a phone could otherwise only learn from a tooltip it never displays.
  const showVoiceStatus =
    VISIBLE_VOICE_STATES.has(micState) && (micSupported || micState === "error");

  return (
    <div className="sagar-input-area" ref={containerRef}>
      {showVoiceStatus && (
        <div
          className={`sagar-voice-status is-${micState}`}
          role="status"
          aria-live="polite"
        >
          <span className="sagar-voice-status-dot" aria-hidden="true" />
          <span className="sagar-voice-status-text">{micLabel}</span>
          {micState === "speaking" && onStopSpeaking && (
            <button type="button" onClick={onStopSpeaking}>
              {stopSpeakingLabel}
            </button>
          )}
          {micState === "error" &&
            (micRetryable || !onMicDismiss ? (
              <button type="button" onClick={onMicPress}>
                {retryLabel}
              </button>
            ) : (
              <button type="button" onClick={onMicDismiss}>
                {dismissLabel}
              </button>
            ))}
        </div>
      )}

      <div className="sagar-composer">
        <button
          type="button"
          className={`sagar-composer-action ${showActions ? "active" : ""}`}
          aria-label="More options"
          onClick={() => setShowActions((prev) => !prev)}
          disabled={disabled}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="sagar-textarea"
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          aria-label="Message Sagar"
        />

        <div className="sagar-composer-right">
          {/* Same button and handler in both states: while recording it
              becomes a filled Stop button, and onMicPress stops the
              recognizer (handleMicPress in Chat.tsx). */}
          {/* Stays tappable when voice can't work here: the tap reports
              the real reason in the status line above. */}
          <button
            type="button"
            className={`sagar-composer-action ${isRecording ? "is-recording" : ""} ${micSupported ? "" : "is-unavailable"}`}
            aria-label={micText}
            aria-pressed={isRecording}
            title={micText}
            onClick={onMicPress}
            disabled={disabled && !isRecording}
          >
            {isRecording ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect className="sagar-stop-icon" x="7" y="7" width="10" height="10" rx="2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
              </svg>
            )}
            {micSupported && voiceLanguageBadge && !isRecording && (
              <span className="sagar-mic-language" aria-hidden="true">
                {voiceLanguageBadge}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`sagar-send-button ${canSend ? "active" : ""}`}
            aria-label="Send message"
            onClick={onSend}
            disabled={!canSend}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        {showActions && (
          <div className="sagar-actions-menu">
            <button
              type="button"
              onClick={() => {
                onUseMyLocation();
                setShowActions(false);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              <span>Use my location</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onChooseArea();
                setShowActions(false);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15" />
              </svg>
              <span>Choose area</span>
            </button>

            {micSupported && voiceLanguageOptions && onVoiceLanguageChange && (
              <div className="sagar-actions-group" role="group" aria-label={voiceLanguageMenuTitle}>
                <div className="sagar-actions-group-title">{voiceLanguageMenuTitle}</div>
                <div className="sagar-voice-language-options">
                  {voiceLanguageOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={option.value === voiceLanguageValue ? "is-selected" : ""}
                      aria-pressed={option.value === voiceLanguageValue}
                      onClick={() => {
                        onVoiceLanguageChange(option.value);
                        setShowActions(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}