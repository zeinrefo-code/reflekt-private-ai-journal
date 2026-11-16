import type { EntryAnalysis } from "./types";

/**
 * Demo engine — a small, deterministic, fully local fallback used when
 * neither Gemini Nano nor Firebase AI Logic is available (e.g. before the
 * real Firebase config is pasted in). It keeps Reflekt fully demoable:
 * extractive summarisation, keyword themes and lexicon sentiment.
 * It is NOT a language model and the UI always labels its output as such.
 */

const STOPWORDS = new Set(
  (
    "the a an and or but if then else for to of in on at by with from as is was were are be been being i you he she it we they me my mine your yours his her its our their this that these those am do does did have has had will would can could should may might must shall not no yes so very just about into over under again further once here there when where which who whom what how all any both each few more most other some such only own same than too s t don now day today"
  ).split(" "),
);

const POSITIVE = new Set(
  (
    "happy grateful glad joy joyful love loved calm peaceful proud hope hopeful excited wonderful great good amazing bright smile laugh energy motivated progress win success relaxed thankful blessed enjoy enjoyed fun kind warm well better best celebrate celebrated trust trusted funny confident ready relieved relief"
  ).split(" "),
);

const NEGATIVE = new Set(
  (
    "sad tired anxious anxiety stress stressed worried worry afraid fear angry frustrated lonely hurt pain painful hard difficult struggle failed fail worry overwhelmed exhausted sick worry regret guilt heavy dark cry cried miss missing problem problems conflict"
  ).split(" "),
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean];
  return parts.map((s) => s.trim()).filter((s) => s.length > 2);
}

function wordFrequencies(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const w of tokenize(text)) {
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return freq;
}

export function extractThemes(text: string, max = 4): string[] {
  const freq = wordFrequencies(text);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
}

export function sentimentOf(text: string): { label: string; score: number } {
  const words = tokenize(text);
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) pos++;
    if (NEGATIVE.has(w)) neg++;
  }
  const total = pos + neg;
  if (total === 0) return { label: "Balanced", score: 0 };
  const score = Math.max(-1, Math.min(1, (pos - neg) / Math.max(4, total)));
  if (score >= 0.35) return { label: "Positive", score };
  if (score <= -0.35) return { label: "Heavy", score };
  if (score < 0) return { label: "Reflective", score };
  return { label: "Balanced", score };
}

export function summarizeText(text: string, maxSentences = 2): string {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return sentences.join(" ");
  const freq = wordFrequencies(text);
  const scored = sentences.map((s, i) => {
    const words = tokenize(s);
    const raw = words.reduce((acc, w) => acc + (freq.get(w) ?? 0), 0);
    // Slight bias toward earlier sentences, normalised by length.
    return { s, i, score: raw / Math.max(6, words.length) + (sentences.length - i) * 0.01 };
  });
  const top = scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i);
  return top.map((t) => t.s).join(" ");
}

export function analyzeEntryDemo(text: string): EntryAnalysis {
  const sentiment = sentimentOf(text);
  return {
    summary: summarizeText(text),
    themes: extractThemes(text),
    sentiment: sentiment.label,
    sentimentScore: Number(sentiment.score.toFixed(2)),
  };
}

export interface DemoReflectInput {
  title: string;
  body: string;
  mood: string;
  sentimentScore: number;
}

export function reflectDemo(entries: DemoReflectInput[]): string {
  if (entries.length === 0) return "Write a few entries and your reflection will appear here.";
  const combined = entries.map((e) => `${e.title}. ${e.body}`).join(" ");
  const themes = extractThemes(combined, 5);
  const avg =
    entries.reduce((acc, e) => acc + e.sentimentScore, 0) / entries.length;
  const tone =
    avg >= 0.25
      ? "Your recent writing leans positive — there is real momentum to build on."
      : avg <= -0.25
        ? "Your recent entries carry a heavy tone. Be gentle with yourself; naming it is already a step."
        : "Your recent entries are balanced and reflective — a steady, thoughtful stretch.";
  const moods = [...new Set(entries.map((e) => e.mood).filter(Boolean))];
  return [
    `Across your last ${entries.length} entries, the themes that keep returning are: ${themes.join(", ") || "everyday moments"}.`,
    tone,
    moods.length
      ? `You most often tagged your mood as: ${moods.join(", ")}. Notice what those days had in common.`
      : "Try tagging a mood on each entry — patterns become much easier to spot.",
    "One small prompt for your next entry: write about the moment today you would most like to remember a year from now.",
  ].join("\n\n");
}
