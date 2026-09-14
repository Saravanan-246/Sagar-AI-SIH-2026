import { ChevronDown } from "lucide-react";
import type {
  SelectHTMLAttributes,
} from "react";

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps =
  SelectHTMLAttributes<HTMLSelectElement> & {
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
  const selectId =
    id ??
    `sagar-select-${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  return (
    <div className="sagar-select-field">
      {label && (
        <label
          htmlFor={selectId}
          className="sagar-select-label"
        >
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

        <span
          className="sagar-select-arrow"
          aria-hidden="true"
        >
          <ChevronDown
            size={17}
            strokeWidth={2}
          />
        </span>
      </div>

      {error && (
        <p
          id={`${selectId}-error`}
          className="sagar-select-error"
        >
          {error}
        </p>
      )}

      {!error && hint && (
        <p
          id={`${selectId}-hint`}
          className="sagar-select-hint"
        >
          {hint}
        </p>
      )}

      <style>{`
        .sagar-select-field {
          width: 100%;
          min-width: 0;
        }

        .sagar-select-label {
          display: block;
          margin-bottom: 7px;
          color: #676572;
          font-size: 11px;
          line-height: 15px;
          font-weight: 700;
        }

        .sagar-select-wrap {
          position: relative;
          width: 100%;
          min-height: 44px;
        }

        .sagar-select {
          appearance: none;
          -webkit-appearance: none;
          width: 100%;
          min-height: 44px;
          padding: 10px 40px 10px 12px;
          border: 1px solid #e6e4ec;
          border-radius: 13px;
          outline: none;
          background: #ffffff;
          color: #16151d;
          font-family: inherit;
          font-size: 13px;
          line-height: 20px;
          cursor: pointer;
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease;
        }

        .sagar-select:hover:not(:disabled) {
          border-color: #d5d2df;
        }

        .sagar-select:focus {
          border-color: #8b5cf6;
          box-shadow:
            0 0 0 3px rgba(109, 40, 217, 0.10);
        }

        .sagar-select:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .sagar-select-wrap-error .sagar-select {
          border-color: #d64545;
        }

        .sagar-select-wrap-error .sagar-select:focus {
          border-color: #d64545;
          box-shadow:
            0 0 0 3px rgba(214, 69, 69, 0.10);
        }

        .sagar-select-arrow {
          position: absolute;
          top: 50%;
          right: 12px;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #676572;
          pointer-events: none;
          transform: translateY(-50%);
        }

        .sagar-select-hint,
        .sagar-select-error {
          margin: 6px 2px 0;
          font-size: 10px;
          line-height: 14px;
        }

        .sagar-select-hint {
          color: #9795a2;
        }

        .sagar-select-error {
          color: #d64545;
        }

        @media (max-width: 700px) {
          .sagar-select {
            min-height: 46px;
            font-size: 14px;
            border-radius: 12px;
          }
        }
      `}</style>
    </div>
  );
}