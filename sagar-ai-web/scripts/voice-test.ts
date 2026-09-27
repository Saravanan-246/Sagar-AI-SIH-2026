// Focused checks for the voice pipeline's pure helpers.
// Usage (from sagar-ai-web): ../sagar-ai-server/node_modules/.bin/tsx scripts/voice-test.ts

import { isUsableTranscript, shouldDeliverTranscript } from "../src/hooks/useVoiceInput";
import { selectVoice } from "../src/hooks/useVoiceOutput";
import { numbersIn, splitSentences, toSpeakableText, toSpokenSummary } from "../src/utils/speechText";

let passCount = 0;
let failCount = 0;

function ok(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passCount += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failCount += 1;
    console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`);
  }
}

const voice = (lang: string, localService = true) =>
  ({ lang, name: lang, localService, default: false, voiceURI: lang }) as SpeechSynthesisVoice;

console.log("\n[transcript gate]");
ok("empty transcript ignored", !isUsableTranscript("   "));
ok("punctuation-only ignored", !isUsableTranscript("..."));
ok("filler noise ignored", !isUsableTranscript("hmm"));
ok("Tamil transcript accepted", isUsableTranscript("நாளை கடல் எப்படி இருக்கு?"));
{
  const first = { text: "Anga weather epdi", at: 1000 };
  ok("duplicate final result inside window dropped",
    !shouldDeliverTranscript("anga weather epdi", first, 2000));
  ok("same phrase asked again later is sent",
    shouldDeliverTranscript("Anga weather epdi", first, 10_000));
  ok("different phrase sent", shouldDeliverTranscript("Naalaiku pogalama?", first, 1500));
}

console.log("\n[voice selection]");
const voices = [voice("en-US"), voice("en-IN"), voice("ta-IN", false), voice("hi-IN")];
{
  const ta = selectVoice("ta-IN", "நாளை கடல் அமைதியாக உள்ளது.", voices);
  ok("ta-IN uses native Tamil voice", ta.kind === "native" && ta.voice?.lang === "ta-IN");
  const hi = selectVoice("hi-IN", "कल समुद्र शांत है।", voices);
  ok("hi-IN uses native Hindi voice", hi.kind === "native" && hi.voice?.lang === "hi-IN");
  const te = selectVoice("te-IN", "రేపు సముద్రం ప్రశాంతంగా ఉంది.", voices);
  ok("Telugu script with no Telugu voice is reported unavailable", te.kind === "none");
  const tanglish = selectVoice("ta-IN", "Naalaiku kadal konjam calm ah irukku.", [voice("en-IN")]);
  ok("Tanglish without Tamil voice falls back to en-IN",
    tanglish.kind === "fallback" && tanglish.voice.lang === "en-IN");
  const en = selectVoice("en-IN", "Conditions are moderate.", voices);
  ok("en-IN picks en-IN over en-US", en.kind === "native" && en.voice?.lang === "en-IN");
  const unloaded = selectVoice("ml-IN", "text", []);
  ok("unloaded voice list still attempts with locale", unloaded.kind === "native" && unloaded.lang === "ml-IN");
  const regional = selectVoice("kn-IN", "ನಾಳೆ", [voice("kn")]);
  ok("language-only voice matches regional locale", regional.kind === "native");
}

console.log("\n[speakable text]");
{
  const spoken = toSpeakableText(
    "## Conditions\n**Moderate** seas near Thoothukudi.\n| a | b |\nSources: INCOIS, Open-Meteo\nSee https://example.com/x",
  );
  ok("strips headings, markdown, tables, sources and URLs",
    spoken === "Conditions Moderate seas near Thoothukudi. See", spoken);

  const route = "Thoothukudi Deep Sea Corridor covers 48.5 km with an estimated risk of 18/100 (low). It's the recommended option: clear passage south.";
  const routeSpoken = toSpeakableText(route);
  ok("units and scores are spelled, values unchanged",
    routeSpoken.includes("48.5 kilometres") && routeSpoken.includes("18 out of 100, low."), routeSpoken);

  const waves = toSpeakableText("Wave height is 2.4 m and wind is 28 km/h. SST 28.1 °C.");
  ok("metres, km/h and Celsius spelled for English voice",
    waves === "Wave height is 2.4 metres and wind is 28 kilometres per hour. SST 28.1 degrees Celsius.", waves);

  const tamil = toSpeakableText("அலை உயரம் 2.4 m.", "ta-IN");
  ok("non-English voice keeps units as written", tamil === "அலை உயரம் 2.4 m.", tamil);

  const labels = toSpeakableText("This assessment is for Thoothukudi Coast. Data sources: INCOIS, Open-Meteo. Confidence: medium - Recent data.");
  ok("inline UI labels and source lists are not read aloud",
    !/data sources|confidence:/i.test(labels) && !/INCOIS/.test(labels), labels);

  ok("decimals never split sentences",
    splitSentences("Waves are 2.4 m. Wind is 12.5 km/h.").length === 2);
}

console.log("\n[voice/text consistency]");
{
  const answers = [
    "Thoothukudi Deep Sea Corridor covers 48.5 km with an estimated risk of 18/100 (low). It's the recommended option: clear passage south through deep water.",
    "Wave height is 2.4 m in the selected area. Wind is 28 km/h from the south-west. SST is 28.1 °C. Chlorophyll is 1.48 mg/m³. Conditions are moderate, so keep an eye on the wind before leaving.",
    "3 active alerts near Thoothukudi Coast, the most severe being \"Cyclone watch\" (critical). Do not go to sea until the alert is lifted.",
  ];
  for (const answer of answers) {
    const spoken = toSpokenSummary(answer);
    const textNumbers = new Set(numbersIn(answer));
    ok(`spoken numbers all appear in text: ${answer.slice(0, 40)}...`,
      numbersIn(spoken).every((n) => textNumbers.has(n)), spoken);
  }
  const long = "Conditions look calm right now. ".repeat(12) + "Avoid the northern shoals - a warning is active there.";
  const summary = toSpokenSummary(long);
  ok("long answers are shortened for speech", summary.length < toSpeakableText(long).length);
  ok("safety-critical sentence always kept", /Avoid the northern shoals/.test(summary), summary);
  ok("spoken summary keeps the answer first", summary.startsWith("Conditions look calm right now."));
}

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
