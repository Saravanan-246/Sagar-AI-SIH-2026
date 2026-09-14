export default function ThinkingState() {
  return (
    <div className="thinking-state" aria-live="polite">
      <div className="thinking-avatar" aria-hidden="true">
        S
      </div>

      <div className="thinking-content">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
    </div>
  );
}