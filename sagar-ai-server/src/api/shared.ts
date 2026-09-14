import { randomUUID } from "crypto";

import {
  getDefaultMarineArea,
  getMarineArea,
  getMarineAreaByName,
} from "../services/marine/marineData";

import type { AgentRequest } from "../services/agents/agentTypes";
import type { ChatIntent, ChatLanguage } from "../types/chat";
import type { MarineArea } from "../types/marine";

export function resolveArea(query: {
  areaId?: string;
  areaName?: string;
}): MarineArea {
  if (query.areaId) {
    const area = getMarineArea(query.areaId);
    if (area) {
      return area;
    }
  }

  if (query.areaName) {
    const area = getMarineAreaByName(query.areaName);
    if (area) {
      return area;
    }
  }

  return getDefaultMarineArea();
}

export function buildAgentRequest(input: {
  message?: string;
  language?: ChatLanguage;
  intent?: ChatIntent;
  areaId?: string;
  areaName?: string;
}): AgentRequest {
  const area = resolveArea(input);
  const language = input.language ?? "en";
  const intent = input.intent ?? "general";

  return {
    requestId: randomUUID(),
    message: input.message ?? `Marine information for ${area.name}`,
    language,
    intent,
    context: {
      areaId: area.id,
      areaName: area.name,
      language,
      intent,
    },
    area,
  };
}
