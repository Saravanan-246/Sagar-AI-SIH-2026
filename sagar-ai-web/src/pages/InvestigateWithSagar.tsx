import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CloudSun,
  Compass,
  Database,
  FileSearch,
  Info,
  Layers3,
  ListChecks,
  Lock,
  MapPin,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import ErrorState from "../components/ui/ErrorState";
import LoadingState from "../components/ui/LoadingState";
import EvidencePanel, { type EvidenceItem } from "../components/marine/EvidencePanel";
import RiskIndicator, { type RiskLevel } from "../components/marine/RiskIndicator";
import { askSagarBackend, type SagarChatResponse } from "../services/api/sagarApiClient";
import { ROUTES } from "../constants/routes";

import "./InvestigateWithSagar.css";

/**
 * Investigate with Sagar - a UI walkthrough of Sagar's real chat/reasoning
 * pipeline (the same POST /api/chat that "Ask Sagar" uses, called here via
 * the existing askSagarBackend client - no new LLM client, no new agent
 * system, no simulated agent activity).
 *
 * The backend runs the whole pipeline as a single request/response - there
 * is no per-stage streaming or event feed. So stage progression here is
 * necessarily binary (not started -> in flight -> resolved), and every
 * stage's content is built only from fields the API response actually
 * contains. Stages the API does not expose (planning) or only lets us
 * infer indirectly (agent selection, cross-source fusion) are labelled as
 * such rather than presented as directly observed.
 */

const EXAMPLE_QUESTION = "Is it safe to fish near Thoothukudi today?";

type RequestState = "idle" | "loading" | "success" | "error";

type StageId =
  | "intent"
  | "planning"
  | "agents"
  | "data"
  | "reasoning"
  | "decision"
  | "evidence"
  | "answer";

type StageStatus = "pending" | "running" | "complete";
type StageExposure = "exposed" | "inferred" | "unexposed";

type StageDef = {
  id: StageId;
  label: string;
  description: string;
  icon: typeof Bot;
  exposure: StageExposure;
};

const STAGES: StageDef[] = [
  {
    id: "intent",
    label: "Intent Understanding",
    description: "The backend's real intent and language classification for this question.",
    icon: Compass,
    exposure: "exposed",
  },
  {
    id: "planning",
    label: "Planning",
    description: "Sagar's planner agent genuinely runs server-side, but its plan is not returned.",
    icon: ListChecks,
    exposure: "unexposed",
  },
  {
    id: "agents",
    label: "Agent / Tool Selection",
    description: "Inferred from which data types are present in the real response.",
    icon: Bot,
    exposure: "inferred",
  },
  {
    id: "data",
    label: "Data Retrieval",
    description: "The real data sources and evidence categories the response cites.",
    icon: Database,
    exposure: "exposed",
  },
  {
    id: "reasoning",
    label: "Cross-Source Reasoning",
    description: "The risk agent's real combined key factors, drawn from multiple sources.",
    icon: Layers3,
    exposure: "inferred",
  },
  {
    id: "decision",
    label: "Decision",
    description: "The real risk level, score and recommendation Sagar computed.",
    icon: ShieldCheck,
    exposure: "exposed",
  },
  {
    id: "evidence",
    label: "Evidence",
    description: "The real evidence records returned for this answer.",
    icon: FileSearch,
    exposure: "exposed",
  },
  {
    id: "answer",
    label: "Final Answer",
    description: "The real answer text produced by Sagar's chat pipeline.",
    icon: MessageSquareText,
    exposure: "exposed",
  },
];

type AgentId = "marine" | "weather" | "geo" | "risk" | "evidence";

type AgentDef = {
  id: AgentId;
  name: string;
  role: string;
  icon: typeof Bot;
};

const AGENTS: AgentDef[] = [
  { id: "marine", name: "Marine", role: "Sea-state and marine model context", icon: Waves },
  { id: "weather", name: "Weather", role: "Wind, visibility and weather signals", icon: CloudSun },
  { id: "geo", name: "Geo", role: "Location and geospatial (GIS) context", icon: MapPin },
  { id: "risk", name: "Risk", role: "Combines signals into a risk view", icon: ShieldAlert },
  { id: "evidence", name: "Evidence", role: "Tracks the sources used for the decision", icon: FileSearch },
];

const INTENT_LABELS: Record<string, string> = {
  safety: "Safety check",
  pfz: "Fishing zone lookup",
  route: "Route planning",
  alerts: "Marine alerts",
  weather: "Weather lookup",
  tide: "Tide lookup",
  productivity: "Ocean productivity",
  marine_conditions: "Marine conditions",
  what_if: "What-if scenario",
  general: "General question",
  casual: "Casual message",
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  hi: "Hindi",
};

