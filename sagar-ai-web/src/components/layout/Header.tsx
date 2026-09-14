import { Bell, Menu } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const pageTitles: Record<string, string> = {
  "/": "Marine Situation",
  "/map": "Marine Map",
  "/chat": "Ask Sagar",
  "/route": "Route Planning",
  "/scenario": "What-If Analysis",
  "/alerts": "Marine Alerts",
  "/activity": "Activity",
  "/sources": "Data Sources",
  "/profile": "Profile",
};

type HeaderProps = {
  onMenuClick?: () => void;
};

export default function Header({
  onMenuClick,
}: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const title =
    pageTitles[location.pathname] ?? "Sagar";

  return (
    <header className="app-header">
      <div className="app-header-left">
        <button
          type="button"
          className="header-menu-button"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <Menu size={20} strokeWidth={2} />
        </button>

        <div className="header-title-group">
          <span className="header-title">
            {title}
          </span>

          <span className="header-context">
            Marine Intelligence
          </span>
        </div>
      </div>

      <div className="app-header-right">
        <button
          type="button"
          className="header-icon-button"
          onClick={() => navigate("/alerts")}
          aria-label="Open marine alerts"
        >
          <Bell size={19} strokeWidth={2} />

          <span className="header-alert-dot" />
        </button>

        <div
          className="header-profile"
          aria-label="Sagar profile"
        >
          <span className="header-profile-letter">
            S
          </span>
        </div>
      </div>
    </header>
  );
}