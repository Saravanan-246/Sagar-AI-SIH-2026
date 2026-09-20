import { AlertCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

type ActionObject = {
  label: string;
  onClick?: () => void;
};

type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retry?: () => void;
  action?: ReactNode | ActionObject;
};

export default function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this information right now. Please try again.",
  onRetry,
  retry,
  action,
}: ErrorStateProps) {
  const handleRetry = onRetry ?? retry;

  const renderAction = () => {
    if (!action) return null;

    if (
      typeof action === "object" &&
      action !== null &&
      "label" in action &&
      !("$$typeof" in (action as Record<string, unknown>))
    ) {
      const actionObj = action as ActionObject;
      return (
        <button
          type="button"
          className="sagar-error-action-btn"
          onClick={actionObj.onClick}
        >
          {actionObj.label}
        </button>
      );
    }

    return action as ReactNode;
  };

  return (
    <>
      <section className="sagar-error-state" role="alert">
        <div className="sagar-error-icon" aria-hidden="true">
          <AlertCircle size={22} strokeWidth={1.8} />
        </div>

        <h2 className="sagar-error-title">{title}</h2>

        <p className="sagar-error-message">{message}</p>

        {(handleRetry || action) && (
          <div className="sagar-error-actions">
            {handleRetry && (
              <button
                type="button"
                className="sagar-error-retry"
                onClick={handleRetry}
              >
                <RefreshCw size={14} strokeWidth={2} />
                Try again
              </button>
            )}

            {renderAction()}
          </div>
        )}
      </section>

      <style>{`
        .sagar-error-state {
          width: 100%;
          min-height: 240px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: 36px 20px;
          text-align: center;
          border: 1px solid #fecaca;
          border-radius: 14px;
          background: #fef2f2;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .sagar-error-icon {
          width: 48px;
          height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #dc2626;
          box-shadow: 0 1px 2px rgba(220, 38, 38, 0.08);
        }

        .sagar-error-title {
          margin: 14px 0 0;
          color: #991b1b;
          font-size: 15px;
          font-weight: 600;
          line-height: 1.4;
          letter-spacing: -0.01em;
        }

        .sagar-error-message {
          max-width: 380px;
          margin: 6px 0 0;
          color: #7f1d1d;
          font-size: 13px;
          line-height: 1.5;
          text-wrap: balance;
        }

        .sagar-error-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
        }

        .sagar-error-retry {
          appearance: none;
          -webkit-appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          height: 38px;
          padding: 0 16px;
          border: 1px solid #b91c1c;
          border-radius: 8px;
          background: #dc2626;
          color: #ffffff;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          line-height: 1;
          letter-spacing: -0.01em;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          box-shadow: 0 1px 2px rgba(220, 38, 38, 0.16);
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            transform 100ms ease,
            box-shadow 140ms ease;
        }

        .sagar-error-retry:hover {
          background: #b91c1c;
          border-color: #991b1b;
          box-shadow: 0 2px 6px rgba(220, 38, 38, 0.22);
        }

        .sagar-error-retry:active {
          transform: scale(0.985);
        }

        .sagar-error-retry:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #dc2626;
        }

        .sagar-error-action-btn {
          appearance: none;
          -webkit-appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 38px;
          padding: 0 16px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #ffffff;
          color: #1e293b;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          line-height: 1;
          letter-spacing: -0.01em;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            transform 100ms ease;
        }

        .sagar-error-action-btn:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .sagar-error-action-btn:active {
          transform: scale(0.985);
        }

        .sagar-error-action-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #7c3aed;
        }

        @media (max-width: 640px) {
          .sagar-error-state {
            min-height: 200px;
            padding: 28px 16px;
            border-radius: 12px;
          }

          .sagar-error-icon {
            width: 44px;
            height: 44px;
            border-radius: 10px;
          }

          .sagar-error-title {
            font-size: 14px;
          }

          .sagar-error-message {
            font-size: 12.5px;
            max-width: 320px;
          }

          .sagar-error-actions {
            flex-direction: column;
            width: 100%;
          }

          .sagar-error-retry,
          .sagar-error-action-btn {
            width: 100%;
            height: 42px;
            font-size: 13.5px;
          }
        }
      `}</style>
    </>
  );
}