// Provider seam: TicketSense's shipped, working classification path is the
// deterministic engine (deterministicClassifier.ts). This module is the
// swap-in point for a real LLM provider in the future (see docs/roadmap.md).
//
// If AI_PROVIDER is set to a value other than "deterministic" and
// AI_PROVIDER_API_KEY is present, callers could branch to a real provider
// call here. No such call is implemented in the MVP - it always falls back
// to the deterministic engine so the app works with zero configuration.

import { classifyTicket, ClassificationResult } from "./deterministicClassifier";

export async function analyzeTicket(subject: string, description: string): Promise<ClassificationResult> {
  const provider = process.env.AI_PROVIDER || "deterministic";
  const apiKey = process.env.AI_PROVIDER_API_KEY;

  if (provider !== "deterministic" && apiKey) {
    // Placeholder seam for a real LLM integration. Not implemented in the MVP;
    // deliberately falls through to the deterministic engine so the app never
    // breaks if this is misconfigured.
    console.warn(`[ai/provider] AI_PROVIDER="${provider}" requested but no real integration is implemented. Falling back to deterministic classifier.`);
  }

  return classifyTicket(subject, description);
}
