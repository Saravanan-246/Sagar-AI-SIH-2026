// Repeatable smoke test for the Sagar AI backend.
// Usage: node scripts/smoke-test.mjs [baseUrl]
// Requires the server to already be running (npm run dev / npm start).

const BASE_URL = process.argv[2] ?? "http://localhost:4000";

let passCount = 0;
let failCount = 0;

function ok(label, condition, detail) {
  if (condition) {
    passCount += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failCount += 1;
    console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`);
  }
}

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function postJson(path, payload) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function testHealth() {
  console.log("\n[health] GET /api/health");
  const { status, body } = await getJson("/api/health");
  ok("responds 200", status === 200);
  ok("status ok", body?.status === "ok");
}

async function testChatSafety() {
  console.log("\n[chat] safety query");
  const { status, body } = await postJson("/api/chat", {
    message: "Is it safe to fish today?",
  });
  ok("responds 200", status === 200);
  ok("has answer text", typeof body?.answer === "string" && body.answer.length > 0);
  ok("has riskScore", typeof body?.riskScore === "number");
  ok("has riskLevel", typeof body?.riskLevel === "string");
  ok("has keyFactors", Array.isArray(body?.keyFactors));
  ok("has evidence", Array.isArray(body?.evidence) && body.evidence.length > 0);
  ok("has dataStatus.mode=prototype", body?.dataStatus?.mode === "prototype");
  ok(
    "dataStatus lists INCOIS as connected (not merely planned)",
    Array.isArray(body?.dataStatus?.connectedExternalSources) &&
      body.dataStatus.connectedExternalSources.some((s) => s.name === "INCOIS")
  );
  ok(
    "dataStatus lists IMD/ISRO as not yet connected",
    Array.isArray(body?.dataStatus?.plannedLiveSources) &&
      body.dataStatus.plannedLiveSources.some((s) => s.name === "IMD") &&
      body.dataStatus.plannedLiveSources.some((s) => s.name === "ISRO")
  );
}

async function testChatProductivity() {
  console.log("\n[chat] productivity-decline query");
  const { status, body } = await postJson("/api/chat", {
    message: "Why has productivity decreased in the Northern Gulf of Mannar?",
    areaId: "north-gulf-mannar",
  });
  ok("responds 200", status === 200);
  ok("intent is productivity", body?.intent === "productivity");
  ok(
    "answer mentions decline/declining",
    /declin/i.test(body?.answer ?? "")
  );
}

async function testChatFishingZone() {
  console.log("\n[chat] fishing-zone query");
  const { status, body } = await postJson("/api/chat", {
    message: "Which fishing zone is best right now?",
  });
  ok("responds 200", status === 200);
  ok("intent is pfz", body?.intent === "pfz");
  ok("has ranked zones", Array.isArray(body?.zones) && body.zones.length > 0);
  ok(
    "zones carry PREFER/MONITOR/AVOID",
    body?.zones?.every((z) =>
      ["PREFER", "MONITOR", "AVOID"].includes(z.recommendation)
    )
  );
}

async function testChatRoute() {
  console.log("\n[chat] route query");
  const { status, body } = await postJson("/api/chat", {
    message: "Give me the safest route.",
  });
  ok("responds 200", status === 200);
  ok("intent is route", body?.intent === "route");
  ok("has a route with a reason", Boolean(body?.route?.reason));
  ok("route carries a risk score", typeof body?.route?.risk?.score === "number");
}

async function testChatWhatIf() {
  console.log("\n[chat] what-if query");
  const { status, body } = await postJson("/api/chat", {
    message: "What if wind speed increases by 30%?",
  });
  ok("responds 200", status === 200);
  ok("has whatIf comparison", Boolean(body?.whatIf));
  ok(
    "whatIf has before/after risk",
    typeof body?.whatIf?.before?.riskScore === "number" &&
      typeof body?.whatIf?.after?.riskScore === "number"
  );
}

async function testScenarioRun() {
  console.log("\n[scenarios] list + run");
  const list = await getJson("/api/scenarios");
  ok("list responds 200", list.status === 200);
  ok("has scenarios", Array.isArray(list.body?.scenarios) && list.body.scenarios.length > 0);

  const firstId = list.body?.scenarios?.[0]?.id;
  const run = await postJson("/api/scenarios", {
    scenarioId: firstId,
    inputs: { durationHours: 10 },
  });
  ok("run responds 200", run.status === 200);
  ok("run has a risk result", typeof run.body?.result?.riskScore === "number");
}

async function testMarine() {
  console.log("\n[marine] GET /api/marine");
  const { status, body } = await getJson("/api/marine");
  ok("responds 200", status === 200);
  ok("has areas", Array.isArray(body?.areas) && body.areas.length > 0);
}

async function testAlerts() {
  console.log("\n[alerts] GET /api/alerts");
  const { status, body } = await getJson("/api/alerts");
  ok("responds 200", status === 200);
  ok("has alerts", Array.isArray(body?.alerts) && body.alerts.length > 0);
  ok(
    "alerts have normalized severity",
    body.alerts.every((a) =>
      ["low", "moderate", "high", "critical"].includes(a.severity)
    )
  );
}

async function testZones() {
  console.log("\n[zones] GET /api/zones");
  const { status, body } = await getJson("/api/zones");
  ok("responds 200", status === 200);
  ok("has zones", Array.isArray(body?.zones) && body.zones.length > 0);
  const avoid = await getJson("/api/zones?recommendation=AVOID");
  ok(
    "AVOID filter returns only AVOID zones",
    avoid.body.zones.every((z) => z.recommendation === "AVOID")
  );
}

async function testRoutes() {
  console.log("\n[routes] GET /api/routes");
  const { status, body } = await getJson("/api/routes");
  ok("responds 200", status === 200);
  ok("has routes", Array.isArray(body?.routes) && body.routes.length > 0);
}

async function testValidationError() {
  console.log("\n[validation] POST /api/chat with empty message");
  const { status, body } = await postJson("/api/chat", { message: "" });
  ok("responds 400", status === 400);
  ok("has validation_error shape", body?.error === "validation_error");
}

async function main() {
  console.log(`Sagar AI backend smoke test -> ${BASE_URL}`);

  await testHealth();
  await testChatSafety();
  await testChatProductivity();
  await testChatFishingZone();
  await testChatRoute();
  await testChatWhatIf();
  await testScenarioRun();
  await testMarine();
  await testAlerts();
  await testZones();
  await testRoutes();
  await testValidationError();

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Smoke test crashed:", error);
  process.exit(1);
});
