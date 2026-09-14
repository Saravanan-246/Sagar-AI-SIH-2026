import type { ReactNode } from "react";

import ChatStructuredPanel, {
  type ChatStructuredData,
} from "./ChatStructuredPanel";

type ChatMessageProps = {
  role: "user" | "assistant";
  children: ReactNode;
  timestamp?: string;
  structured?: ChatStructuredData;
  voiceControl?: ReactNode;
};

export default function ChatMessage({
  role,
  children,
  timestamp,
  structured,
  voiceControl,
}: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={`chat-message-row ${
        isUser ? "chat-message-row-user" : "chat-message-row-assistant"
      }`}
    >
      {!isUser && (
        <div className="chat-avatar" aria-hidden="true">
          S
        </div>
      )}

      <div
        className={`chat-message-content ${
          isUser
            ? "chat-message-content-user"
            : "chat-message-content-assistant"
        }`}
      >
        <div
          className={`chat-bubble ${
            isUser ? "chat-bubble-user" : "chat-bubble-assistant"
          }`}
        >
          <div className="chat-bubble-text">{children}</div>

          {!isUser && structured && (
            <ChatStructuredPanel data={structured} />
          )}
        </div>

        <div
          className={`chat-message-footer ${
            isUser
              ? "chat-message-footer-user"
              : "chat-message-footer-assistant"
          }`}
        >
          {timestamp && (
            <span
              className={`chat-message-time ${
                isUser
                  ? "chat-message-time-user"
                  : "chat-message-time-assistant"
              }`}
            >
              {timestamp}
            </span>
          )}

          {!isUser && voiceControl}
        </div>
      </div>
    </div>
  );
}