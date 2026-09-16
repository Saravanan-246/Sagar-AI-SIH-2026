import type { ReactNode } from "react";

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
};

/** A short, glanceable local time (e.g. "12:09 PM") - the raw ISO
 * timestamp the backend sends is internal-looking and was never meant
 * to be read directly by a user. */
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

          {time && (
            <span className="chat-message-time chat-message-time-user">
              {time}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-message-row chat-message-row-assistant">
      <div className="chat-avatar" aria-hidden="true">
        S
      </div>

      <div className="chat-message-content chat-message-content-assistant">
        <span className="chat-assistant-name">Sagar AI</span>

        <div className="chat-assistant-text">{children}</div>

        {structured && <ChatStructuredPanel data={structured} />}

        <div className="chat-message-footer chat-message-footer-assistant">
          {time && (
            <span className="chat-message-time chat-message-time-assistant">
              {time}
            </span>
          )}

          {voiceControl}
        </div>
      </div>
    </div>
  );
}
