type LoadingStateProps = {
  label?: string;
  message?: string;
  fullHeight?: boolean;
};

export default function LoadingState({
  label,
  message,
  fullHeight = false,
}: LoadingStateProps) {
  const displayLabel = label ?? message ?? "Loading";

  return (
    <>
      <div
        className={[
          "sagar-loading-state",
          fullHeight ? "sagar-loading-full" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="status"
        aria-live="polite"
        aria-label={displayLabel}
      >
        <div className="sagar-loading-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <span className="sagar-loading-label">{displayLabel}</span>
      </div>

      <style>{`
        .sagar-loading-state {
          width: 100%;
          min-height: 180px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          box-sizing: border-box;
          user-select: none;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .sagar-loading-full {
          min-height: 100%;
          flex: 1 1 100%;
        }

        .sagar-loading-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 20px;
        }

        .sagar-loading-mark span {
          width: 6.5px;
          height: 6.5px;
          border-radius: 50%;
          background: #7c3aed;
          will-change: transform, opacity;
          animation: sagar-loading 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .sagar-loading-mark span:nth-child(2) {
          animation-delay: 0.16s;
        }

        .sagar-loading-mark span:nth-child(3) {
          animation-delay: 0.32s;
        }

        .sagar-loading-label {
          color: #64748b;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.01em;
          line-height: 1.4;
        }

        @keyframes sagar-loading {
          0%,
          80%,
          100% {
            opacity: 0.25;
            transform: scale(0.82) translateY(0);
          }
          40% {
            opacity: 1;
            transform: scale(1.12) translateY(-3px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sagar-loading-mark span {
            animation: none;
            opacity: 0.65;
            transform: none;
          }
        }

        @media (max-width: 640px) {
          .sagar-loading-state {
            min-height: 140px;
            gap: 10px;
          }

          .sagar-loading-mark span {
            width: 6px;
            height: 6px;
          }

          .sagar-loading-label {
            font-size: 12px;
          }
        }
      `}</style>
    </>
  );
}