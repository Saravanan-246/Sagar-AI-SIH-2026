import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Compass,
  Fish,
  FlaskConical,
  Map as MapIcon,
  Navigation,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { ROUTES } from "../constants/routes";
import { useMarineData } from "../hooks/useMarineData";
import { useAlerts } from "../hooks/useAlerts";
import { fetchRisk } from "../services/api/sagarApiClient";
import { useAppStore } from "../store/appStore";
import { alertTypeIcon, formatAlertType } from "../utils/alertPresentation";

import "./Home.css";

type Severity = "low" | "moderate" | "high" | "critical";

const ASK_SAGAR_PROMPTS: Array<{ icon: typeof ShieldAlert; label: string }> = [
  { icon: ShieldAlert, label: "Is it safe to fish right now?" },
  { icon: Waves, label: "What is changing in the sea?" },
  { icon: Fish, label: "Which fishing zone should I inspect?" },
  { icon: Navigation, label: "Find a safer route" },
  { icon: AlertTriangle, label: "Why is the risk high?" },
];

export default function Home() {
  const navigate = useNavigate();
  const setPendingChatPrompt = useAppStore((state) => state.setPendingChatPrompt);

  const { area, loading } = useMarineData();
  // Scoped to the resolved area, same as Map.tsx - never the unscoped
  // "every alert nationwide" fallback, which could otherwise surface an
  // unrelated hazard (e.g. a Chennai alert) on this area's safety card.
  const { alerts, loading: alertsLoading } = useAlerts({ areaId: area?.id });

  // The same live, deterministic risk result Chat/Map/Area already use
  // (via /api/risk - see riskAgent.ts), so this page never shows a
  // different score for the same area than Sagar just gave elsewhere.
  // Falls back to the area's own static safety.riskScore fixture field
  // (unchanged) while loading, offline, or on error - same pattern as
  // Area.tsx/MarineMap.tsx.
  const [liveRisk, setLiveRisk] = useState<{ riskScore: number; riskLevel: string } | null>(null);

  useEffect(() => {
    if (!area?.id) {
      setLiveRisk(null);
      return;
    }

    let cancelled = false;
    setLiveRisk(null);

    fetchRisk({ areaId: area.id })
      .then((response) => {
        if (cancelled || !response.data) return;
        setLiveRisk({ riskScore: response.data.riskScore, riskLevel: response.data.riskLevel });
      })
      .catch(() => {
        if (!cancelled) setLiveRisk(null);
      });

    return () => {
      cancelled = true;
    };
  }, [area?.id]);

  const marineRisk = liveRisk?.riskLevel ?? area?.safety?.overallRisk ?? "low";
  const riskScore = liveRisk?.riskScore ?? area?.safety?.riskScore ?? 12;
  const seaStateRaw = area?.conditions?.seaState ?? "slight";
  const waveHeight = area?.conditions?.waveHeightM;
  const windSpeed = area?.conditions?.windSpeedKnots;
  const sst = area?.marineIndicators?.seaSurfaceTemperatureC;

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

  const topAlerts = useMemo(() => {
    const priority: Record<Severity, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
    return [...alerts]
      .sort((a, b) => {
        const severityA = (a.severity as Severity) ?? "low";
        const severityB = (b.severity as Severity) ?? "low";
        return (priority[severityB] ?? 0) - (priority[severityA] ?? 0);
      })
      .slice(0, 3);
  }, [alerts]);

  const handleAskSagar = (prompt: string) => {
    setPendingChatPrompt(prompt);
    navigate(ROUTES.CHAT);
  };

  return (
    <AppShell>
      <PageContainer className="home-page">
        <div className="home-layout">
          {/* CURRENT MARINE SITUATION */}
          <Card className="home-situation-card" padding="lg">
            <div className="home-situation-top">
              <div className="home-eyebrow">
                <Waves size={15} />
                <span>Marine Situation</span>
              </div>
              <Badge tone={getRiskTone(marineRisk)} size="sm">
                {marineRisk.toUpperCase()}
              </Badge>
            </div>

            <h1 className="home-situation-title">
              {loading ? "Loading conditions…" : area?.name ?? "Thoothukudi Coast"}
            </h1>
            <p className="home-situation-region">{area?.region ?? "Gulf of Mannar, Tamil Nadu"}</p>

            <div className="home-situation-risk">
              <span className="home-situation-risk-score">{riskScore}</span>
              <span className="home-situation-risk-label">/100 risk score</span>
            </div>

            <div className="home-situation-conditions">
              <div className="home-situation-condition">
                <Waves size={14} />
                <span>Sea state</span>
                <strong>{seaState}</strong>
              </div>
              <div className="home-situation-condition">
                <Wind size={14} />
                <span>Wind</span>
                <strong>{typeof windSpeed === "number" ? `${windSpeed} kn` : "—"}</strong>
              </div>
              <div className="home-situation-condition">
                <Waves size={14} />
                <span>Waves</span>
                <strong>{typeof waveHeight === "number" ? `${waveHeight.toFixed(1)} m` : "—"}</strong>
              </div>
            </div>

            <Button variant="secondary" fullWidth onClick={() => navigate(ROUTES.MAP)}>
              <MapIcon size={15} />
              Open Marine Map
            </Button>
          </Card>

          {/* ASK SAGAR - primary action */}
          <Card className="home-ask-card" padding="lg">
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
                  <p>Sagar's marine reasoning assistant - routes, zones, risk, alerts.</p>
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.CHAT)}>
                Open chat
                <ArrowRight size={14} />
              </Button>
            </header>

            <button type="button" className="home-sagar-composer" onClick={() => navigate(ROUTES.CHAT)}>
              <Sparkles size={16} />
              <span>Ask Sagar anything about the sea...</span>
            </button>

            <div className="home-sagar-suggestions">
              {ASK_SAGAR_PROMPTS.map(({ icon: Icon, label }) => (
                <button key={label} type="button" onClick={() => handleAskSagar(label)}>
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* SAFETY / ALERTS */}
          <Card className="home-safety-card" padding="lg">
            <header className="home-safety-header">
              <div className="home-safety-title-group">
                {topAlerts.length > 0 ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}
                <div>
                  <span className="home-eyebrow-plain">Safety</span>
                  <h2>Active Alerts</h2>
                </div>
              </div>
              {topAlerts.length > 0 && (
                <Badge tone="danger" size="sm">
                  {alerts.length}
                </Badge>
              )}
            </header>

            {alertsLoading ? (
              <div className="home-safety-loading">Loading alerts...</div>
            ) : topAlerts.length === 0 ? (
              <div className="home-safety-empty">
                <ShieldCheck size={18} />
                <div>
                  <strong>No active alerts</strong>
                  <span>No active hazards reported for this area.</span>
                </div>
              </div>
            ) : (
              <div className="home-safety-list">
                {topAlerts.map((alert) => {
                  const Icon = alertTypeIcon(alert.type);
                  return (
                    <button
                      key={alert.id}
                      type="button"
                      className="home-safety-item"
                      onClick={() => navigate(ROUTES.ALERTS)}
                    >
                      <div className={`home-safety-item-icon ${alert.severity ?? "low"}`}>
                        <Icon size={15} />
                      </div>
                      <div className="home-safety-item-content">
                        <strong>{alert.title}</strong>
                        <span>
                          {formatAlertType(alert.type)} &middot; {alert.location.name}
                        </span>
                      </div>
                      <ArrowRight size={14} />
                    </button>
                  );
                })}
              </div>
            )}

            <Button variant="ghost" size="sm" fullWidth onClick={() => navigate(ROUTES.ALERTS)}>
              View all alerts
              <ArrowRight size={14} />
            </Button>
          </Card>

          {/* MARINE CONDITIONS */}
          <Card className="home-metrics-card" padding="lg">
            <div className="home-metrics-header">
              <span className="home-eyebrow-plain">Marine Conditions</span>
              <h2>{area?.name ?? "Current area"}</h2>
            </div>

            <div className="home-metrics-grid">
              <div className="home-metric-tile">
                <Wind size={16} />
                <span>Wind</span>
                <strong>{typeof windSpeed === "number" ? `${windSpeed} kn` : "—"}</strong>
              </div>
              <div className="home-metric-tile">
                <Waves size={16} />
                <span>Waves</span>
                <strong>{typeof waveHeight === "number" ? `${waveHeight.toFixed(1)} m` : "—"}</strong>
              </div>
              <div className="home-metric-tile">
                <Waves size={16} />
                <span>Sea state</span>
                <strong>{seaState}</strong>
              </div>
              <div className="home-metric-tile">
                <Thermometer size={16} />
                <span>SST</span>
                <strong>{typeof sst === "number" ? `${sst.toFixed(1)} °C` : "—"}</strong>
              </div>
              <div className="home-metric-tile">
                <Compass size={16} />
                <span>Current</span>
                <strong>—</strong>
              </div>
            </div>
          </Card>

          {/* QUICK ACTIONS */}
          <section className="home-tools-section">
            <div className="home-tools-header">
              <span className="home-eyebrow-plain">Quick Access</span>
              <h2>Marine Tools</h2>
            </div>

            <div className="home-tools-grid">
              <button type="button" className="home-tool-card" onClick={() => navigate(ROUTES.ROUTE)}>
                <div className="home-tool-icon route">
                  <Navigation size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>Route Planning</strong>
                  <span>Compare safer marine routes</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button type="button" className="home-tool-card" onClick={() => navigate(ROUTES.SCENARIO)}>
                <div className="home-tool-icon scenario">
                  <Compass size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>What-If Analysis</strong>
                  <span>Test changing conditions</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button type="button" className="home-tool-card" onClick={() => navigate(ROUTES.MAP)}>
                <div className="home-tool-icon fishing">
                  <Fish size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>Fishing Zones</strong>
                  <span>Configured PFZ recommendations</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button type="button" className="home-tool-card" onClick={() => navigate(ROUTES.SST_LAB)}>
                <div className="home-tool-icon sst">
                  <Thermometer size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>SST Intelligence</strong>
                  <span>Sea-surface temperature research</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button type="button" className="home-tool-card" onClick={() => navigate(ROUTES.MARINE_LAB)}>
                <div className="home-tool-icon lab">
                  <FlaskConical size={18} />
                </div>
                <div className="home-tool-info">
                  <strong>Marine Intelligence Lab</strong>
                  <span>Evidence, validation &amp; sources</span>
                </div>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>

          {/* RESEARCH / INTELLIGENCE */}
          <Card className="home-research-card" interactive onClick={() => navigate(ROUTES.MARINE_LAB)}>
            <div className="home-research-icon">
              <FlaskConical size={18} />
            </div>
            <div className="home-research-content">
              <strong>Marine Intelligence Lab</strong>
              <span>Research, validation and evidence for Sagar's marine reasoning system.</span>
            </div>
            <ArrowRight size={16} />
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  );
}
