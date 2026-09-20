import {
  Bell,
  ChevronRight,
  Globe2,
  Info,
  Languages,
  MapPin,
  RotateCcw,
  Settings2,
  ShieldCheck,
  UserRound,
  Waves,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Select from "../components/ui/Select";
import { APP_CONFIG } from "../constants/config";
import { ROUTES } from "../constants/routes";
import { useAppStore } from "../store/appStore";

import "./Profile.css";

const AREA_STORAGE_KEY = "sagar-ai-area";
const ALERTS_STORAGE_KEY = "sagar-ai-alert-preferences";

type LanguageCode = "en" | "ta" | "te" | "ml" | "kn" | "hi";

type AlertPreference = {
  severeAlerts: boolean;
  geofenceAlerts: boolean;
};

const languageOptions = [
  { value: "en", label: "English" },
  { value: "ta", label: "தமிழ்" },
  { value: "te", label: "తెలుగు" },
  { value: "ml", label: "മലയാളം" },
  { value: "kn", label: "ಕನ್ನಡ" },
  { value: "hi", label: "हिन्दी" },
];

const areaOptions = [
  { value: "thoothukudi-coast", label: "Thoothukudi Coast" },
  { value: "central-gulf-mannar", label: "Central Gulf of Mannar" },
  { value: "southern-gulf-mannar", label: "Southern Gulf of Mannar" },
  { value: "north-gulf-mannar", label: "Northern Gulf of Mannar" },
];

function readArea(): string {
  try {
    return localStorage.getItem(AREA_STORAGE_KEY) ?? "thoothukudi-coast";
  } catch {
    return "thoothukudi-coast";
  }
}

function readAlertPreferences(): AlertPreference {
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) {
      return { severeAlerts: true, geofenceAlerts: true };
    }
    const parsed = JSON.parse(raw);
    return {
      severeAlerts: typeof parsed?.severeAlerts === "boolean" ? parsed.severeAlerts : true,
      geofenceAlerts: typeof parsed?.geofenceAlerts === "boolean" ? parsed.geofenceAlerts : true,
    };
  } catch {
    return { severeAlerts: true, geofenceAlerts: true };
  }
}

