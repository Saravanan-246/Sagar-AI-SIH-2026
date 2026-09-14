import "dotenv/config";

import { createApp } from "./app";
import { config } from "./config";

const app = createApp();

app.listen(config.port, () => {
  console.log(
    `Sagar AI server listening on http://localhost:${config.port} (${config.nodeEnv})`
  );

  console.log(
    `AI narration: ${config.ai.enabled ? `enabled (${config.ai.provider}/${config.ai.model})` : "disabled (using deterministic Sagar responses)"}`
  );
});
