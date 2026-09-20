import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Compass,
  Database,
  Grid2X2,
  Home,
  MapPin,
  Route,
  ShieldAlert,
  SlidersHorizontal,
  User,
  X,
} from "lucide-react";
import "./BottomNav.css";

function SagarCoreButton({ isActive }: { isActive: boolean }) {
  return (
    <div className={`sagar-orb-container ${isActive ? "active" : ""}`}>
      <div className="sagar-orb-ring">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="sagar-orb-glyph"
        >
          <path
            d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"
            fill="currentColor"
          />
          <circle cx="12" cy="12" r="2.5" fill="#ffffff" />
        </svg>
      </div>
    </div>
  );
}

const primaryNav = [
  { label: "Home", path: "/", icon: Home },
  { label: "Map", path: "/map", icon: MapPin },
  { label: "Sagar AI", path: "/chat", isCore: true },
  { label: "Activity", path: "/activity", icon: Grid2X2 },
  { label: "Profile", path: "/profile", icon: User },
];

const drawerTools = [
  {
    label: "Route Planning",
    path: "/route",
    icon: Route,
    badge: "Nav",
    desc: "Calculate safe maritime corridors & wave resistance",
  },
  {
    label: "What-If Analysis",
    path: "/scenario",
    icon: Compass,
    badge: "Sim",
    desc: "Simulate atmospheric & wave condition shifts",
  },
  {
    label: "Marine Alerts",
    path: "/alerts",
    icon: ShieldAlert,
    badge: "Live",
    desc: "Active severe weather & hazard bulletins",
  },
  {
    label: "Data Sources",
    path: "/sources",
    icon: Database,
    badge: "INCOIS",
    desc: "Oceanographic models & satellite telemetry",
  },
];

export default function BottomNav() {
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  return (
    <>
      {sheetOpen && (
        <div
          className="dock-backdrop"
          onClick={() => setSheetOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`dock-drawer ${sheetOpen ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Extended Maritime Tools"
      >
        <div className="dock-drawer-handle" aria-hidden="true" />
        <div className="dock-drawer-head">
          <div>
            <h3 className="dock-drawer-title">Maritime Intelligence</h3>
            <p className="dock-drawer-subtitle">Advanced navigation tools</p>
          </div>
          <button
            type="button"
            className="dock-drawer-close"
            onClick={() => setSheetOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="dock-drawer-grid">
          {drawerTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <NavLink
                key={tool.path}
                to={tool.path}
                className={({ isActive }) =>
                  `dock-tool-card ${isActive ? "active" : ""}`
                }
                onClick={() => setSheetOpen(false)}
              >
                <div className="dock-tool-top">
                  <div className="dock-tool-icon">
                    <Icon size={19} strokeWidth={2} />
                  </div>
                  <span
                    className="dock-tool-badge"
                    data-tone={tool.badge.toLowerCase()}
                  >
                    {tool.badge}
                  </span>
                </div>
                <div className="dock-tool-meta">
                  <strong className="dock-tool-name">{tool.label}</strong>
                  <span className="dock-tool-desc">{tool.desc}</span>
                </div>
              </NavLink>
            );
          })}
        </div>
      </aside>

      <nav className="dock-surface" aria-label="Bottom Navigation">
        <div className="dock-wrapper">
          {primaryNav.map((item) => {
            if (item.isCore) {
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setSheetOpen(false)}
                  className="dock-core-link"
                >
                  {({ isActive }) => (
                    <>
                      <SagarCoreButton isActive={isActive} />
                      <span
                        className={`dock-label dock-label-core ${
                          isActive ? "active" : ""
                        }`}
                      >
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            }

            const Icon = item.icon!;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                onClick={() => setSheetOpen(false)}
                className={({ isActive }) =>
                  `dock-item ${isActive ? "active" : ""}`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="dock-icon-box">
                      <Icon size={20} strokeWidth={isActive ? 2.4 : 1.7} />
                    </div>
                    <span className="dock-label">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}

          <button
            type="button"
            className={`dock-item ${sheetOpen ? "active" : ""}`}
            onClick={() => setSheetOpen((prev) => !prev)}
            aria-label="More navigation options"
            aria-expanded={sheetOpen}
          >
            <div className="dock-icon-box">
              <SlidersHorizontal
                size={19}
                strokeWidth={sheetOpen ? 2.4 : 1.7}
              />
            </div>
            <span className="dock-label">Tools</span>
          </button>
        </div>
      </nav>
    </>
  );
}