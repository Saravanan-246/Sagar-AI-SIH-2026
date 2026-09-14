import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  Bell,
  Compass,
  Database,
  Home,
  Map,
  MoreHorizontal,
  Route,
  Sparkles,
  User,
} from "lucide-react";

const navigation = [
  {
    label: "Home",
    path: "/",
    icon: Home,
  },
  {
    label: "Map",
    path: "/map",
    icon: Map,
  },
  {
    label: "Ask Sagar",
    path: "/chat",
    icon: Sparkles,
    primary: true,
  },
  {
    label: "Activity",
    path: "/activity",
    icon: Activity,
  },
  {
    label: "You",
    path: "/profile",
    icon: User,
  },
];

const moreNavigation = [
  {
    label: "Route Planning",
    path: "/route",
    icon: Route,
  },
  {
    label: "What-If Analysis",
    path: "/scenario",
    icon: Compass,
  },
  {
    label: "Marine Alerts",
    path: "/alerts",
    icon: Bell,
  },
  {
    label: "Data Sources",
    path: "/sources",
    icon: Database,
  },
];

export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav className="mobile-bottom-nav">
        {moreOpen && (
          <div
            className="mobile-more-backdrop"
            onClick={() => setMoreOpen(false)}
          />
        )}

        {moreOpen && (
          <div className="mobile-more-sheet">
            {moreNavigation.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="mobile-more-link"
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon size={18} strokeWidth={2} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        )}

        <div className="mobile-bottom-nav-inner">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  [
                    "mobile-nav-item",
                    item.primary
                      ? "mobile-nav-item-primary"
                      : "",
                    isActive
                      ? "mobile-nav-item-active"
                      : "",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={
                        item.primary
                          ? "mobile-nav-primary-icon"
                          : "mobile-nav-icon"
                      }
                    >
                      <Icon
                        size={item.primary ? 20 : 19}
                        strokeWidth={
                          isActive ? 2.4 : 1.9
                        }
                      />
                    </span>

                    <span className="mobile-nav-label">
                      {item.label === "Ask Sagar"
                        ? "Ask"
                        : item.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}

          <button
            type="button"
            className={
              moreOpen
                ? "mobile-nav-item mobile-nav-item-active"
                : "mobile-nav-item"
            }
            onClick={() => setMoreOpen((open) => !open)}
            aria-label="More navigation"
            aria-expanded={moreOpen}
          >
            <span className="mobile-nav-icon">
              <MoreHorizontal
                size={19}
                strokeWidth={moreOpen ? 2.4 : 1.9}
              />
            </span>

            <span className="mobile-nav-label">More</span>
          </button>
        </div>
      </nav>

      <aside className="desktop-quick-nav">
        <span className="desktop-quick-label">
          OPERATIONS
        </span>

        <div className="desktop-quick-links">
          {moreNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  [
                    "desktop-quick-link",
                    isActive
                      ? "desktop-quick-link-active"
                      : "",
                  ].join(" ")
                }
              >
                <Icon size={17} strokeWidth={2} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </aside>
    </>
  );
}