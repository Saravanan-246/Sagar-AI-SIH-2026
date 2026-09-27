// Focused checks for the voice pipeline's pure helpers.
// Usage (from sagar-ai-web): ../sagar-ai-server/node_modules/.bin/tsx scripts/voice-test.ts

import { isUsableTranscript, shouldDeliverTranscript } from "../src/hooks/useVoiceInput";
import { selectVoice, toSpeakableText } from "../src/hooks/useVoiceOutput";

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
}

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
