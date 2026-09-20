import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Compass,
  Fish,
  Map,
  Navigation,
  ShieldAlert,
  Sparkles,
  Waves,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import MarineMap from "../components/map/MarineMap";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { ROUTES } from "../constants/routes";
import { useMarineData } from "../hooks/useMarineData";

import "./Home.css";

export default function Home() {
  const navigate = useNavigate();
  const { area, loading } = useMarineData();

  const marineRisk = area?.safety?.overallRisk ?? "low";
  const riskScore = area?.safety?.riskScore ?? 12;
  const seaStateRaw = area?.conditions?.seaState ?? "slight";
  const waveHeight = area?.conditions?.waveHeightM ?? 0.8;
  const windSpeed = area?.conditions?.windSpeedKnots ?? 10;
  const productivitySignal = area?.marineIndicators?.productivitySignal ?? "high";

  const seaState = seaStateRaw
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const getRiskTone = (risk: string): "success" | "warning" | "danger" | "neutral" => {
    switch (risk.toLowerCase()) {
      case "low":
        return "success";
      case "moderate":
        return "warning";
      case "high":
      case "critical":
        return "danger";
      default:
        return "neutral";
    }
  };

  return (
    <AppShell>
      <PageContainer className="home-page" fullHeight>
        <div className="home-layout">
          {/* MAP & SITUATION SECTION */}
          <section className="home-map-section">
            <header className="home-map-header">
              <div className="home-map-titles">
                <div className="home-eyebrow">
                  <Waves size={15} />
                  <span>Marine Situation</span>
                </div>
                <h1>{loading ? "Loading conditions..." : area?.name ?? "Thoothukudi Coast"}</h1>
                <p>{area?.region ?? "Gulf of Mannar, Tamil Nadu"}</p>
              </div>

              <div className="home-map-actions">
                <Badge tone={getRiskTone(marineRisk)} size="sm">
                  {marineRisk.toUpperCase()}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(ROUTES.MAP)}
                >
                  <Map size={15} />
                  Full map
                </Button>
              </div>
            </header>

            <div className="home-map-container">
              <MarineMap />
            </div>

            <footer className="home-map-status">
              <div className="home-location-indicator">
                <span className="home-location-dot" />
                <span>{area?.name ?? "Thoothukudi Coast"}</span>
              </div>

              <div className="home-stats-group">
                <span>Risk: <strong>{riskScore}/100</strong></span>
                <span className="home-divider" />
                <span>Sea: <strong>{seaState}</strong></span>
                <span className="home-divider" />
                <span>Waves: <strong>{waveHeight.toFixed(1)} m</strong></span>
              </div>
            </footer>
          </section>

          {/* AI ASSISTANT SECTION */}
          <section className="home-sagar-section">
            <header className="home-sagar-header">
              <div className="home-sagar-profile">
                <div className="home-sagar-avatar">
                  <Bot size={20} />
                </div>
                <div>
                  <div className="home-sagar-title-row">
                    <h2>Ask Sagar</h2>
                    <span className="home-sagar-status">
                      <i />
                      Ready
                    </span>
                  </div>
                  <p>Intelligent marine assistant for routes, alerts, and zones.</p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(ROUTES.CHAT)}
              >
                Open chat
                <ArrowRight size={14} />
              </Button>
            </header>

            <button
              type="button"
              className="home-sagar-composer"
              onClick={() => navigate(ROUTES.CHAT)}
            >
              <Sparkles size={16} />
              <span>Ask Sagar anything about the sea...</span>
            </button>

            <div className="home-sagar-suggestions">
              <button type="button" onClick={() => navigate(ROUTES.CHAT)}>
                <ShieldAlert size={14} />
                <span>Is it safe tomorrow morning?</span>
              </button>
              <button type="button" onClick={() => navigate(ROUTES.CHAT)}>
                <AlertTriangle size={14} />
                <span>Any lightning or cyclone alerts?</span>
              </button>
              <button type="button" onClick={() => navigate(ROUTES.CHAT)}>
                <Fish size={14} />
                <span>Which fishing zone is best?</span>
              </button>
              <button type="button" onClick={() => navigate(ROUTES.CHAT)}>
                <Navigation size={14} />
                <span>Find a safer route</span>
              </button>
            </div>
          </section>

          {/* QUICK TOOLS */}
          <section className="home-tools-section">
            <div className="home-tools-header">
              <span>Quick Access</span>
              <h2>Marine Tools</h2>
            </div>

            <div className="home-tools-grid">
              <button
                type="button"
                className="home-tool-card"
                onClick={() => navigate(ROUTES.ROUTE)}
              >
                <div className="home-tool-icon route">
                  <Navigation size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>Plan Route</strong>
                  <span>Compare safer marine routes</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                className="home-tool-card"
                onClick={() => navigate(ROUTES.ALERTS)}
              >
                <div className="home-tool-icon alert">
                  <AlertTriangle size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>Marine Alerts</strong>
                  <span>Review active hazards</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                className="home-tool-card"
                onClick={() => navigate(ROUTES.SCENARIO)}
              >
                <div className="home-tool-icon scenario">
                  <Compass size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>What-If Analysis</strong>
                  <span>Test changing conditions</span>
                </div>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>

          {/* BOTTOM CONTEXT ROW */}
          <section className="home-context-row">
            <div className="home-context-item">
              <span>Wind</span>
              <strong>{windSpeed} kn</strong>
            </div>

            <div className="home-context-item">
              <span>Sea state</span>
              <strong>{seaState}</strong>
            </div>

            <div className="home-context-item">
              <span>Productivity</span>
              <strong className="home-context-productivity">
                {String(productivitySignal).toUpperCase()}
              </strong>
            </div>

            <button
              type="button"
              className="home-context-action"
              onClick={() => navigate(ROUTES.MAP)}
            >
              <Map size={15} />
              <span>Explore marine map</span>
              <ArrowRight size={14} />
            </button>
          </section>
        </div>
      </PageContainer>
    </AppShell>
  );
}