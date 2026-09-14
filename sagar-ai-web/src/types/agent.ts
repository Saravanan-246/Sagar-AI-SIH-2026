import type {
  AgentName,
  AgentStatus,
  AgentFinding,
  AgentEvidence,
  AgentRequest,
  AgentResponse,
  PlannerTask,
  PlannerResult,
  AgentExecutionTrace,
  AgentPipelineResult,
} from "../services/agents/agentTypes";

export type {
  AgentName,
  AgentStatus,
  AgentFinding,
  AgentEvidence,
  AgentRequest,
  AgentResponse,
  PlannerTask,
  PlannerResult,
  AgentExecutionTrace,
  AgentPipelineResult,
};

export interface AgentConfig {
  name: AgentName;

  displayName: string;

  description: string;

  enabled: boolean;

  priority: number;

  canRunInParallel: boolean;

  requiredFor?: string[];

  metadata?: Record<string, unknown>;
}

export interface AgentExecutionContext {
  requestId: string;

  startedAt: string;

  completedAt?: string;

  currentAgent?: AgentName;

  completedAgents: AgentName[];

  skippedAgents: AgentName[];

  failedAgents: AgentName[];

  trace: AgentExecutionTrace[];

  metadata?: Record<string, unknown>;
}

export interface AgentCapability {
  agent: AgentName;

  capabilities: string[];

  supportedIntents?: string[];

  supportedDomains?: string[];

  outputs: string[];
}

export interface AgentRegistryEntry {
  config: AgentConfig;

  capability: AgentCapability;
}