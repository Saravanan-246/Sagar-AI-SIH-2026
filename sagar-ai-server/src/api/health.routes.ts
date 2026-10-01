import { Router } from "express";

import { config } from "../config";
import {
  getLlmProvider,
  supportsMultilingualNarration,
} from "../services/llm/llmProvider";
import { probeOllama } from "../services/llm/ollamaProvider";

const router = Router();

/**
 * GET /api/health - liveness: answers as soon as the server is up, never
 * waits on the LLM. This is what a phone on the LAN opens to confirm it
 * can reach the backend at all.
 */
router.get("/", (_req, res) => {
  const llm = getLlmProvider();
  const llmEnabled = llm.isEnabled();

  res.json({
    status: "ok",
    service: "sagar-ai-server",
    llmProvider: config.llm.provider,
    aiEnabled: llmEnabled,
    aiModel: llmEnabled ? llm.model : null,
    aiProvider: llmEnabled ? llm.name : null,
    aiMultilingualNarration: supportsMultilingualNarration(),
  });
});

/**
 * GET /api/health/llm - whether this server can actually reach its LLM
 * right now. Reports outcome classes only: never the LLM's URL, host or
 * raw error text. Always 200 - "status" carries the result - so a
 * diagnostic panel can read it like any other response.
 */
router.get("/llm", async (_req, res) => {
  const llm = getLlmProvider();

  if (!llm.isEnabled()) {
    res.json({
      status: "disabled",
      llmProvider: llm.name,
      model: null,
      reachable: null,
      modelAvailable: null,
      note: "No LLM configured - Sagar answers with its deterministic narrator.",
    });
    return;
  }

  // Probing a hosted API would spend quota on every check.
  if (llm.name !== "ollama") {
    res.json({
      status: "not_probed",
      llmProvider: llm.name,
      model: llm.model,
      reachable: null,
      modelAvailable: null,
    });
    return;
  }

  const probe = await probeOllama();

  res.json({
    status: !probe.reachable
      ? "unreachable"
      : probe.modelAvailable === false
        ? "model_missing"
        : "ok",
    llmProvider: llm.name,
    model: llm.model,
    reachable: probe.reachable,
    modelAvailable: probe.modelAvailable,
    latencyMs: probe.latencyMs,
    error: probe.error,
    httpStatus: probe.httpStatus,
  });
});

export default router;
