/*
 * Lightweight, deterministic semantic normalisation for code-switched
 * and transliterated marine questions ("Naalaiku pogalama?",
 * "yaanku best fishing zone soluu", "Can I go kadalukku tomorrow?").
 *
 * It never rewrites what the user sees: it only derives English
 * canonical phrases that the keyword intent rules already understand,
 * which intent scoring reads alongside the raw text.
 */

type NormalizationRule = {
  pattern: RegExp;
  canonical: string;
};

const rules: NormalizationRule[] = [
  // "can I go?" / "shall we go?" - asking whether a trip is safe.
  { pattern: /\b(pogal+a+ma+|pogal+a+m|pol+a+ma+|poga\s*mudiyuma|ponga\s*la+ma)\b/i, canonical: "can i go" },
  { pattern: /\b(vel+a+(va)?c+h+a+|vel+o+c+h+a+|vel+a+d+a+m+a+)\b/i, canonical: "can i go" },
  { pattern: /\b(ja\s*sakt[eai]|jaa?\s*sakt[eai]|jaana\s*chahiye)\b/i, canonical: "can i go" },
  { pattern: /\b(pokamo|pokan\s*pattumo|hogabahuda|hogbahuda)\b/i, canonical: "can i go" },
  // Sea / going to sea.
  { pattern: /\bkadal\w*/i, canonical: "sea" },
  { pattern: /\b(samudram|samundar|samudra)\b/i, canonical: "sea" },
  // Time.
  { pattern: /\b(na+lai\w*|nalaik+i|repu|naale)\b/i, canonical: "tomorrow" },
  { pattern: /\b(inni?ki|indru|ivvala|aaj)\b/i, canonical: "today" },
  // "how is it?" - a conditions question.
  { pattern: /\b(e+p+a?di|ep+adi|ela\s+undi|kaisa|kaise|engane|hege)\b/i, canonical: "how is conditions" },
  // Weather words.
  { pattern: /\b(vaanilai|mausam|vatavaranam|kaalavastha)\b/i, canonical: "weather" },
  { pattern: /\b(ka+th+u|ka+tru|hawa)\b/i, canonical: "wind" },
  { pattern: /\b(alai|lehar\w*)\b/i, canonical: "waves" },
  { pattern: /\bmazhai\b/i, canonical: "rain" },
  // Fishing.
  { pattern: /\b(meen\s*pidi\w*|meenpidi\w*|chepala|machli|meenugarike)\b/i, canonical: "fishing" },
  // Route / path.
  { pattern: /\b(vazhi|paadhai|daari|raasta|rasta)\b/i, canonical: "route" },
  // Safety.
  { pattern: /\b(pa+[dt]h?u?ka+p+u|surakshit|bhadrata)\b/i, canonical: "safe" },
];

export function semanticNormalize(message: string): string {
  const text = (message ?? "").normalize("NFC");
  const canonical = new Set<string>();

  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      canonical.add(rule.canonical);
    }
  }

  return [...canonical].join(" ");
}

/** Raw text plus its canonical phrases, for intent scoring only. */
export function withSemanticHints(message: string): string {
  const hints = semanticNormalize(message);
  return hints ? `${message} ${hints}` : message;
}
