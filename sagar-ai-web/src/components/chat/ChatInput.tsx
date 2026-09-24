import {
  ChangeEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Navigation,
  Plus,
} from "lucide-react";

import "./ChatInput.css";

export type MicState =
  | "idle"
  | "listening"
  | "processing"
  | "thinking"
  | "speaking"
  | "error";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;

  micSupported: boolean;
  micState: MicState;
  micLabel: string;
  onMicPress: () => void;

  onUseMyLocation: () => void;
  onChooseArea: () => void;
};

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Ask Sagar about sea conditions, alerts, fishing zones or routes...",
  micSupported,
  micState,
  micLabel,
  onMicPress,
  onUseMyLocation,
  onChooseArea,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const canSend = value.trim().length > 0 && !disabled;

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        menuRef.current?.contains(target) ||
        menuButtonRef.current?.contains(target)
      ) {
        return;
      }

      setMenuOpen(false);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const resizeTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
    resizeTextarea(event.target);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (canSend) {
        onSend();
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
          }
        });
      }
    }
  };

  const handleSend = () => {
    if (!canSend) return;

    onSend();

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    });
  };

  return (
    <div className="chat-input-wrap">
      <div
        className={`chat-input-box ${
          focused ? "chat-input-box-focused" : ""
        } ${disabled ? "chat-input-box-disabled" : ""}`}
      >
        <div className="chat-input-menu-wrap">
          <button
            ref={menuButtonRef}
            type="button"
            className={`chat-input-btn chat-input-add ${
              menuOpen ? "chat-input-add-open" : ""
            }`}
            aria-label="Location options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={disabled}
            onClick={() => setMenuOpen((open) => !open)}
            title="Location options"
          >
            <Plus size={18} strokeWidth={2.2} />
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              className="chat-input-menu"
              role="menu"
              aria-label="Location options"
            >
              <button
                type="button"
                role="menuitem"
                className="chat-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onUseMyLocation();
                }}
              >
                <Navigation size={15} strokeWidth={2} />
                <span>Use my location</span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="chat-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onChooseArea();
                }}
              >
                <MapPin size={15} strokeWidth={2} />
                <span>Choose a marine area</span>
              </button>
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          maxLength={4000}
          className="chat-textarea"
          aria-label="Message Sagar AI"
        />

        <div className="chat-input-actions">
          {micSupported && (
            <button
              type="button"
              className={`chat-input-btn chat-input-mic chat-input-mic-${micState}`}
              onClick={onMicPress}
              aria-label={micLabel}
              aria-pressed={micState === "listening"}
              title={micLabel}
              disabled={disabled}
            >
              {micState === "error" ? (
                <MicOff size={18} strokeWidth={2} />
              ) : micState === "processing" || micState === "thinking" ? (
                <Loader2
                  size={18}
                  strokeWidth={2}
                  className="chat-mic-spinner"
                />
              ) : (
                <Mic size={18} strokeWidth={2} />
              )}
            </button>
          )}

          <button
            type="button"
            className={`chat-input-btn chat-send ${
              canSend ? "chat-send-active" : ""
            }`}
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            title="Send message"
          >
            <ArrowUp size={18} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <p className="chat-input-hint" role="status" aria-live="polite">
        {micSupported && micState !== "idle"
          ? micLabel
          : micSupported
          ? "Press Enter to send · Shift + Enter for a new line"
          : "Press Enter to send · Voice input unavailable in this browser"}
      </p>
    </div>
  );
}