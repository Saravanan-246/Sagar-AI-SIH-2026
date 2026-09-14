type LoadingStateProps = {
  label?: string;
  fullHeight?: boolean;
};

export default function LoadingState({
  label = "Loading",
  fullHeight = false,
}: LoadingStateProps) {
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
        aria-label={label}
      >
        <div className="sagar-loading-mark">
          <span />
          <span />
          <span />
        </div>

        <span className="sagar-loading-label">
          {label}
        </span>
      </div>

      <style>{`
        .sagar-loading-state {
          width: 100%;
          min-height: 180px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 11px;
        }

        .sagar-loading-full {
          min-height: 100%;
        }

        .sagar-loading-mark {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          height: 20px;
        }

        .sagar-loading-mark span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #6d28d9;
          animation: sagar-loading 1.1s ease-in-out infinite;
        }

        .sagar-loading-mark span:nth-child(2) {
          animation-delay: 0.14s;
        }

        .sagar-loading-mark span:nth-child(3) {
          animation-delay: 0.28s;
        }

        .sagar-loading-label {
          color: #9795a2;
          font-size: 11px;
          line-height: 15px;
          font-weight: 600;
        }

        @keyframes sagar-loading {
          0%,
          60%,
          100% {
            opacity: 0.3;
            transform: translateY(0);
          }

          30% {
            opacity: 1;
            transform: translateY(-3px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sagar-loading-mark span {
            animation: none;
            opacity: 0.55;
          }
        }

        @media (max-width: 700px) {
          .sagar-loading-state {
            min-height: 150px;
          }

          .sagar-loading-label {
            font-size: 10px;
          }
        }
      `}</style>
    </>
  );
}