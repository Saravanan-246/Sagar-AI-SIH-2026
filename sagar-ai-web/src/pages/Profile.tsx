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

import "./Profile.css";

const LANGUAGE_STORAGE_KEY =
  "sagar-ai-language";

const AREA_STORAGE_KEY =
  "sagar-ai-area";

const ALERTS_STORAGE_KEY =
  "sagar-ai-alert-preferences";

type LanguageCode =
  | "en"
  | "ta"
  | "te"
  | "ml"
  | "kn"
  | "hi";

type AlertPreference = {
  severeAlerts: boolean;
  geofenceAlerts: boolean;
};

const languageOptions = [
  {
    value: "en",
    label: "English",
  },
  {
    value: "ta",
    label: "தமிழ்",
  },
  {
    value: "te",
    label: "తెలుగు",
  },
  {
    value: "ml",
    label: "മലയാളം",
  },
  {
    value: "kn",
    label: "ಕನ್ನಡ",
  },
  {
    value: "hi",
    label: "हिन्दी",
  },
];

const areaOptions = [
  {
    value: "thoothukudi-coast",
    label: "Thoothukudi Coast",
  },
  {
    value: "central-gulf-mannar",
    label: "Central Gulf of Mannar",
  },
  {
    value: "southern-gulf-mannar",
    label: "Southern Gulf of Mannar",
  },
  {
    value: "north-gulf-mannar",
    label: "Northern Gulf of Mannar",
  },
];

function readLanguage(): LanguageCode {
  try {
    const value =
      localStorage.getItem(
        LANGUAGE_STORAGE_KEY,
      );

    if (
      value === "en" ||
      value === "ta" ||
      value === "te" ||
      value === "ml" ||
      value === "kn" ||
      value === "hi"
    ) {
      return value;
    }
  } catch {
    // Ignore unavailable local storage.
  }

  return "en";
}

function readArea() {
  try {
    return (
      localStorage.getItem(
        AREA_STORAGE_KEY,
      ) ?? "thoothukudi-coast"
    );
  } catch {
    return "thoothukudi-coast";
  }
}

function readAlertPreferences(): AlertPreference {
  try {
    const raw =
      localStorage.getItem(
        ALERTS_STORAGE_KEY,
      );

    if (!raw) {
      return {
        severeAlerts: true,
        geofenceAlerts: true,
      };
    }

    const parsed = JSON.parse(raw);

    return {
      severeAlerts:
        typeof parsed?.severeAlerts ===
        "boolean"
          ? parsed.severeAlerts
          : true,
      geofenceAlerts:
        typeof parsed?.geofenceAlerts ===
        "boolean"
          ? parsed.geofenceAlerts
          : true,
    };
  } catch {
    return {
      severeAlerts: true,
      geofenceAlerts: true,
    };
  }
}

