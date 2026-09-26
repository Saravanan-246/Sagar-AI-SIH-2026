import { useEffect, useRef, type ReactNode } from "react";

import "./ChatWindow.css";

import ChatMessage from "./ChatMessage";
import ChatWelcome from "./ChatWelcome";
import ThinkingState from "./ThinkingState";
import type { ChatStructuredData } from "./ChatStructuredPanel";

export type ChatItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
  structured?: ChatStructuredData;
  /** Language this message was actually asked/answered in (e.g. "ta"). */
  language?: string;
  /** The real resolved area this answer is about, if any - never a
   * fallback/default name (see chatMapFocus's same-spirit resolution). */
  locationLabel?: string;
};

type ChatWindowProps = {
  messages: ChatItem[];
  loading?: boolean;
  thinkingLabel?: string;
  /** Real pipeline stages that apply to the pending question, shown as
   * pending (never checked/done) while `loading` is true. */
  thinkingStages?: string[];
  suggestions?: string[];
  onSuggestion?: (value: string) => void;
  renderVoiceControl?: (message: ChatItem) => ReactNode;
};

export default function ChatWindow({
  messages,
  loading = false,
  thinkingLabel,
  thinkingStages,
  suggestions,
  onSuggestion,
  renderVoiceControl,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the user is reading the latest message (vs scrolled up to
  // older ones) - only then do resizes pull the view to the bottom.
  const pinnedToBottom = useRef(true);

  // Scrolls only the conversation container. scrollIntoView would also
  // scroll every ancestor, including the page itself, which on mobile
  // shoves the whole layout (and the composer) out of place.
  const scrollToBottom = (behavior: ScrollBehavior) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useEffect(() => {
    pinnedToBottom.current = true;
    scrollToBottom("smooth");
  }, [messages, loading]);

  // Opening the keyboard shrinks this container; keep the newest
  // message in view instead of leaving it hidden behind the composer.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (pinnedToBottom.current) scrollToBottom("instant");
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="chat-window">
      <div className="chat-window-scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="chat-window-content">
          {isEmpty ? (
            <ChatWelcome
              suggestions={suggestions}
              onSuggestion={onSuggestion}
            />
          ) : (
            <div className="chat-message-list">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  timestamp={message.timestamp}
                  structured={message.structured}
                  locationLabel={message.locationLabel}
                  voiceControl={renderVoiceControl?.(message)}
                >
                  {message.text}
                </ChatMessage>
              ))}

              {loading && (
                <ThinkingState label={thinkingLabel} stages={thinkingStages} />
              )}
            </div>
          )}

          <div
            ref={bottomRef}
            className="chat-scroll-anchor"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
