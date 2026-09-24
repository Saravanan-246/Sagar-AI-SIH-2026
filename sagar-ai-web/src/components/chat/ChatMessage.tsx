import type { ReactNode } from "react";
import "./ChatMessage.css";

import ChatStructuredPanel, {
  type ChatStructuredData,
} from "./ChatStructuredPanel";
import { formatTime12, isValidDate } from "../../utils/time";

type ChatMessageProps = {
  role: "user" | "assistant";
  children: ReactNode;
  timestamp?: string;
  structured?: ChatStructuredData;
  voiceControl?: ReactNode;
  /** The real configured area this answer is about, already resolved by
   * the caller - never a fallback/default name, and omitted entirely
   * when no area was actually resolved for this message. */
  locationLabel?: string;
};

/** A short, glanceable local time (e.g. "12:09 PM") */
function displayTime(timestamp?: string): string | null {
  if (!timestamp || !isValidDate(timestamp)) {
    return null;
  }

  return formatTime12(timestamp);
}

export default function ChatMessage({
  role,
  children,
  timestamp,
  structured,
  voiceControl,
  locationLabel,
}: ChatMessageProps) {
  const isUser = role === "user";
  const time = displayTime(timestamp);

  if (isUser) {
    return (
      <div className="chat-message-row chat-message-row-user">
        <div className="chat-message-content chat-message-content-user">
          <div className="chat-bubble chat-bubble-user">
            <div className="chat-bubble-text">{children}</div>
          </div>

          <div className="chat-message-footer chat-message-footer-user">
            {time && (
              <span className="chat-message-time chat-message-time-user">
                {time}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-message-row chat-message-row-assistant">
      <div className="chat-avatar" aria-hidden="true">
        <span className="chat-avatar-sparkle">S</span>
      </div>

      <div className="chat-message-content chat-message-content-assistant">
        <div className="chat-assistant-header">
          <span className="chat-assistant-name">Sagar AI</span>

          {locationLabel && (
            <span className="chat-location-badge">
              <svg
                className="chat-location-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {locationLabel}
            </span>
          )}
        </div>

        <div className="chat-assistant-text">{children}</div>

        {structured && <ChatStructuredPanel data={structured} />}

        <div className="chat-message-footer chat-message-footer-assistant">
          {time && (
            <span className="chat-message-time chat-message-time-assistant">
              {time}
            </span>
          )}

          {voiceControl && (
            <div className="chat-voice-wrapper">{voiceControl}</div>
          )}
        </div>
      </div>
    </div>
  );
}