export default function Profile() {
  const navigate = useNavigate();

  const [language, setLanguage] =
    useState<LanguageCode>(
      readLanguage,
    );

  const [area, setArea] =
    useState(readArea);

  const [alertPreferences, setAlertPreferences] =
    useState<AlertPreference>(
      readAlertPreferences,
    );

  const [saved, setSaved] =
    useState(false);

  const savePreferences = () => {
    try {
      localStorage.setItem(
        LANGUAGE_STORAGE_KEY,
        language,
      );

      localStorage.setItem(
        AREA_STORAGE_KEY,
        area,
      );

      localStorage.setItem(
        ALERTS_STORAGE_KEY,
        JSON.stringify(
          alertPreferences,
        ),
      );

      setSaved(true);

      window.setTimeout(() => {
        setSaved(false);
      }, 1800);
    } catch (error) {
      console.error(
        "Failed to save preferences:",
        error,
      );
    }
  };

  const resetPreferences = () => {
    setLanguage("en");
    setArea("thoothukudi-coast");

    setAlertPreferences({
      severeAlerts: true,
      geofenceAlerts: true,
    });

    try {
      localStorage.removeItem(
        LANGUAGE_STORAGE_KEY,
      );

      localStorage.removeItem(
        AREA_STORAGE_KEY,
      );

      localStorage.removeItem(
        ALERTS_STORAGE_KEY,
      );
    } catch (error) {
      console.error(
        "Failed to reset preferences:",
        error,
      );
    }
  };

  const toggleAlertPreference = (
    key: keyof AlertPreference,
  ) => {
    setAlertPreferences(
      (current) => ({
        ...current,
        [key]: !current[key],
      }),
    );
  };

  return (
    <AppShell>
      <PageContainer className="profile-page">
        <section className="profile-header">
          <div>
            <div className="profile-eyebrow">
              <UserRound size={14} />
              Workspace
            </div>

            <h1>Profile</h1>

            <p>
              Manage your Sagar workspace
              preferences and marine alert
              behaviour.
            </p>
          </div>

          <Badge
            tone="violet"
            size="md"
          >
            Marine workspace
          </Badge>
        </section>

        <section className="profile-identity">
          <div className="profile-avatar">
            <span>S</span>
          </div>

          <div className="profile-identity-content">
            <div className="profile-name-row">
              <h2>Sagar User</h2>

              <Badge
                tone="success"
                size="sm"
              >
                Active
              </Badge>
            </div>

            <p>
              Marine intelligence workspace
            </p>

            <div className="profile-identity-meta">
              <span>
                <Waves size={12} />
                {APP_CONFIG.appFullName}
              </span>

              <span>
                <ShieldCheck size={12} />
                Decision support
              </span>
            </div>
          </div>
        </section>

        <div className="profile-layout">
          <main className="profile-main">
            <section className="profile-section">
              <div className="profile-section-heading">
                <div className="profile-section-icon">
                  <Settings2 size={17} />
                </div>

                <div>
                  <h2>Workspace preferences</h2>
                  <p>
                    Set the context Sagar should
                    use for your conversations.
                  </p>
                </div>
              </div>

              <div className="profile-form-grid">
                <Select
                  label="Preferred language"
                  value={language}
                  onChange={(event) =>
                    setLanguage(
                      event.target.value as LanguageCode,
                    )
                  }
                  options={languageOptions}
                  hint="Sagar can use this preference when generating responses."
                />

                <Select
                  label="Primary marine area"
                  value={area}
                  onChange={(event) =>
                    setArea(event.target.value)
                  }
                  options={areaOptions}
                  hint="Used as the default context for marine queries."
                />
              </div>
            </section>

            <section className="profile-section">
              <div className="profile-section-heading">
                <div className="profile-section-icon">
                  <Bell size={17} />
                </div>

                <div>
                  <h2>Alert preferences</h2>
                  <p>
                    Control which safety signals
                    are surfaced by the workspace.
                  </p>
                </div>
              </div>

              <div className="profile-preference-list">
                <PreferenceRow
                  icon={Bell}
                  title="Severe marine alerts"
                  description="Show high and critical hazards such as cyclones, lightning and rough sea conditions."
                  enabled={
                    alertPreferences.severeAlerts
                  }
                  onToggle={() =>
                    toggleAlertPreference(
                      "severeAlerts",
                    )
                  }
                />

                <PreferenceRow
                  icon={MapPin}
                  title="Geofence notifications"
                  description="Surface warnings when a planned operating area approaches a configured restricted or protected boundary."
                  enabled={
                    alertPreferences.geofenceAlerts
                  }
                  onToggle={() =>
                    toggleAlertPreference(
                      "geofenceAlerts",
                    )
                  }
                />
              </div>
            </section>

            <section className="profile-section">
              <div className="profile-section-heading">
                <div className="profile-section-icon">
                  <Globe2 size={17} />
                </div>

                <div>
                  <h2>Marine context</h2>
                  <p>
                    Current default decision context
                    for this workspace.
                  </p>
                </div>
              </div>

              <div className="profile-context">
                <div className="profile-context-item">
                  <span>
                    Default region
                  </span>

                  <strong>
                    Gulf of Mannar
                  </strong>
                </div>

                <div className="profile-context-item">
                  <span>
                    Primary operating area
                  </span>

                  <strong>
                    {
                      areaOptions.find(
                        (option) =>
                          option.value ===
                          area,
                      )?.label
                    }
                  </strong>
                </div>

                <div className="profile-context-item">
                  <span>
                    Intelligence mode
                  </span>

                  <strong>
                    Marine decision support
                  </strong>
                </div>
              </div>
            </section>

            <div className="profile-actions">
              <Button
                variant="secondary"
                size="md"
                onClick={
                  resetPreferences
                }
              >
                <RotateCcw size={15} />
                Reset
              </Button>

              <Button
                variant="primary"
                size="md"
                onClick={
                  savePreferences
                }
              >
                <ShieldCheck size={15} />
                {saved
                  ? "Saved"
                  : "Save preferences"}
              </Button>
            </div>
          </main>

          <aside className="profile-side">
            <section className="profile-side-card">
              <div className="profile-side-icon">
                <Languages size={18} />
              </div>

              <h3>
                Regional language support
              </h3>

              <p>
                Sagar is designed to support
                natural-language interaction
                across Indian regional languages.
              </p>

              <div className="profile-language-list">
                {languageOptions.map(
                  (option) => (
                    <span key={option.value}>
                      {option.label}
                    </span>
                  ),
                )}
              </div>
            </section>

            <section className="profile-side-card">
              <div className="profile-side-icon">
                <MapPin size={18} />
              </div>

              <h3>
                Marine workspace
              </h3>

              <p>
                Your selected area helps
                Sagar prioritize relevant
                marine conditions, hazards,
                fishing zones and route context.
              </p>

              <button
                type="button"
                className="profile-side-link"
                onClick={() =>
                  navigate(ROUTES.MAP)
                }
              >
                <span>Open marine map</span>
                <ChevronRight size={15} />
              </button>
            </section>

            <section className="profile-side-card profile-about-card">
              <div className="profile-side-icon">
                <Info size={18} />
              </div>

              <h3>
                About Sagar AI
              </h3>

              <p>
                Conversational marine decision
                support for safer navigation,
                fishing operations and marine
                planning.
              </p>

              <span className="profile-version">
                Version{" "}
                {APP_CONFIG.version}
              </span>
            </section>
          </aside>
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
        className={
          enabled
            ? "profile-toggle enabled"
            : "profile-toggle"
        }
        aria-pressed={enabled}
        onClick={onToggle}
      >
        <span />
      </button>
    </div>
  );
}