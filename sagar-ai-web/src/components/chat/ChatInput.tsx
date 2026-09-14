import {
  KeyboardEvent,
  useRef,
  useState,
} from "react";
import { ArrowUp, Plus } from "lucide-react";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
};

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Ask Sagar anything...",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const canSend =
    value.trim().length > 0 && !disabled;

  const resizeTextarea = (
    element: HTMLTextAreaElement
  ) => {
    element.style.height = "auto";
    element.style.height = `${Math.min(
      element.scrollHeight,
      140
    )}px`;
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const nextValue = event.target.value;

    onChange(nextValue);
    resizeTextarea(event.target);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
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
      <div
        className={`chat-input ${
          focused ? "chat-input-focused" : ""
        }`}
      >
        <button
          type="button"
          className="chat-input-add"
          aria-label="Add context"
          disabled={disabled}
        >
          <Plus size={19} strokeWidth={2} />
        </button>

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
        />

        <button
          type="button"
          className={`chat-send ${
            canSend ? "chat-send-active" : ""
          }`}
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
        >
          <ArrowUp size={19} strokeWidth={2.4} />
        </button>
      </div>

      <p className="chat-input-hint">
        Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}