import {
  ChangeEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArrowUp, MapPin, MicOff, Mic, Navigation, Plus } from "lucide-react";

import "./ChatInput.css";

export type MicState = "idle" | "listening" | "thinking" | "speaking" | "error";

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
  placeholder = "Ask Sagar anything...",
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
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
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
      <div className={`chat-input ${focused ? "chat-input-focused" : ""}`}>
        <div className="chat-input-menu-wrap">
          <button
            ref={menuButtonRef}
            type="button"
            className={`chat-input-add ${menuOpen ? "chat-input-add-open" : ""}`}
            aria-label="Location actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={disabled}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Plus size={19} strokeWidth={2} />
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              className="chat-input-menu"
              role="menu"
              aria-label="Location actions"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onUseMyLocation();
                }}
              >
                <Navigation size={14} strokeWidth={2} />
                Use my location
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onChooseArea();
                }}
              >
                <MapPin size={14} strokeWidth={2} />
                Choose a marine area
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
          aria-label="Message Sagar"
        />

        {micSupported && (
          <button
            type="button"
            className={`chat-input-mic chat-input-mic-${micState}`}
            onClick={onMicPress}
            aria-label={micLabel}
            title={micLabel}
          >
            {micState === "error" ? (
              <MicOff size={18} strokeWidth={2} />
            ) : (
              <Mic size={18} strokeWidth={2} />
            )}
          </button>
        )}

        <button
          type="button"
          className={`chat-send ${canSend ? "chat-send-active" : ""}`}
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
        >
          <ArrowUp size={19} strokeWidth={2.4} />
        </button>
      </div>

      <p className="chat-input-hint">
        {micSupported && micState !== "idle"
          ? micLabel
          : "Enter to send · Shift + Enter for a new line"}
      </p>
    </div>
  );
}