function humanize(value: string): string {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function intentLabel(intent: string): string {
  return INTENT_LABELS[intent] ?? humanize(intent);
}

function languageLabel(language: string): string {
  return LANGUAGE_LABELS[language] ?? language.toUpperCase();
}

function evidenceTypeLabel(type: string): string {
  return humanize(type);
}

function normalizeRiskLevel(level: string | undefined): RiskLevel {
  const candidate = level?.toLowerCase();
  if (candidate === "low" || candidate === "moderate" || candidate === "high" || candidate === "critical") {
    return candidate;
  }
  return "unknown";
}

function statusBadgeTone(status: StageStatus): "success" | "violet" | "neutral" {
  if (status === "complete") return "success";
  if (status === "running") return "violet";
  return "neutral";
}

function confidenceTone(level: string): "success" | "warning" | "danger" | "neutral" {
  if (level === "HIGH") return "success";
  if (level === "MEDIUM") return "warning";
  if (level === "LOW") return "danger";
  return "neutral";
}

function freshnessTone(freshness: string): "success" | "warning" | "danger" | "neutral" {
  if (freshness === "LIVE" || freshness === "RECENT") return "success";
  if (freshness === "AGING") return "warning";
  if (freshness === "STALE" || freshness === "OFFLINE" || freshness === "UNAVAILABLE") return "danger";
  return "neutral";
}

function pipelineStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "success") return "success";
  if (status === "partial") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

function detectAgent(agentId: AgentId, response: SagarChatResponse): boolean {
  const evidenceTypes = new Set((response.evidence ?? []).map((item) => item.type));
  switch (agentId) {
    case "marine":
      return evidenceTypes.has("marine");
    case "weather":
      return evidenceTypes.has("weather") || evidenceTypes.has("alert");
    case "geo":
      return evidenceTypes.has("geospatial") || Boolean(response.affectedArea);
    case "risk":
      return typeof response.riskScore === "number" || typeof response.riskLevel === "string";
    case "evidence":
      return (response.evidence?.length ?? 0) > 0;
  }
}

function timelineStatus(state: RequestState): StageStatus {
  if (state === "loading") return "running";
  if (state === "success") return "complete";
  return "pending";
}

type ContentState = "empty" | "loading" | "ready";

function contentStateOf(state: RequestState): ContentState {
  if (state === "loading") return "loading";
  if (state === "success") return "ready";
  return "empty";
}

function NotRunYet() {
  return (
    <div className="iws-locked">
      <Lock size={15} />
      <p>Run the investigation above to see this stage's real result.</p>
    </div>
  );
}

function InvestigateSection({
  icon: Icon,
  title,
  description,
  status,
  badgeOverride,
  children,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
  status: StageStatus;
  badgeOverride?: { label: string; tone: "success" | "violet" | "neutral" | "warning" | "danger" };
  children: ReactNode;
}) {
  const badge = badgeOverride ?? {
    label: status === "pending" ? "Pending" : status === "running" ? "Running" : "Complete",
    tone: statusBadgeTone(status),
  };

  return (
    <section className={`iws-section iws-section-${status}`}>
      <header className="iws-section-header">
        <div className="iws-section-heading">
          <div className="iws-section-icon">
            <Icon size={17} />
          </div>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </div>
        <Badge tone={badge.tone} size="sm">
          {badge.label}
        </Badge>
      </header>

      <div className="iws-section-body">{children}</div>
    </section>
  );
}

