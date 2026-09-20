import {
  Activity,
  AlertTriangle,
  Compass,
  Database,
  Home,
  Map,
  Route,
  Settings,
  Sparkles,
  Waves,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import "./Sidebar.css";

const primaryNavigation = [
  {
    label: "Home",
    path: "/",
    icon: Home,
  },
  {
    label: "Marine Map",
    path: "/map",
    icon: Map,
  },
  {
    label: "Ask Sagar",
    path: "/chat",
    icon: Sparkles,
  },
];

const operationsNavigation = [
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
    icon: AlertTriangle,
  },
];

const informationNavigation = [
  {
    label: "Activity",
    path: "/activity",
    icon: Activity,
  },
  {
    label: "Data Sources",
    path: "/sources",
    icon: Database,
  },
  {
    label: "Profile",
    path: "/profile",
    icon: Settings,
  },
];

export default function Sidebar() {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-inner">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <Waves size={20} strokeWidth={2.2} />
          </div>

          <div className="sidebar-brand-copy">
            <span className="sidebar-brand-name">
              SAGAR
            </span>

            <span className="sidebar-brand-subtitle">
              Marine Intelligence
            </span>
          </div>
        </div>

        <div className="sidebar-status">
          <span className="sidebar-status-dot" />
          <span>Marine workspace</span>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <SidebarGroup
            title="Workspace"
            items={primaryNavigation}
          />

          <SidebarGroup
            title="Operations"
            items={operationsNavigation}
          />

          <SidebarGroup
            title="System"
            items={informationNavigation}
          />
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-line" />

          <div className="sidebar-footer-content">
            <span className="sidebar-footer-title">
              SAGAR AI
            </span>

            <span className="sidebar-footer-version">
              Marine decision support
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

type SidebarItem = {
  label: string;
  path: string;
  icon: typeof Home;
};

function SidebarGroup({
  title,
  items,
}: {
  title: string;
  items: SidebarItem[];
}) {
  return (
    <div className="sidebar-group">
      <span className="sidebar-group-title">
        {title}
      </span>

      <div className="sidebar-group-items">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                [
                  "sidebar-link",
                  isActive ? "sidebar-link-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span className="sidebar-link-icon">
                    <Icon
                      size={18}
                      strokeWidth={isActive ? 2.2 : 1.9}
                    />
                  </span>

                  <span className="sidebar-link-label">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}