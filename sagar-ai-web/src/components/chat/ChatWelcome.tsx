import { Waves } from "lucide-react";

import "./ChatWelcome.css";

const FALLBACK_SUGGESTIONS = [
  "Is it safe to venture into the sea tomorrow morning?",
  "Are there any lightning or cyclone alerts in my area?",
  "What are the sea conditions near my location?",
  "Which fishing zones should be avoided?",
];

type ChatWelcomeProps = {
  suggestions?: string[];
  onSuggestion?: (value: string) => void;
};

export default function ChatWelcome({
  suggestions = FALLBACK_SUGGESTIONS,
  onSuggestion,
}: ChatWelcomeProps) {
  return (
    <section className="chat-welcome">
      <div className="chat-welcome-inner">
        <div className="chat-welcome-icon" aria-hidden="true">
          <Waves size={22} strokeWidth={2} />
        </div>

        <h1 className="chat-welcome-title">Sagar AI</h1>

        <p className="chat-welcome-description">
          Marine intelligence for safer decisions at sea.
        </p>

        <div className="chat-suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="chat-suggestion"
              onClick={() => onSuggestion?.(suggestion)}
            >
              <span>{suggestion}</span>
              <span
                className="chat-suggestion-arrow"
                aria-hidden="true"
              >
                →
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
