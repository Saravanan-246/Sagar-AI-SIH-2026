import "dotenv/config";

import { createApp } from "./app";
import { config } from "./config";
import { getLlmProvider } from "./services/llm/llmProvider";

const app = createApp();

app.listen(config.port, "0.0.0.0", () => {
  console.log(
    `Sagar AI server listening on http://0.0.0.0:${config.port} (${config.nodeEnv})`
  );

  const llm = getLlmProvider();

  console.log(
    `AI narration: ${
      llm.isEnabled()
        ? `enabled (${llm.name}/${llm.model})`
        : "disabled (using deterministic Sagar responses)"
    }`
  );
});