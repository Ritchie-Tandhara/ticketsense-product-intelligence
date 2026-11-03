// Deterministic rule/keyword-based AI classifier.
//
// This is the shipped, working path: no external API call, no key required,
// fully reproducible. It inspects the ticket subject+description against
// keyword dictionaries to guess category/subcategory, scores sentiment via a
// weighted keyword lexicon, and computes a priority recommendation that
// combines impact/urgency signals with keyword hits (NOT purely sentiment).

export type SentimentGuess = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "FRUSTRATED";
export type PriorityGuess = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ClassificationResult {
  category: string;
  subcategory: string;
  sentiment: SentimentGuess;
  priority: PriorityGuess;
  confidence: number; // 0..1
  reasoning: string;
}

const CATEGORY_KEYWORDS: Record<string, { subcategory: string; keywords: string[] }[]> = {
  Billing: [
    { subcategory: "Refund Request", keywords: ["refund", "money back", "charged twice", "double charge"] },
    { subcategory: "Invoice Issue", keywords: ["invoice", "receipt", "billing cycle"] },
    { subcategory: "Payment Failure", keywords: ["payment failed", "card declined", "could not pay", "transaction error"] },
  ],
  Technical: [
    { subcategory: "Login/Access", keywords: ["login", "log in", "cannot access", "password", "locked out", "2fa", "authentication"] },
    { subcategory: "Bug Report", keywords: ["bug", "crash", "error", "broken", "not working", "exception", "stack trace"] },
    { subcategory: "Performance", keywords: ["slow", "timeout", "lag", "performance", "freezing"] },
    { subcategory: "Integration", keywords: ["api", "webhook", "integration", "sync failed"] },
  ],
  Account: [
    { subcategory: "Account Setup", keywords: ["create account", "sign up", "onboarding", "new account"] },
    { subcategory: "Account Deletion", keywords: ["delete my account", "close account", "deactivate"] },
    { subcategory: "Profile Update", keywords: ["update profile", "change email", "change name"] },
  ],
  "Feature Request": [
    { subcategory: "Enhancement", keywords: ["feature request", "would be great", "please add", "suggestion", "enhancement"] },
  ],
  General: [
    { subcategory: "General Inquiry", keywords: ["question", "how do i", "wondering", "inquiry"] },
  ],
};

const SENTIMENT_LEXICON: { word: string; weight: number }[] = [
  { word: "furious", weight: -3 },
  { word: "unacceptable", weight: -3 },
  { word: "disgusted", weight: -3 },
  { word: "angry", weight: -2.5 },
  { word: "frustrated", weight: -2.5 },
  { word: "worst", weight: -2.5 },
  { word: "terrible", weight: -2 },
  { word: "awful", weight: -2 },
  { word: "horrible", weight: -2 },
  { word: "never again", weight: -2 },
  { word: "disappointed", weight: -1.5 },
  { word: "annoyed", weight: -1.5 },
  { word: "not happy", weight: -1.5 },
  { word: "broken", weight: -1 },
  { word: "issue", weight: -0.5 },
  { word: "problem", weight: -0.5 },
  { word: "urgent", weight: -0.5 },
  { word: "please help", weight: -0.3 },
  { word: "thank you", weight: 1.5 },
  { word: "thanks", weight: 1.5 },
  { word: "great", weight: 2 },
  { word: "love", weight: 2 },
  { word: "appreciate", weight: 2 },
  { word: "excellent", weight: 2.5 },
  { word: "awesome", weight: 2.5 },
];

const URGENCY_KEYWORDS = ["urgent", "asap", "immediately", "critical", "down", "outage", "cannot work", "production down", "blocked", "emergency"];
const IMPACT_KEYWORDS = ["all users", "entire team", "whole company", "everyone", "widespread", "data loss", "security breach", "revenue"];

function matchCategory(text: string): { category: string; subcategory: string; hits: number } {
  let best = { category: "General", subcategory: "General Inquiry", hits: 0 };
  for (const [category, subs] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const sub of subs) {
      const hits = sub.keywords.filter((k) => text.includes(k)).length;
      if (hits > best.hits) {
        best = { category, subcategory: sub.subcategory, hits };
      }
    }
  }
  return best;
}

function scoreSentiment(text: string): { sentiment: SentimentGuess; score: number } {
  let score = 0;
  for (const entry of SENTIMENT_LEXICON) {
    if (text.includes(entry.word)) score += entry.weight;
  }
  let sentiment: SentimentGuess = "NEUTRAL";
  if (score <= -4) sentiment = "FRUSTRATED";
  else if (score < 0) sentiment = "NEGATIVE";
  else if (score > 1.5) sentiment = "POSITIVE";
  return { sentiment, score };
}

function scorePriority(text: string, sentimentScore: number, categoryHits: number): { priority: PriorityGuess; score: number } {
  let score = 0;
  const urgencyHits = URGENCY_KEYWORDS.filter((k) => text.includes(k)).length;
  const impactHits = IMPACT_KEYWORDS.filter((k) => text.includes(k)).length;
  score += urgencyHits * 2;
  score += impactHits * 3;
  score += Math.max(0, -sentimentScore) * 0.5; // negative sentiment nudges priority up, but is not the sole driver
  score += categoryHits > 0 ? 0.5 : 0;

  let priority: PriorityGuess = "LOW";
  if (score >= 6) priority = "CRITICAL";
  else if (score >= 3) priority = "HIGH";
  else if (score >= 1) priority = "MEDIUM";
  return { priority, score };
}

export function classifyTicket(subject: string, description: string): ClassificationResult {
  const text = `${subject} ${description}`.toLowerCase();

  const { category, subcategory, hits: categoryHits } = matchCategory(text);
  const { sentiment, score: sentimentScore } = scoreSentiment(text);
  const { priority, score: priorityScore } = scorePriority(text, sentimentScore, categoryHits);

  // Confidence combines keyword-match strength; capped at 0.97 since this is a
  // deterministic heuristic, never a learned model.
  const categoryConfidence = Math.min(0.95, 0.5 + categoryHits * 0.15);
  const priorityConfidence = Math.min(0.95, 0.45 + priorityScore * 0.08);
  const confidence = Math.round(((categoryConfidence + priorityConfidence) / 2) * 100) / 100;

  const reasoningParts: string[] = [];
  reasoningParts.push(
    categoryHits > 0
      ? `Matched ${categoryHits} keyword(s) associated with "${category} / ${subcategory}".`
      : `No strong keyword match found; defaulted to "${category} / ${subcategory}".`
  );
  reasoningParts.push(`Sentiment keyword score was ${sentimentScore.toFixed(1)}, classified as ${sentiment}.`);
  reasoningParts.push(
    `Priority score ${priorityScore.toFixed(1)} combines urgency keywords, impact keywords, category-match strength, and a partial sentiment contribution (not sentiment alone) -> ${priority}.`
  );
  if (confidence < 0.6) {
    reasoningParts.push("Confidence is low: recommend manual review before acting on this suggestion.");
  }

  return {
    category,
    subcategory,
    sentiment,
    priority,
    confidence,
    reasoning: reasoningParts.join(" "),
  };
}
