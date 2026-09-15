import "dotenv/config";

import { createApp } from "./app";
import { config } from "./config";
import { getLlmProvider } from "./services/llm/llmProvider";

const app = createApp();

app.listen(config.port, () => {
  console.log(
    `Sagar AI server listening on http://localhost:${config.port} (${config.nodeEnv})`
  );

  const llm = getLlmProvider();

  console.log(
    `AI narration: ${llm.isEnabled() ? `enabled (${llm.name}/${llm.model})` : "disabled (using deterministic Sagar responses)"}`
  );
});
