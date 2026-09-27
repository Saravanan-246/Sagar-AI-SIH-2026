// Response-quality, narration-guard and LLM-provider checks for Sagar AI.
// Usage: npm run build && node scripts/response-quality-test.mjs [baseUrl] [--providers]
//   (no args)     guard unit checks only (offline, fast)
//   baseUrl       + live answer-quality checks against a running server
//   --providers   + real Ollama / OpenRouter / fallback narration checks
//                   (uses the configured .env; never prints keys)

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---- child mode: one provider check under an env override ----------
if (process.argv[2] === "--provider-child") {
  require("dotenv/config");
  const { getLlmProvider, isLlmEnabled } = require("../dist/services/llm/llmProvider.js");
  const { narrateResponse } = require("../dist/services/ai/responseNarrator.js");
  const facts = {
    userQuestion: "Is it safe to go there tomorrow?",
    areaName: "Thoothukudi Coast",
    situation: "A strong-wind hazard has been flagged for Thoothukudi Coast.",
    recommendation: "Overall, conditions look favourable - just run your usual checks before heading out.",
    riskLevel: "low",
    riskScore: 22,
    keyFactors: ["Wind 28 km/h from the south-west", "Wave height 1.2 m"],
    freshness: "medium confidence - Recent data from a verified source.",
    language: process.env.TEST_LANGUAGE ?? "en",
  };
  const started = Date.now();
  const text = await narrateResponse(facts, Number(process.env.TEST_TIMEOUT_MS ?? 60000));
  console.log(JSON.stringify({
    provider: getLlmProvider().name,
    enabled: isLlmEnabled(),
    ms: Date.now() - started,
    text,
  }));
  process.exit(0);
}

const { checkNarration, sanitizeNarration } = require("../dist/services/ai/narrationGuard.js");

let passCount = 0;
let failCount = 0;
let skipCount = 0;

