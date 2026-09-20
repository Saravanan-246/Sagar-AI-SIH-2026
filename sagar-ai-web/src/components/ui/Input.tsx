import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
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
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="sagar-input-field">
      {label && (
        <label htmlFor={inputId} className="sagar-input-label">
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
          <span className="sagar-input-leading" aria-hidden="true">
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
        <p id={`${inputId}-error`} className="sagar-input-error" role="alert">
          {error}
        </p>
      )}

      {!error && hint && (
        <p id={`${inputId}-hint`} className="sagar-input-hint">
          {hint}
        </p>
      )}

      <style>{`
        .sagar-input-field {
          width: 100%;
          min-width: 0;
          display: flex;
          flex-direction: column;
          text-align: left;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .sagar-input-label {
          display: block;
          margin-bottom: 6px;
          color: #334155;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.3;
          letter-spacing: -0.01em;
          user-select: none;
        }

        .sagar-input-wrap {
          width: 100%;
          min-height: 42px;
          display: flex;
          align-items: center;
          box-sizing: border-box;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
          transition:
            border-color 140ms cubic-bezier(0.4, 0, 0.2, 1),
            box-shadow 140ms cubic-bezier(0.4, 0, 0.2, 1),
            background-color 140ms ease;
        }

        .sagar-input-wrap:focus-within {
          border-color: #7c3aed;
          box-shadow: 0 0 0 1px #7c3aed, 0 0 0 4px rgba(124, 58, 237, 0.12);
        }

        .sagar-input-wrap-error {
          border-color: #ef4444;
          background: #fffcfc;
        }

        .sagar-input-wrap-error:focus-within {
          border-color: #dc2626;
          box-shadow: 0 0 0 1px #dc2626, 0 0 0 4px rgba(220, 38, 38, 0.12);
        }

        .sagar-input-leading {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding-left: 12px;
          color: #64748b;
          pointer-events: none;
        }

        .sagar-input {
          width: 100%;
          min-width: 0;
          height: 40px;
          padding: 0 13px;
          border: 0;
          outline: 0;
          background: transparent;
          color: #0f172a;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.5;
          letter-spacing: -0.01em;
          -webkit-appearance: none;
        }

        .sagar-input-leading + .sagar-input {
          padding-left: 9px;
        }

        .sagar-input::placeholder {
          color: #94a3b8;
        }

        .sagar-input:disabled {
          cursor: not-allowed;
          color: #94a3b8;
        }

        .sagar-input-wrap:has(.sagar-input:disabled) {
          background: #f8fafc;
          border-color: #e2e8f0;
          box-shadow: none;
        }

        .sagar-input-hint,
        .sagar-input-error {
          margin: 6px 2px 0;
          font-size: 12px;
          line-height: 1.4;
          letter-spacing: -0.005em;
        }

        .sagar-input-hint {
          color: #64748b;
        }

        .sagar-input-error {
          color: #dc2626;
          font-weight: 500;
        }

        /* Prevent iOS Safari auto-zoom on focus by keeping font-size >= 16px */
        @media (max-width: 640px) {
          .sagar-input-wrap {
            min-height: 44px;
            border-radius: 10px;
          }

          .sagar-input {
            height: 42px;
            font-size: 16px;
            padding: 0 12px;
          }

          .sagar-input-leading + .sagar-input {
            padding-left: 8px;
          }

          .sagar-input-label {
            font-size: 12.5px;
          }

          .sagar-input-hint,
          .sagar-input-error {
            font-size: 11.5px;
          }
        }
      `}</style>
    </div>
  );
}