export default function Profile() {
  const navigate = useNavigate();

  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);

  const [area, setArea] = useState(readArea);
  const [alertPreferences, setAlertPreferences] = useState<AlertPreference>(readAlertPreferences);
  const [saved, setSaved] = useState(false);

  const savePreferences = () => {
    try {
      localStorage.setItem(AREA_STORAGE_KEY, area);
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alertPreferences));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      console.error("Failed to save preferences:", error);
    }
  };

  const resetPreferences = () => {
    setLanguage("en");
    setArea("thoothukudi-coast");
    setAlertPreferences({ severeAlerts: true, geofenceAlerts: true });

    try {
      localStorage.removeItem(AREA_STORAGE_KEY);
      localStorage.removeItem(ALERTS_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to reset preferences:", error);
    }
  };

  const toggleAlertPreference = (key: keyof AlertPreference) => {
    setAlertPreferences((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <AppShell>
      <PageContainer className="profile-page">
        <div className="profile-layout-container">
          
          {/* HEADER */}
          <header className="profile-header">
            <div>
              <div className="profile-eyebrow">
                <UserRound size={14} />
                <span>Workspace</span>
              </div>
              <h1>Settings & Preferences</h1>
              <p>Manage your localized Sagar workspace context and real-time hazard notification behavior.</p>
            </div>
            <Badge tone="neutral" size="sm">
              OPERATIONAL
            </Badge>
          </header>

          {/* IDENTITY CARD */}
          <section className="profile-identity">
            <div className="profile-avatar">
              <span>S</span>
            </div>
            <div className="profile-identity-content">
              <div className="profile-name-row">
                <h2>Sagar Workspace</h2>
                <Badge tone="success" size="sm">
                  Active
                </Badge>
              </div>
              <p>Marine intelligence decision-support console</p>
              <div className="profile-identity-meta">
                <span>
                  <Waves size={14} />
                  {APP_CONFIG.appFullName}
                </span>
                <span>
                  <ShieldCheck size={14} />
                  Live INCOIS Advisory Active
                </span>
              </div>
            </div>
          </section>

          {/* MAIN SETTINGS GRID */}
          <div className="profile-grid">
            <main className="profile-main">
              
              {/* PREFERENCES SECTION */}
              <section className="profile-card">
                <div className="profile-card-header">
                  <div className="profile-card-icon">
                    <Settings2 size={18} />
                  </div>
                  <div>
                    <h2>Workspace Context</h2>
                    <p>Set default parameters used by Sagar AI during consultations.</p>
                  </div>
                </div>

                <div className="profile-form-grid">
                  <Select
                    label="Preferred language"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value as LanguageCode)}
                    options={languageOptions}
                    hint="Generates marine intelligence briefings in this dialect."
                  />
                  <Select
                    label="Primary marine operating zone"
                    value={area}
                    onChange={(event) => setArea(event.target.value)}
                    options={areaOptions}
                    hint="Default operational reference point for weather and alerts."
                  />
                </div>
              </section>

              {/* ALERTS SECTION */}
              <section className="profile-card">
                <div className="profile-card-header">
                  <div className="profile-card-icon">
                    <Bell size={18} />
                  </div>
                  <div>
                    <h2>Alert Subscriptions</h2>
                    <p>Configure automated vessel safety and proximity alerts.</p>
                  </div>
                </div>

                <div className="profile-preference-list">
                  <PreferenceRow
                    icon={Bell}
                    title="Severe Marine Hazards"
                    description="Immediate notification of high-risk cyclones, squalls, wave surges, and lightning advisories."
                    enabled={alertPreferences.severeAlerts}
                    onToggle={() => toggleAlertPreference("severeAlerts")}
                  />
                  <PreferenceRow
                    icon={MapPin}
                    title="Geofence & Boundary Warnings"
                    description="Proximity alerts when courses approach restricted zones, international borders, or marine sanctuaries."
                    enabled={alertPreferences.geofenceAlerts}
                    onToggle={() => toggleAlertPreference("geofenceAlerts")}
                  />
                </div>
              </section>

              {/* CONTEXT STRIP */}
              <section className="profile-card">
                <div className="profile-card-header">
                  <div className="profile-card-icon">
                    <Globe2 size={18} />
                  </div>
                  <div>
                    <h2>Active Session Overview</h2>
                    <p>Current operational constraints enforced for this session.</p>
                  </div>
                </div>

                <div className="profile-context-grid">
                  <div className="profile-context-item">
                    <span>Active Region</span>
                    <strong>Gulf of Mannar</strong>
                  </div>
                  <div className="profile-context-item">
                    <span>Base Zone</span>
                    <strong>{areaOptions.find((opt) => opt.value === area)?.label ?? "Thoothukudi Coast"}</strong>
                  </div>
                  <div className="profile-context-item">
                    <span>Intelligence Mode</span>
                    <strong>Safety & Zone Ranking</strong>
                  </div>
                </div>
              </section>

              {/* ACTION FOOTER */}
              <div className="profile-actions">
                <Button variant="secondary" size="sm" onClick={resetPreferences}>
                  <RotateCcw size={14} />
                  Reset Defaults
                </Button>
                <Button variant="primary" size="sm" onClick={savePreferences}>
                  <ShieldCheck size={14} />
                  {saved ? "Saved Successfully" : "Save Changes"}
                </Button>
              </div>
            </main>

            {/* SIDE PANEL */}
            <aside className="profile-side">
              <div className="profile-side-card">
                <div className="profile-side-header">
                  <Languages size={18} />
                  <h3>Regional Languages</h3>
                </div>
                <p>Native-language ocean advisories tuned for localized maritime terminology.</p>
                <div className="profile-pill-grid">
                  {languageOptions.map((opt) => (
                    <span key={opt.value} className={opt.value === language ? "active" : ""}>
                      {opt.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="profile-side-card">
                <div className="profile-side-header">
                  <MapPin size={18} />
                  <h3>Operating Area</h3>
                </div>
                <p>Zone selection synchronizes bathymetric depth, PFZ layers, and wind charts automatically.</p>
                <button
                  type="button"
                  className="profile-side-link"
                  onClick={() => navigate(ROUTES.MAP)}
                >
                  <span>Open Marine Map</span>
                  <ChevronRight size={15} />
                </button>
              </div>

              <div className="profile-side-card">
                <div className="profile-side-header">
                  <Info size={18} />
                  <h3>About Sagar AI</h3>
                </div>
                <p>Autonomous marine decision support system providing real-time routing and safety analytics.</p>
                <span className="profile-version-tag">Version {APP_CONFIG.version}</span>
              </div>
            </aside>
          </div>

        </div>
      </PageContainer>
    </AppShell>
  );
}

function PreferenceRow({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="profile-preference-row">
      <div className="profile-preference-icon">
        <Icon size={16} />
      </div>
      <div className="profile-preference-content">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button
        type="button"
        className={`profile-toggle ${enabled ? "enabled" : ""}`}
        aria-pressed={enabled}
        onClick={onToggle}
      >
        <span />
      </button>
    </div>
  );
}