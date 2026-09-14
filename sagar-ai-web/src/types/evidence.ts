import type {
  AgentEvidence,
  AgentFinding,
} from "../services/agents/agentTypes";

export type EvidenceType =
  | "marine"
  | "weather"
  | "ocean"
  | "geospatial"
  | "alert"
  | "route"
  | "scenario"
  | "source";

export type EvidenceQuality =
  | "low"
  | "moderate"
  | "high";

export interface EvidenceItem
  extends AgentEvidence {
  type: EvidenceType;

  quality?: EvidenceQuality;

  relevanceScore?: number;

  confidence?: number;

  location?: {
    latitude: number;
    longitude: number;
  };

  sourceMetadata?: Record<
    string,
    unknown
  >;
}

export interface EvidenceGroup {
  id: string;

  title: string;

  type: EvidenceType;

  items: EvidenceItem[];

  relevanceScore: number;

  confidence: number;
}

export interface EvidenceSummary {
  total: number;

  highConfidence: number;

  sources: string[];

  groups: EvidenceGroup[];

  strongestEvidence: EvidenceItem[];
}

export interface EvidenceAnalysis {
  findings: AgentFinding[];

  evidence: EvidenceItem[];

  summary: EvidenceSummary;

  confidence: number;

  warnings?: string[];
}