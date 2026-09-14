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
  action?: ReactNode | ActionObject;
};

export default function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this information right now. Please try again.",
  onRetry,
  action,
}: ErrorStateProps) {
  // Safe helper to render action whether it is JSX or an object with {label, onClick}
  const renderAction = () => {
    if (!action) return null;

    if (
      typeof action === "object" &&
      action !== null &&
      "label" in action &&
      !("$$typeof" in (action as any))
    ) {
      const actionObj = action as ActionObject;
      return (
        <button
          type="button"
          className="sagar-error-retry"
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
        <div className="sagar-error-icon">
          <AlertCircle size={21} strokeWidth={2} />
        </div>

        <h2 className="sagar-error-title">{title}</h2>

        <p className="sagar-error-message">{message}</p>

        {(onRetry || action) && (
          <div className="sagar-error-actions">
            {onRetry && (
              <button
                type="button"
                className="sagar-error-retry"
                onClick={onRetry}
              >
                <RefreshCw size={15} strokeWidth={2} />
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
          padding: 32px 20px;
          border: 1px solid #e6e4ec;
          border-radius: 18px;
          background: #ffffff;
          text-align: center;
        }

        .sagar-error-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          background: #fcebec;
          color: #d64545;
        }

        .sagar-error-title {
          margin: 15px 0 0;
          color: #16151d;
          font-size: 16px;
          line-height: 22px;
          font-weight: 800;
        }

        .sagar-error-message {
          max-width: 430px;
          margin: 7px 0 0;
          color: #676572;
          font-size: 12px;
          line-height: 19px;
        }

        .sagar-error-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 17px;
        }

        .sagar-error-retry {
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 0 13px;
          border: 1px solid #6d28d9;
          border-radius: 12px;
          background: #6d28d9;
          color: #ffffff;
          font: inherit;
          font-size: 11px;
          line-height: 1;
          font-weight: 700;
          cursor: pointer;
          transition:
            background-color 160ms ease,
            transform 160ms ease;
        }

        .sagar-error-retry:hover {
          background: #5b21b6;
        }

        .sagar-error-retry:active {
          transform: scale(0.98);
        }

        @media (max-width: 700px) {
          .sagar-error-state {
            min-height: 210px;
            padding: 26px 16px;
            border-radius: 16px;
          }

          .sagar-error-title {
            font-size: 15px;
          }

          .sagar-error-message {
            font-size: 11px;
            line-height: 18px;
          }
        }
      `}</style>
    </>
  );
}