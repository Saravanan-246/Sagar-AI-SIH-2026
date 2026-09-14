import type {
  InputHTMLAttributes,
  ReactNode,
} from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
};

export default function Input({
  label,
  hint,
  error,
  leading,
  id,
  className = "",
  ...props
}: InputProps) {
  const inputId = id ?? `sagar-input-${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  return (
    <div className="sagar-input-field">
      {label && (
        <label
          htmlFor={inputId}
          className="sagar-input-label"
        >
          {label}
        </label>
      )}

      <div
        className={[
          "sagar-input-wrap",
          error ? "sagar-input-wrap-error" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {leading && (
          <span className="sagar-input-leading">
            {leading}
          </span>
        )}

        <input
          id={inputId}
          className="sagar-input"
          aria-invalid={Boolean(error)}
          aria-describedby={
            error
              ? `${inputId}-error`
              : hint
                ? `${inputId}-hint`
                : undefined
          }
          {...props}
        />
      </div>

      {error && (
        <p
          id={`${inputId}-error`}
          className="sagar-input-error"
        >
          {error}
        </p>
      )}

      {!error && hint && (
        <p
          id={`${inputId}-hint`}
          className="sagar-input-hint"
        >
          {hint}
        </p>
      )}

      <style>{`
        .sagar-input-field {
          width: 100%;
          min-width: 0;
        }

        .sagar-input-label {
          display: block;
          margin-bottom: 7px;
          color: #676572;
          font-size: 11px;
          line-height: 15px;
          font-weight: 700;
        }

        .sagar-input-wrap {
          width: 100%;
          min-height: 44px;
          display: flex;
          align-items: center;
          box-sizing: border-box;
          border: 1px solid #e6e4ec;
          border-radius: 13px;
          background: #ffffff;
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease;
        }

        .sagar-input-wrap:focus-within {
          border-color: #8b5cf6;
          box-shadow:
            0 0 0 3px rgba(109, 40, 217, 0.10);
        }

        .sagar-input-wrap-error {
          border-color: #d64545;
        }

        .sagar-input-wrap-error:focus-within {
          border-color: #d64545;
          box-shadow:
            0 0 0 3px rgba(214, 69, 69, 0.10);
        }

        .sagar-input-leading {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-left: 11px;
          color: #9795a2;
        }

        .sagar-input {
          width: 100%;
          min-width: 0;
          min-height: 42px;
          padding: 10px 12px;
          border: 0;
          outline: 0;
          background: transparent;
          color: #16151d;
          font-family: inherit;
          font-size: 13px;
          line-height: 20px;
        }

        .sagar-input-leading + .sagar-input {
          padding-left: 8px;
        }

        .sagar-input::placeholder {
          color: #9795a2;
        }

        .sagar-input:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .sagar-input-hint,
        .sagar-input-error {
          margin: 6px 2px 0;
          font-size: 10px;
          line-height: 14px;
        }

        .sagar-input-hint {
          color: #9795a2;
        }

        .sagar-input-error {
          color: #d64545;
        }

        @media (max-width: 700px) {
          .sagar-input-wrap {
            min-height: 46px;
            border-radius: 12px;
          }

          .sagar-input {
            min-height: 44px;
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}