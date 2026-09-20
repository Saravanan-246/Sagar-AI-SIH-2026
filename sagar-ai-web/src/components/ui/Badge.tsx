import React from "react";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "violet";
  size?: "sm" | "md";
};

export default function Badge({
  children,
  tone = "neutral",
  size = "md",
}: BadgeProps) {
  return (
    <span className={`sagar-badge sagar-badge-${tone} sagar-badge-${size}`}>
      {children}

      <style>{`
        .sagar-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          width: fit-content;
          border-radius: 9999px;
          font-family: inherit;
          font-weight: 600;
          letter-spacing: 0.025em;
          text-transform: capitalize;
          white-space: nowrap;
          line-height: 1;
          vertical-align: middle;
          user-select: none;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          border: 1px solid transparent;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }

        /* Sizes calibrated for touch and high-DPI desktop viewports */
        .sagar-badge-sm {
          height: 22px;
          padding: 0 8px;
          font-size: 11px;
        }

        .sagar-badge-md {
          height: 26px;
          padding: 0 10px;
          font-size: 12px;
        }

        /* Neutral: balanced slate tone */
        .sagar-badge-neutral {
          background-color: #f1f5f9;
          border-color: #e2e8f0;
          color: #475569;
        }

        /* Success: crisp maritime emerald */
        .sagar-badge-success {
          background-color: #ecfdf5;
          border-color: #a7f3d0;
          color: #047857;
        }

        /* Warning: high-contrast amber */
        .sagar-badge-warning {
          background-color: #fffbeb;
          border-color: #fde68a;
          color: #b45309;
        }

        /* Danger: crisp signal red */
        .sagar-badge-danger {
          background-color: #fef2f2;
          border-color: #fecaca;
          color: #b91c1c;
        }

        /* Violet: vibrant digital accent */
        .sagar-badge-violet {
          background-color: #f5f3ff;
          border-color: #ddd6fe;
          color: #6d28d9;
        }
      `}</style>
    </span>
  );
}