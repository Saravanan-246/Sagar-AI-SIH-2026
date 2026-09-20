import { ChevronDown } from "lucide-react";
import {
  useId,
  type SelectHTMLAttributes,
} from "react";

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
};

export default function Select({
  label,
  hint,
  error,
  options,
  id,
  className = "",
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="sagar-select-field">
      {label && (
        <label htmlFor={selectId} className="sagar-select-label">
          {label}
        </label>
      )}

      <div
        className={[
          "sagar-select-wrap",
          error ? "sagar-select-wrap-error" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <select
          id={selectId}
          className={`sagar-select ${className}`}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error
              ? `${selectId}-error`
              : hint
                ? `${selectId}-hint`
                : undefined
          }
          {...props}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>

        <span className="sagar-select-arrow" aria-hidden="true">
          <ChevronDown size={16} strokeWidth={2} />
        </span>
      </div>

      {error && (
        <p id={`${selectId}-error`} className="sagar-select-error" role="alert">
          {error}
        </p>
      )}

      {!error && hint && (
        <p id={`${selectId}-hint`} className="sagar-select-hint">
          {hint}
        </p>
      )}

      <style>{`
        .sagar-select-field {
          width: 100%;
          min-width: 0;
          display: flex;
          flex-direction: column;
          text-align: left;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .sagar-select-label {
          display: block;
          margin-bottom: 6px;
          color: #334155;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.3;
          letter-spacing: -0.01em;
          user-select: none;
        }

        .sagar-select-wrap {
          position: relative;
          width: 100%;
          min-height: 42px;
          display: flex;
          align-items: center;
          border-radius: 10px;
        }

        .sagar-select {
          appearance: none;
          -webkit-appearance: none;
          width: 100%;
          min-height: 42px;
          padding: 0 40px 0 13px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          outline: none;
          background-color: #ffffff;
          color: #0f172a;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.5;
          letter-spacing: -0.01em;
          cursor: pointer;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition:
            border-color 140ms cubic-bezier(0.4, 0, 0.2, 1),
            box-shadow 140ms cubic-bezier(0.4, 0, 0.2, 1),
            background-color 140ms ease;
        }

        .sagar-select:hover:not(:disabled) {
          border-color: #94a3b8;
        }

        .sagar-select:focus {
          border-color: #7c3aed;
          box-shadow: 0 0 0 1px #7c3aed, 0 0 0 4px rgba(124, 58, 237, 0.12);
        }

        .sagar-select:disabled {
          cursor: not-allowed;
          background-color: #f8fafc;
          border-color: #e2e8f0;
          color: #94a3b8;
          box-shadow: none;
        }

        .sagar-select-wrap-error .sagar-select {
          border-color: #ef4444;
          background-color: #fffcfc;
        }

        .sagar-select-wrap-error .sagar-select:hover:not(:disabled) {
          border-color: #dc2626;
        }

        .sagar-select-wrap-error .sagar-select:focus {
          border-color: #dc2626;
          box-shadow: 0 0 0 1px #dc2626, 0 0 0 4px rgba(220, 38, 38, 0.12);
        }

        .sagar-select-arrow {
          position: absolute;
          top: 50%;
          right: 12px;
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          pointer-events: none;
          transform: translateY(-50%);
          transition: color 140ms ease;
        }

        .sagar-select:focus + .sagar-select-arrow {
          color: #7c3aed;
        }

        .sagar-select:disabled ~ .sagar-select-arrow {
          color: #cbd5e1;
        }

        .sagar-select-hint,
        .sagar-select-error {
          margin: 6px 2px 0;
          font-size: 12px;
          line-height: 1.4;
          letter-spacing: -0.005em;
        }

        .sagar-select-hint {
          color: #64748b;
        }

        .sagar-select-error {
          color: #dc2626;
          font-weight: 500;
        }

        /* Prevent auto-zoom in mobile Safari with font-size >= 16px */
        @media (max-width: 640px) {
          .sagar-select-wrap {
            min-height: 44px;
          }

          .sagar-select {
            min-height: 44px;
            font-size: 16px;
            padding: 0 38px 0 12px;
          }

          .sagar-select-label {
            font-size: 12.5px;
          }

          .sagar-select-hint,
          .sagar-select-error {
            font-size: 11.5px;
          }
        }
      `}</style>
    </div>
  );
}