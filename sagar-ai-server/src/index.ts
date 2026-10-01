import "dotenv/config";

import { networkInterfaces } from "os";

import { createApp } from "./app";
import { config } from "./config";
import { getLlmProvider } from "./services/llm/llmProvider";
import { probeOllama } from "./services/llm/ollamaProvider";

const app = createApp();

/** This machine's IPv4 LAN addresses - what a phone on the same Wi-Fi uses. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}

app.listen(config.port, "0.0.0.0", () => {
  console.log(
    `Sagar AI server listening on http://0.0.0.0:${config.port} (${config.nodeEnv})`
  );
  console.log(`  This PC:  http://localhost:${config.port}/api/health`);

  for (const address of lanAddresses()) {
    console.log(`  LAN:      http://${address}:${config.port}/api/health`);
  }

  console.log(
    config.nodeEnv === "production"
      ? "  CORS:     CORS_ORIGIN list only"
      : "  CORS:     CORS_ORIGIN list + any localhost / private-LAN dev origin"
  );

  const llm = getLlmProvider();

  console.log(
    `AI narration: ${
      llm.isEnabled()
        ? `enabled (${llm.name}/${llm.model})`
        : "disabled (using deterministic Sagar responses)"
    }`
  );

  // A down Ollama never blocks startup - chat falls back to the
  // deterministic narrator - but it should be obvious up front.
  if (llm.isEnabled() && llm.name === "ollama") {
    void probeOllama().then((probe) => {
      if (!probe.reachable) {
        console.warn(
          `AI narration: Ollama is NOT reachable (${probe.error ?? "unknown error"}) - replies will use deterministic narration until it is running.`
        );
      } else if (probe.modelAvailable === false) {
        console.warn(
          `AI narration: Ollama is running but model "${llm.model}" is not installed - run: ollama pull ${llm.model}`
        );
      } else {
        console.log(`AI narration: Ollama reachable (${probe.latencyMs}ms)`);
      }
    });
  }
});
