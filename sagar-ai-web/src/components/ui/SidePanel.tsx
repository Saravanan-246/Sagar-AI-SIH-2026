import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

import "./SidePanel.css";

export type SidePanelSize = "default" | "wide" | "full";

type SidePanelProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Controls panel width/layout:
   *  - default: 480 px right-hand drawer (mobile: bottom sheet)
   *  - wide:    720 px right-hand drawer (mobile: bottom sheet)
   *  - full:    occupies the full content area beside the desktop sidebar,
   *             used for Map, Research tools, Route etc.               */
  size?: SidePanelSize;
  children: ReactNode;
  "aria-label"?: string;
};

export default function SidePanel({
  open,
  onClose,
  title,
  size = "default",
  children,
  "aria-label": ariaLabel,
}: SidePanelProps) {
  /* Lock body scroll and bind Escape key while open */
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="sp-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="sp-panel"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title ?? "Panel"}
      >
        {/* Header */}
        <div className="sp-header">
          {title && <h2 className="sp-title">{title}</h2>}
          <button
            type="button"
            className="sp-close"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="sp-body">
          {children}
        </div>
      </div>
    </>
  );
}