export default function InvestigateWithSagar() {
  const navigate = useNavigate();
  const [state, setState] = useState<RequestState>("idle");
  const [response, setResponse] = useState<SagarChatResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const running = state === "loading";
  const hasRun = state !== "idle";

  const run = async () => {
    setState("loading");
    setErrorMessage(null);
    try {
      const result = await askSagarBackend(EXAMPLE_QUESTION);
      setResponse(result);
      setState("success");
    } catch (err) {
      setResponse(null);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Sagar's backend is unreachable right now."
      );
      setState("error");
    }
  };

  const reset = () => {
    setState("idle");
    setResponse(null);
    setErrorMessage(null);
  };

  const content = contentStateOf(state);
  const timeline = timelineStatus(state);

  const evidenceItems: EvidenceItem[] = (response?.evidence ?? []).map((item) => ({
    id: item.id,
    source: item.source ?? evidenceTypeLabel(item.type),
    title: item.title,
    detail: item.summary,
    timestamp: item.timestamp,
    status: "available",
  }));

  const evidenceTypesUsed = Array.from(
    new Set((response?.evidence ?? []).map((item) => item.type))
  );

  return (
    <AppShell>
      <PageContainer className="iws-page">
        <header className="iws-header">
          <div>
            <div className="iws-eyebrow">
              <Sparkles size={14} />
              <span>Live Sagar pipeline</span>
            </div>
            <h1>Investigate with Sagar</h1>
            <p>
              A walkthrough of how Sagar reasons about a marine question, backed by the real
              chat pipeline - the same POST /api/chat call used by Ask Sagar.
            </p>
          </div>
        </header>

        <div className="iws-prototype-note">
          <AlertTriangle size={14} />
          <p>
            This page calls Sagar's real backend pipeline - nothing here is simulated or timed
            locally. Where the API does not expose a stage's internal detail, that stage is
            labelled &ldquo;Not exposed&rdquo; or &ldquo;Completed in backend&rdquo; instead of being
            faked.
          </p>
        </div>

        <Card className="iws-question-card" padding="lg">
          <span className="iws-section-label">Example marine question</span>
          <p className="iws-question-text">&ldquo;{EXAMPLE_QUESTION}&rdquo;</p>
          <div className="iws-question-actions">
            <Button variant="primary" size="md" onClick={run} disabled={running}>
              {running ? (
                <RefreshCw size={15} className="iws-spin" />
              ) : (
                <Sparkles size={15} />
              )}
              {running ? "Calling Sagar's backend…" : hasRun ? "Run again" : "Start investigation"}
            </Button>
            {hasRun && !running && (
              <Button variant="ghost" size="md" onClick={reset}>
                Reset
              </Button>
            )}
          </div>

          {state === "error" && (
            <ErrorState
              title="Sagar's backend didn't respond"
              message={errorMessage ?? "The request to /api/chat failed."}
              retry={run}
            />
          )}
        </Card>

        <section className="iws-timeline" aria-label="Reasoning timeline">
          {STAGES.map((stage, index) => {
            const Icon = stage.icon;
            const isUnexposed = stage.exposure === "unexposed";
            const label =
              timeline === "complete" && isUnexposed
                ? "Completed in backend"
                : timeline === "pending"
                  ? "Pending"
                  : timeline === "running"
                    ? "Running"
                    : "Complete";
            return (
              <div key={stage.id} className={`iws-stage-node iws-stage-${timeline}`}>
                <div className="iws-stage-top">
                  <span className="iws-stage-index">{index + 1}</span>
                  <div className="iws-stage-icon">
                    {timeline === "complete" ? <CheckCircle2 size={15} /> : <Icon size={15} />}
                  </div>
                </div>
                <span className="iws-stage-label">{stage.label}</span>
                <Badge tone={isUnexposed && timeline === "complete" ? "neutral" : statusBadgeTone(timeline)} size="sm">
                  {label}
                </Badge>
              </div>
            );
          })}
        </section>

        {/* ---------- Intent Understanding (exposed) ---------- */}
        <InvestigateSection
          icon={STAGES[0]!.icon}
          title={STAGES[0]!.label}
          description={STAGES[0]!.description}
          status={timeline}
        >
          {content === "empty" && <NotRunYet />}
          {content === "loading" && <LoadingState label="Waiting for Sagar's backend…" />}
          {content === "ready" && response && (
            <div className="iws-fact-grid">
              <div className="iws-fact">
                <span>Intent</span>
                <strong>{intentLabel(response.intent)}</strong>
              </div>
              <div className="iws-fact">
                <span>Language</span>
                <strong>{languageLabel(response.language)}</strong>
              </div>
              <div className="iws-fact">
                <span>Resolved area</span>
                <strong>{response.affectedArea?.name ?? "Not resolved"}</strong>
              </div>
              <div className="iws-fact">
                <span>Region</span>
                <strong>{response.affectedArea?.region ?? "—"}</strong>
              </div>
            </div>
          )}
        </InvestigateSection>

        {/* ---------- Planning (not exposed) ---------- */}
        <InvestigateSection
          icon={STAGES[1]!.icon}
          title={STAGES[1]!.label}
          description={STAGES[1]!.description}
          status={timeline}
          badgeOverride={
            timeline === "complete"
              ? { label: "Completed in backend", tone: "neutral" }
              : undefined
          }
        >
          <div className="iws-unexposed">
            <Info size={15} />
            <p>
              Sagar's planner agent genuinely runs on every request and decides which specialist
              agents to call, but its task plan and reasoning are not part of the public
              <code> /api/chat</code> response - so this prototype cannot show them here. This is
              real backend behaviour, not a missing feature of this page.
            </p>
          </div>
        </InvestigateSection>

        {/* ---------- Agent / Tool Selection (inferred) ---------- */}
        <InvestigateSection
          icon={STAGES[2]!.icon}
          title={STAGES[2]!.label}
          description={STAGES[2]!.description}
          status={timeline}
        >
          {content === "empty" && <NotRunYet />}
          {content === "loading" && <LoadingState label="Waiting for Sagar's backend…" />}
          {content === "ready" && response && (
            <>
              <p className="iws-muted-text">
                The API does not return a direct per-agent trace, so involvement below is
                inferred from which data types actually appear in the response.
              </p>
              <div className="iws-agent-grid">
                {AGENTS.map((agent) => {
                  const Icon = agent.icon;
                  const detected = detectAgent(agent.id, response);
                  return (
                    <div key={agent.id} className="iws-agent-card">
                      <div className="iws-agent-icon">
                        <Icon size={18} />
                      </div>
                      <div className="iws-agent-body">
                        <strong>{agent.name}</strong>
                        <p>{agent.role}</p>
                      </div>
                      <Badge tone={detected ? "success" : "neutral"} size="sm">
                        {detected ? "Detected in response" : "Not detected"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </InvestigateSection>

        {/* ---------- Data Retrieval (exposed) ---------- */}
        <InvestigateSection
          icon={STAGES[3]!.icon}
          title={STAGES[3]!.label}
          description={STAGES[3]!.description}
          status={timeline}
        >
          {content === "empty" && <NotRunYet />}
          {content === "loading" && <LoadingState label="Waiting for Sagar's backend…" />}
          {content === "ready" && response && (
            <>
              <div className="iws-note">
                <Info size={14} />
                <p>{response.dataStatus.note}</p>
              </div>

              <div className="iws-datastatus-block">
                <span className="iws-section-label">Local datasets used</span>
                <div className="iws-chip-row">
                  {response.dataStatus.localSources.map((source) => (
                    <Badge key={source} tone="neutral" size="sm">
                      {source}
                    </Badge>
                  ))}
                </div>
              </div>

              {response.dataStatus.connectedExternalSources.length > 0 && (
                <div className="iws-datastatus-block">
                  <span className="iws-section-label">Connected external sources</span>
                  <div className="iws-chip-row">
                    {response.dataStatus.connectedExternalSources.map((source) => (
                      <Badge key={source.name} tone="success" size="sm">
                        {source.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {response.dataStatus.verifiedSources && response.dataStatus.verifiedSources.length > 0 && (
                <div className="iws-datastatus-block">
                  <span className="iws-section-label">Verified live readings</span>
                  <div className="iws-decision-meta">
                    {response.dataStatus.verifiedSources.map((source) => (
                      <div className="iws-provenance-row" key={`${source.name}-${source.parameter}`}>
                        <span>
                          {source.name} · {source.parameter}
                        </span>
                        <Badge tone={freshnessTone(source.freshness)} size="sm">
                          {source.freshness}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {response.dataSources && response.dataSources.length > 0 && (
                <div className="iws-datastatus-block">
                  <span className="iws-section-label">Data sources cited in this answer</span>
                  <div className="iws-chip-row">
                    {response.dataSources.map((source) => (
                      <Badge key={source} tone="neutral" size="sm">
                        {source}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </InvestigateSection>

        {/* ---------- Cross-Source Reasoning (inferred) ---------- */}
        <InvestigateSection
          icon={STAGES[4]!.icon}
          title={STAGES[4]!.label}
          description={STAGES[4]!.description}
          status={timeline}
        >
          {content === "empty" && <NotRunYet />}
          {content === "loading" && <LoadingState label="Waiting for Sagar's backend…" />}
          {content === "ready" && response && (
            <>
              <div className="iws-note">
                <Info size={14} />
                <p>
                  Sagar's risk agent combines multiple agents' outputs internally before scoring -
                  there is no separate &ldquo;fusion&rdquo; event in the API. Below is the combined
                  result: the distinct data types and key factors that fed into the decision.
                </p>
              </div>

              <span className="iws-section-label">Evidence types combined</span>
              <div className="iws-chip-row">
                {evidenceTypesUsed.length > 0 ? (
                  evidenceTypesUsed.map((type) => (
                    <Badge key={type} tone="neutral" size="sm">
                      {evidenceTypeLabel(type)}
                    </Badge>
                  ))
                ) : (
                  <span className="iws-muted-text">No evidence types were returned.</span>
                )}
              </div>

              <span className="iws-section-label">Key factors</span>
              {response.keyFactors && response.keyFactors.length > 0 ? (
                <ul className="iws-why-list">
                  {response.keyFactors.map((factor) => (
                    <li key={factor}>{factor}</li>
                  ))}
                </ul>
              ) : (
                <p className="iws-muted-text">No key factors were returned for this response.</p>
              )}
            </>
          )}
        </InvestigateSection>

        {/* ---------- Decision (exposed) ---------- */}
        <InvestigateSection
          icon={STAGES[5]!.icon}
          title={STAGES[5]!.label}
          description={STAGES[5]!.description}
          status={timeline}
        >
          {content === "empty" && <NotRunYet />}
          {content === "loading" && <LoadingState label="Waiting for Sagar's backend…" />}
          {content === "ready" && response && (
            <>
              {response.riskLevel ? (
                <RiskIndicator
                  level={normalizeRiskLevel(response.riskLevel)}
                  score={response.riskScore}
                  title="Risk assessment"
                  description={response.recommendation ?? response.situation}
                />
              ) : (
                <p className="iws-muted-text">
                  This question's intent did not produce a risk assessment.
                </p>
              )}

              <div className="iws-decision-meta">
                <div className="iws-provenance-row">
                  <span>Pipeline status</span>
                  <Badge tone={pipelineStatusTone(response.status)} size="sm">
                    {response.status}
                  </Badge>
                </div>
                <div className="iws-provenance-row">
                  <span>Confidence</span>
                  <Badge tone={confidenceTone(response.dataStatus.confidence.level)} size="sm">
                    {response.dataStatus.confidence.level}
                  </Badge>
                </div>
                <div className="iws-provenance-row">
                  <span>Confidence basis</span>
                  <span className="iws-inline-detail">{response.dataStatus.confidence.explanation}</span>
                </div>
              </div>
            </>
          )}
        </InvestigateSection>

        {/* ---------- Evidence (exposed) ---------- */}
        <InvestigateSection
          icon={STAGES[6]!.icon}
          title={STAGES[6]!.label}
          description={STAGES[6]!.description}
          status={timeline}
        >
          {content === "empty" && <NotRunYet />}
          {content === "loading" && <LoadingState label="Waiting for Sagar's backend…" />}
          {content === "ready" && (
            <EvidencePanel
              title={`Evidence returned for this answer (${evidenceItems.length})`}
              items={evidenceItems}
            />
          )}
        </InvestigateSection>

        {/* ---------- Final Answer (exposed) ---------- */}
        <InvestigateSection
          icon={STAGES[7]!.icon}
          title={STAGES[7]!.label}
          description={STAGES[7]!.description}
          status={timeline}
        >
          {content === "empty" && <NotRunYet />}
          {content === "loading" && <LoadingState label="Waiting for Sagar's backend…" />}
          {content === "ready" && response && (
            <div className="iws-answer">
              <div className="iws-answer-row">
                <span className="iws-section-label">Decision</span>
                <p>{response.answer}</p>
              </div>

              <div className="iws-answer-row">
                <span className="iws-section-label">Why</span>
                {response.keyFactors && response.keyFactors.length > 0 ? (
                  <ul className="iws-why-list">
                    {response.keyFactors.map((factor) => (
                      <li key={factor}>{factor}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="iws-muted-text">No key factors were returned for this answer.</p>
                )}
              </div>

              <div className="iws-answer-row">
                <span className="iws-section-label">Evidence</span>
                <div className="iws-chip-row">
                  {response.dataSources && response.dataSources.length > 0 ? (
                    response.dataSources.map((source) => (
                      <Badge key={source} tone="neutral" size="sm">
                        {source}
                      </Badge>
                    ))
                  ) : (
                    <span className="iws-muted-text">No data sources were cited.</span>
                  )}
                </div>
              </div>

              <div className="iws-answer-row">
                <span className="iws-section-label">Next action</span>
                <p>
                  {response.warnings && response.warnings.length > 0
                    ? response.warnings.join(" ")
                    : "Check the latest marine alerts for the area before departure."}
                </p>
                <div className="iws-answer-actions">
                  <Button variant="secondary" size="sm" onClick={() => navigate(ROUTES.ALERTS)}>
                    View marine alerts
                    <ArrowRight size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Run again
                  </Button>
                </div>
              </div>
            </div>
          )}
        </InvestigateSection>
      </PageContainer>
    </AppShell>
  );
}
