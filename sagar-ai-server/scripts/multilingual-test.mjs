// Focused multilingual / code-switching checks for Sagar AI.
// Usage: npm run build && node scripts/multilingual-test.mjs [baseUrl]
// The detector/intent checks run against dist/. The multi-turn
// conversation checks run only when a baseUrl is given and the server
// is already running (npm run dev / npm start).

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  analyzeIntent,
  detectLanguageWithMetadata,
  resolveTurnLanguage,
} = require("../dist/services/ai/intent.js");

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

// [message, expected language, expected intent, confident?]
const cases = [
  ["Can you find the best fishing zone?", "en", "pfz", true],
  ["Yaanku best fishing zone soluu", "ta", "pfz", true],
  ["Anga weather epdi?", "ta", "marine_conditions", true],
  ["Chennai la tomorrow weather epdi irukku?", "ta", "marine_conditions", true],
  ["Can I go kadalukku tomorrow?", "ta", "safety", true],
  ["நாளை கடல் எப்படி இருக்கு?", "ta", "safety", true],
  ["ఏ fishing zone best?", "te", "pfz", true],
  ["मछली पकड़ने के लिए सबसे अच्छा zone कौन सा है?", "hi", "pfz", true],
  ["Naalaiku pogalama?", "ta", "safety", true],
  ["Is it safe to go there tomorrow?", "en", "safety", true],
  ["Which route is safer?", "en", "route", true],
  ["weather எப்படி இருக்கு tomorrow?", "ta", "marine_conditions", true],
  ["repu akkada vellavacha", "te", "safety", true],
  ["kya hum wahan ja sakte hain", "hi", "safety", true],
];

console.log("\n[detector + intent]");
for (const [message, language, intent, confident] of cases) {
  const meta = detectLanguageWithMetadata(message);
  const analysis = analyzeIntent(message);
  ok(
    `${message} -> ${language}/${intent}`,
    meta.language === language &&
      analysis.intent === intent &&
      (meta.confidence >= 0.6) === confident,
    `got ${meta.language}@${meta.confidence}/${analysis.intent}`,
  );
}

console.log("\n[metadata shape]");
{
  const meta = detectLanguageWithMetadata("Chennai la tomorrow weather epdi irukku?");
  ok("Tanglish is transliterated + code-switched",
    meta.script === "Latin" && meta.isTransliterated && meta.isCodeSwitched);
  const tamil = detectLanguageWithMetadata("நாளை கடல் எப்படி இருக்கு?");
  ok("Tamil script is native", tamil.script === "Tamil" && !tamil.isTransliterated);
}

console.log("\n[per-turn language]");
{
  const history = ["Find the best fishing zone near Thoothukudi.", "Anga weather epdi?"];
  ok("short ambiguous turn keeps session language",
    resolveTurnLanguage("Thoothukudi?", history) === "ta");
  ok("one English word does not flip Tamil session",
    resolveTurnLanguage("ok", ["Naalaiku pogalama?"]) === "ta");
  ok("full English sentence switches to English",
    resolveTurnLanguage("Is it safe to go there tomorrow?", history) === "en");
  ok("Hindi turn switches to Hindi",
    resolveTurnLanguage("कल समुद्र कैसा रहेगा?", history) === "hi");
  ok("empty history falls back to caller default",
    resolveTurnLanguage("ok", [], "en") === "en");
}

const baseUrl = process.argv[2];

if (baseUrl) {
  console.log(`\n[multi-turn conversation against ${baseUrl}]`);
  const turns = [
    ["Find the best fishing zone near Thoothukudi.", "en"],
    ["Anga weather epdi?", "ta"],
    ["Naalaiku pogalama?", "ta"],
    ["Is it safe tomorrow?", null],
    ["Which route is safer?", "en"],
  ];
  const history = [];

  for (const [message, expectedLanguage] of turns) {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    const body = await res.json().catch(() => null);
    const answer = body?.answer ?? "";
    const area = body?.areaName ?? body?.area?.name ?? body?.context?.areaName ?? "";
    ok(`"${message}" answered`, res.status === 200 && answer.length > 0, `status ${res.status}`);
    ok(`"${message}" keeps Thoothukudi context`,
      /thoothukudi|tuticorin|தூத்துக்குடி/i.test(`${area} ${answer} ${JSON.stringify(body?.evidence ?? "")}`),
      `area=${area}`);
    if (expectedLanguage) {
      ok(`"${message}" replies in ${expectedLanguage}`, body?.language === expectedLanguage,
        `got ${body?.language}`);
    }
    history.push({ role: "user", text: message }, { role: "assistant", text: answer });
  }
}

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
