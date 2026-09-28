// Chat routing test: simple conversational/capability questions must take
// the fast path (no LLM, no marine pipeline), marine questions must still
// run the full pipeline, in every supported language.
//
// Usage: node scripts/chat-routing-test.mjs [baseUrl]
// Requires the server running in development mode (npm run dev / npm start):
// the x-sagar-path header it checks is only sent outside production.

const BASE_URL = process.argv[2] ?? "http://localhost:4000";

// The fast path does no I/O beyond the request itself; anything close to
// this means an LLM or data call slipped in.
const FAST_PATH_MAX_MS = 250;

const TAMIL = /[஀-௿]/;
const DEVANAGARI = /[ऀ-ॿ]/;

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

async function chat(message, extra = {}) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, ...extra }),
  });
  const body = await res.json().catch(() => null);
  return {
    status: res.status,
    body,
    path: res.headers.get("x-sagar-path"),
    ms: Date.now() - started,
  };
}

async function expectFast(label, message, { intent, check, checkLabel, requested } = {}) {
  console.log(`\n[fast] ${label}: ${message}`);
  const { status, body, path, ms } = await chat(message);
  ok("responds 200", status === 200);
  ok("takes the conversational fast path (no marine pipeline)", path === "conversational", `path=${path}`);
  ok(`answers in under ${FAST_PATH_MAX_MS} ms`, ms < FAST_PATH_MAX_MS, `${ms} ms`);
  if (intent) ok(`intent is ${intent}`, body?.intent === intent, body?.intent);
  ok("never 'outside scope'", !/outside Sagar/i.test(body?.answer ?? ""), body?.answer);
  if (check) ok(checkLabel, check(body?.answer ?? "", body), body?.answer);
  if (requested) ok(`requestedLanguage is ${requested}`, body?.requestedLanguage === requested, body?.requestedLanguage);
}

async function expectPipeline(label, message, extra, { intents, check, checkLabel }) {
  console.log(`\n[pipeline] ${label}: ${message}`);
  const { status, body, path, ms } = await chat(message, extra);
  ok("responds 200", status === 200);
  ok("runs the marine pipeline", path === "pipeline", `path=${path}, ${ms} ms`);
  ok(`intent is ${intents.join(" or ")}`, intents.includes(body?.intent), body?.intent);
  ok("carries data status / evidence", Boolean(body?.dataStatus) && (body?.evidence?.length ?? 0) > 0);
  if (check) ok(checkLabel, check(body?.answer ?? "", body), body?.answer);
  return body;
}

const AREA = { areaId: "thoothukudi-coast" };

