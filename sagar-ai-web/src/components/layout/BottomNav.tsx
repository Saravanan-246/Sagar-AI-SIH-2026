import { NavLink } from "react-router-dom";
import {
  Activity,
  Bell,
  Compass,
  Home,
  Map,
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
    label: "Routes",
    path: "/route",
    icon: Route,
  },
  {
    label: "Alerts",
    path: "/alerts",
    icon: Bell,
  },
  {
    label: "Scenarios",
    path: "/scenario",
    icon: Compass,
  },
];

export default function BottomNav() {
  return (
    <>
      <nav className="mobile-bottom-nav">
        <div className="mobile-bottom-nav-inner">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
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