function ok(label, condition, detail) {
  if (condition) {
    passCount += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failCount += 1;
    console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`);
  }
}

function skip(label, why) {
  skipCount += 1;
  console.log(`  SKIP  ${label} (${why})`);
}

const numbersIn = (text) =>
  (String(text).match(/\d+(?:\.\d+)?/g) ?? []).map((value) => String(Number(value)));

// ---- narration guard ----------------------------------------------
console.log("\n[narration guard]");
{
  const facts = {
    factsText: "Area: Thoothukudi Coast\nRisk: low (22/100)\nKey factors: Wind 28 km/h; Wave height 1.2 m\nData sources: Open-Meteo",
    userText: "Is it safe to go there tomorrow?",
    riskLevel: "low",
    language: "en",
  };
  const accept = (text, extra = {}) => checkNarration(text, { ...facts, ...extra });

  ok("faithful rephrase accepted",
    accept("Conditions look fine near Thoothukudi right now, with waves around 1.2 m. Keep an eye on the 28 km/h wind.").ok);
  ok("real Ollama output that contradicted a low risk is rejected",
    !accept("I wouldn't head out near Thoothukudi tomorrow - strong winds are a concern.").ok);
  ok("invented wave height rejected", !accept("Waves are about 2.5 m, so take care.").ok);
  ok("changed risk level rejected", !accept("It's a high risk day out there.").ok);
  ok("invented data source rejected", !accept("INCOIS reports calm seas right now.").ok);
  ok("invented route name rejected", !accept("Take the Vembar Inshore Track for a calmer ride.").ok);
  ok("invented alert rejected", !accept("There is an active alert for the area, so be careful.").ok);
  ok("internal-pipeline talk rejected", !accept("As an AI language model, I think the sea is fine.").ok);
  ok("JSON output rejected", !accept('{"answer": "safe"}').ok);
  ok("encouraging a critical-risk trip rejected",
    !checkNarration("It's safe to go today.", { ...facts, riskLevel: "critical" }).ok);
  ok("dropping a staleness caveat rejected",
    !accept("Conditions look fine right now.", { requiresFreshnessCaveat: true }).ok);
  ok("keeping the staleness caveat accepted",
    accept("Conditions look fine as of the latest reading, but it may be a little old.", { requiresFreshnessCaveat: true }).ok);
  ok("current readings presented as tomorrow's forecast rejected",
    !accept("Tomorrow, the coast will face strong wind at 28 km/h and waves up to 1.2 m.").ok);
  ok("tomorrow claim without a current-conditions qualifier rejected",
    !accept("It's safe to go there tomorrow, with low risk.").ok);
  ok("tomorrow question answered from current conditions accepted",
    accept("Right now conditions look fine for tomorrow's trip - just do your usual checks.").ok);
  ok("reply cut off mid-sentence rejected (any script)",
    !checkNarration("இன்று கடல் நிலை மாறும் உள்ளத", { ...facts, language: "ta" }).ok);
  ok("restated numeric score rejected", !accept("Risk is low at 22/100 right now.").ok);
  ok("Tamil rephrase with the same numbers accepted",
    checkNarration("தூத்துக்குடி அருகே அலை 1.2 m, காற்று 28 km/h.", { ...facts, language: "ta" }).ok);
  ok("Tamil rephrase with an invented number rejected",
    !checkNarration("அலை 3 m உயரம்.", { ...facts, language: "ta" }).ok);

  ok("sanitize strips labels, markdown and filler openers",
    sanitizeNarration('Sagar: **According to the system, the sea is calm.**') === "The sea is calm.",
    sanitizeNarration('Sagar: **According to the system, the sea is calm.**'));
  ok("sanitize strips leaked reasoning",
    sanitizeNarration("<think>check wind</think>Sea is calm near the coast.") === "Sea is calm near the coast.");
  ok("sanitize returns null for reasoning-only output",
    sanitizeNarration("<think>only thinking") === null);
}

// ---- live answers --------------------------------------------------
const args = process.argv.slice(2);
const baseUrl = args.find((arg) => arg.startsWith("http"));

async function ask(message, history) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function checkAnswerQuality(label, body) {
  const answer = body?.answer ?? "";
  ok(`${label}: answered`, answer.length > 0);
  ok(`${label}: concise (<= 600 chars)`, answer.length <= 600, `${answer.length} chars`);
  ok(`${label}: no robotic openers`,
    !/according to the system|based on the available data|as an ai/i.test(answer), answer);
  ok(`${label}: voice-safe (no markdown, tables or URLs)`,
    !/https?:\/\/|\*\*|^#|\|.*\|/m.test(answer), answer);
  // Every number stated must come from the structured result itself.
  const { answer: _a, ...rest } = body ?? {};
  const structured = new Set(numbersIn(JSON.stringify(rest)));
  const unsupported = numbersIn(answer).filter((value) => !structured.has(value));
  ok(`${label}: no fabricated numbers`, unsupported.length === 0, unsupported.join(","));
}

if (baseUrl) {
  console.log(`\n[single-turn answers against ${baseUrl}]`);
  // [message, intent, language, context turn to establish an area?]
  const cases = [
    ["Can you find the best fishing zone?", "pfz", "en"],
    ["நாளை கடல் எப்படி இருக்கு?", "safety", "ta"],
    ["Yaanku best fishing zone soluu", "pfz", "ta"],
    ["Anga weather epdi?", "marine_conditions", "ta"],
    ["Chennai la tomorrow weather epdi irukku?", "marine_conditions", "ta"],
    ["Can I go kadalukku tomorrow?", "safety", "ta"],
    ["ఏ fishing zone best?", "pfz", "te"],
    ["मछली पकड़ने के लिए सबसे अच्छा zone कौन सा है?", "pfz", "hi"],
    ["Naalaiku pogalama?", "safety", "ta"],
    ["Is it safe to go there tomorrow?", "safety", "en"],
    ["Which route is safer?", "route", "en"],
  ];
  const areaTurn = [
    { role: "user", text: "Find the best fishing zone near Thoothukudi." },
    { role: "assistant", text: "Gulf of Mannar South PFZ ranks highest near Thoothukudi Coast." },
  ];

  for (const [message, intent, language] of cases) {
    const { status, body } = await ask(message, areaTurn);
    ok(`"${message}": 200`, status === 200, `status ${status}`);
    ok(`"${message}": intent ${intent}`, body?.intent === intent, `got ${body?.intent}`);
    ok(`"${message}": language ${language}`, body?.language === language, `got ${body?.language}`);
    ok(`"${message}": keeps Thoothukudi context`,
      /thoothukudi/i.test(body?.affectedArea?.name ?? ""), `area=${body?.affectedArea?.name}`);
    checkAnswerQuality(`"${message}"`, body);
  }

  console.log("\n[conversation: Thoothukudi -> Anga -> Naalaiku -> safety -> route]");
  const turns = [
    ["Find the best fishing zone near Thoothukudi.", "pfz", "en"],
    ["Anga weather epdi?", "marine_conditions", "ta"],
    ["Naalaiku pogalama?", "safety", "ta"],
    ["Is it safe to go there tomorrow?", "safety", "en"],
    ["Which route is safer?", "route", "en"],
  ];
  const history = [];
  for (const [message, intent, language] of turns) {
    const { body } = await ask(message, history);
    ok(`"${message}": ${intent}/${language}`,
      body?.intent === intent && body?.language === language,
      `got ${body?.intent}/${body?.language}`);
    ok(`"${message}": area kept`, /thoothukudi/i.test(body?.affectedArea?.name ?? ""),
      `area=${body?.affectedArea?.name}`);
    ok(`"${message}": does not ask for the location again`,
      !/current location|pick an area|choose an area|இருப்பிட/i.test(body?.answer ?? ""), body?.answer);
    checkAnswerQuality(`"${message}"`, body);
    history.push({ role: "user", text: message }, { role: "assistant", text: body?.answer ?? "" });
  }
}

// ---- providers -------------------------------------------------------
function runProvider(env) {
  const child = spawnSync(process.execPath, [new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), "--provider-child"], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 120000,
  });
  const line = (child.stdout ?? "").trim().split("\n").pop();
  try {
    // Provider log lines ("[llm] narration rejected (...)") explain a
    // null result; keys never appear in them.
    const log = (child.stderr ?? "").split("\n").filter((l) => /^\[(llm|ai)\]/.test(l)).join(" | ");
    return { ...JSON.parse(line), log };
  } catch {
    return { error: (child.stderr || child.stdout || "no output").slice(0, 300) };
  }
}

function checkProviderResult(label, result) {
  if (result.text === null) {
    ok(`${label}: failed/rejected output fell back to null (deterministic answer used)`, true);
    if (result.log) console.log(`        -> ${result.log}`);
    return;
  }
  const verdict = checkNarration(result.text, {
    factsText: "Thoothukudi Coast low 28 km/h 1.2 m favourable strong-wind",
    userText: "Is it safe to go there tomorrow?",
    riskLevel: "low",
    language: "en",
  });
  ok(`${label}: output is fact-consistent`, verdict.ok, `${verdict.reason ?? ""} :: ${result.text}`);
  console.log(`        -> "${result.text}" (${result.ms} ms)`);
}

if (args.includes("--providers")) {
  console.log("\n[providers]");

  const ollama = runProvider({ LLM_PROVIDER: "ollama" });
  ok("LLM_PROVIDER=ollama selects the Ollama provider", ollama.provider === "ollama", ollama.error);
  if (ollama.provider === "ollama") checkProviderResult("ollama narration", ollama);

  const down = runProvider({
    LLM_PROVIDER: "ollama",
    OLLAMA_BASE_URL: "http://127.0.0.1:9",
    TEST_TIMEOUT_MS: "5000",
  });
  ok("Ollama unreachable -> null quickly (deterministic fallback)",
    down.text === null && down.ms < 6000, JSON.stringify(down));

  const openrouter = runProvider({ LLM_PROVIDER: "openrouter" });
  ok("LLM_PROVIDER=openrouter selects the OpenRouter provider",
    openrouter.provider === "openrouter", openrouter.error);
  if (openrouter.provider === "openrouter" && openrouter.enabled) {
    checkProviderResult("openrouter narration", openrouter);
  } else {
    skip("openrouter narration", "no OpenRouter key configured");
  }

  const noKey = runProvider({
    LLM_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "",
    TEST_TIMEOUT_MS: "5000",
  });
  ok("OpenRouter without a key -> disabled, null, no request",
    noKey.enabled === false && noKey.text === null, JSON.stringify(noKey));
}

console.log(`\n${passCount} passed, ${failCount} failed${skipCount ? `, ${skipCount} skipped` : ""}`);
process.exit(failCount === 0 ? 0 : 1);