async function main() {
  await expectFast("1 English capability", "Can you speak in Tamil?", {
    intent: "language_capability",
    requested: "ta",
    check: (answer) => /Tamil/.test(answer) && !TAMIL.test(answer),
    checkLabel: "answers in English about Tamil",
  });

  await expectFast("2 Tamil capability", "தமிழில் பேச முடியுமா?", {
    intent: "language_capability",
    check: (answer) => TAMIL.test(answer),
    checkLabel: "answers in Tamil",
  });

  await expectFast("3 Hindi capability", "क्या आप हिंदी में बात कर सकते हैं?", {
    intent: "language_capability",
    check: (answer) => DEVANAGARI.test(answer),
    checkLabel: "answers in Hindi",
  });

  await expectFast("4 Tanglish capability", "Tamil la pesa mudiyuma?", {
    intent: "language_capability",
    check: (answer, body) => !TAMIL.test(answer) && body?.languageContext?.style === "tanglish",
    checkLabel: "answers in Tanglish",
  });

  await expectFast("5 Hinglish capability", "Can you understand Hinglish?", {
    intent: "language_capability",
  });

  await expectFast("variant: Tamil short form", "தமிழ் தெரியும்?", { intent: "language_capability" });
  await expectFast("variant: Hindi short form", "हिंदी समझते हो?", { intent: "language_capability" });
  await expectFast("help", "What can you help me with?", { intent: "help" });
  await expectFast("help about asking", "How do I ask you about marine conditions?", { intent: "help" });
  await expectFast("thanks", "thank you so much", { intent: "thanks" });

  await expectPipeline("6 sea condition", "How is the sea condition today?", AREA, {
    intents: ["marine_conditions"],
    check: (answer) => /wave|wind/i.test(answer),
    checkLabel: "answer carries marine readings",
  });

  await expectPipeline(
    "7 route safety",
    "Is my route safe?",
    { ...AREA, routeId: "tn-route-thoothukudi-south" },
    {
      intents: ["route", "safety"],
      check: (_answer, body) => Boolean(body?.route?.risk),
      checkLabel: "answer is about the resolved route",
    }
  );

  await expectPipeline("8 alerts", "Any alerts near Thoothukudi?", {}, {
    intents: ["alerts"],
    check: (_answer, body) => (body?.alerts?.length ?? 0) > 0,
    checkLabel: "returns alerts",
  });

  await expectPipeline("marine question naming a language", "Can you tell me the sea condition in Tamil?", AREA, {
    intents: ["marine_conditions"],
    check: (answer) => TAMIL.test(answer),
    checkLabel: "answers the marine question in Tamil",
  });

  console.log("\n[follow-up] 9 capability question, then a Tamil marine question");
  const first = await chat("Can you speak Tamil?");
  ok("first turn is the fast path", first.path === "conversational");
  const second = await chat("இன்று கடல் நிலைமை எப்படி இருக்கு?", {
    ...AREA,
    history: [
      { role: "user", text: "Can you speak Tamil?" },
      { role: "assistant", text: first.body?.answer ?? "" },
    ],
  });
  ok("second turn runs the marine pipeline", second.path === "pipeline", `path=${second.path}`);
  ok("second turn answers in Tamil", TAMIL.test(second.body?.answer ?? ""), second.body?.answer);
  ok("second turn language is ta", second.body?.languageContext?.language === "ta");

  console.log("\n[follow-up] Hindi capability, then an ambiguous short follow-up keeps Hindi");
  const hiFirst = await chat("क्या आप हिंदी में बात कर सकते हैं?");
  const hiSecond = await chat("ok", {
    history: [
      { role: "user", text: "क्या आप हिंदी में बात कर सकते हैं?" },
      { role: "assistant", text: hiFirst.body?.answer ?? "" },
    ],
  });
  ok("follow-up stays Hindi", hiSecond.body?.languageContext?.language === "hi", hiSecond.body?.languageContext?.language);

  // ---- Language generation: "say something in Tamil" -------------------
  // Must produce actual text in the language - never a capability answer,
  // never the marine pipeline.
  const LATIN_ONLY = (answer) => !TAMIL.test(answer) && !DEVANAGARI.test(answer);
  const notCapability = (answer) => !/you can talk to Sagar|Ask in /i.test(answer);

  await expectFast("gen 1", "say something in tamil", {
    intent: "language_generation",
    check: (answer) => TAMIL.test(answer) && notCapability(answer),
    checkLabel: "answer is actual Tamil script",
  });
  await expectFast("gen 2", "say something in tamil bro", {
    intent: "language_generation",
    check: (answer, body) => TAMIL.test(answer) && body?.languageContext?.language === "ta",
    checkLabel: "answer is Tamil script, reply language ta (spoken in Tamil)",
  });
  await expectFast("gen 3", "தமிழில் ஏதாவது சொல்லு", {
    intent: "language_generation",
    check: (answer) => TAMIL.test(answer),
    checkLabel: "answer is Tamil script",
  });
  await expectFast("gen 4", "tamil la edhavadhu sollu bro", {
    intent: "language_generation",
    check: (answer, body) => /vanakkam|pesuven|irukkeenga|kelunga/i.test(answer) && body?.languageContext?.style === "tanglish",
    checkLabel: "answer is Tanglish",
  });
  await expectFast("gen 5", "say something in hindi", {
    intent: "language_generation",
    check: (answer, body) => DEVANAGARI.test(answer) && body?.languageContext?.language === "hi",
    checkLabel: "answer is Devanagari, reply language hi",
  });
  await expectFast("gen 6", "हिंदी में कुछ बोलो", {
    intent: "language_generation",
    check: (answer) => DEVANAGARI.test(answer),
    checkLabel: "answer is Devanagari",
  });
  await expectFast("gen: English", "say something in English", {
    intent: "language_generation",
    check: LATIN_ONLY,
    checkLabel: "answer is English",
  });
  await expectFast("gen: Hinglish", "hindi mein kuch bolo", {
    intent: "language_generation",
    check: (answer, body) => LATIN_ONLY(answer) && body?.languageContext?.style === "hinglish",
    checkLabel: "answer is Hinglish",
  });
  await expectFast("gen: unsupported language is honest", "say something in telugu", {
    intent: "language_generation",
    check: (answer) => /understand Telugu/i.test(answer),
    checkLabel: "does not fake Telugu",
  });

  await expectPipeline("gen 7 marine in Tamil", "tell me the sea condition in tamil", AREA, {
    intents: ["marine_conditions"],
    check: (answer) => TAMIL.test(answer) && /\d/.test(answer),
    checkLabel: "Tamil marine answer with real readings",
  });
  await expectPipeline("gen 8 Tamil marine", "தமிழில் கடல் நிலைமை எப்படி இருக்கு?", AREA, {
    intents: ["marine_conditions"],
    check: (answer) => TAMIL.test(answer),
    checkLabel: "Tamil marine answer",
  });
  await expectPipeline(
    "gen 9 Tanglish route",
    "tamil la route safe ah?",
    { ...AREA, routeId: "tn-route-thoothukudi-south" },
    {
      intents: ["route", "safety"],
      check: (answer, body) => Boolean(body?.route) && body?.languageContext?.style === "tanglish" && LATIN_ONLY(answer),
      checkLabel: "route answer in Tanglish",
    }
  );
  await expectFast("gen 10 capability unchanged", "Can you speak in Tamil?", {
    intent: "language_capability",
    check: (answer) => /you can talk to Sagar in Tamil/.test(answer),
    checkLabel: "still the capability answer",
  });

  console.log("\n[sequence] capability -> generation -> Tamil marine -> Tanglish route");
  const turns = [];
  const step = async (message, extra = {}) => {
    const result = await chat(message, { ...AREA, ...extra, history: turns.slice(-6) });
    turns.push({ role: "user", text: message }, { role: "assistant", text: result.body?.answer ?? "" });
    return result;
  };
  const s1 = await step("Can you speak in Tamil?");
  ok("1 capability: fast, English", s1.path === "conversational" && s1.body?.intent === "language_capability" && LATIN_ONLY(s1.body?.answer ?? ""), s1.body?.answer);
  const s2 = await step("say something in tamil bro");
  ok("2 generation: fast, actual Tamil", s2.path === "conversational" && s2.body?.intent === "language_generation" && TAMIL.test(s2.body?.answer ?? ""), s2.body?.answer);
  const s3 = await step("தமிழ்ல கடல் நிலைமை எப்படி இருக்கு?");
  ok("3 Tamil marine: real pipeline", s3.path === "pipeline" && s3.body?.intent === "marine_conditions", `path=${s3.path}`);
  ok("3 Tamil marine: Tamil answer with facts", TAMIL.test(s3.body?.answer ?? "") && /\d/.test(s3.body?.answer ?? ""), s3.body?.answer);
  const s4 = await step("tamil la route safe ah?", { routeId: "tn-route-thoothukudi-south" });
  ok("4 Tanglish route: real pipeline", s4.path === "pipeline" && ["route", "safety"].includes(s4.body?.intent), `path=${s4.path}`);
  ok("4 Tanglish route: Tamil/Tanglish answer", s4.body?.languageContext?.language === "ta", s4.body?.answer);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Routing test crashed:", error);
  process.exit(2);
});
