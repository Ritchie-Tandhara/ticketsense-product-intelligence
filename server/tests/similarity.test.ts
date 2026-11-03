import { describe, it, expect } from "vitest";
import { similarityScore, clusterTickets, SIMILARITY_THRESHOLD } from "../src/ai/similarity";

describe("Deterministic ticket similarity (Jaccard bigram)", () => {
  it("scores two near-duplicate ticket texts above the clustering threshold", () => {
    const a = "OTP not received during login. I am not receiving the OTP verification code when I try to log in, the SMS never arrives.";
    const b = "OTP not received during login. I am not receiving the OTP verification code when I try to log in, the SMS never comes through.";
    const score = similarityScore(a, b);
    expect(score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
  });

  it("scores two unrelated ticket texts below the clustering threshold", () => {
    const a = "OTP not received during login. The SMS verification code never arrives on my phone.";
    const b = "Feature request: please add a dark mode toggle to the settings page for the dashboard.";
    const score = similarityScore(a, b);
    expect(score).toBeLessThan(SIMILARITY_THRESHOLD);
  });

  it("is symmetric: similarity(A,B) === similarity(B,A)", () => {
    const a = "Dashboard fails to load with a blank white screen after login.";
    const b = "Dashboard fails to load with a blank grey screen after login.";
    expect(similarityScore(a, b)).toBeCloseTo(similarityScore(b, a), 10);
  });

  it("clusters a group of near-duplicate tickets together and excludes an unrelated ticket", () => {
    const tickets = [
      { id: "t1", text: "OTP not received during login. SMS never arrives on my Android phone." },
      { id: "t2", text: "OTP not received during login. SMS never arrives on my iPhone." },
      { id: "t3", text: "OTP not received during login. SMS never arrives on my work phone." },
      { id: "t4", text: "Feature request: please add dark mode to the dashboard settings page." },
    ];
    const clusters = clusterTickets(tickets);
    expect(clusters.length).toBe(1);
    expect(clusters[0].ticketIds.sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("does not form a cluster below the minimum cluster size", () => {
    const tickets = [
      { id: "t1", text: "OTP not received during login. SMS never arrives." },
      { id: "t2", text: "OTP not received during login. SMS never arrives." },
      { id: "t3", text: "Totally unrelated billing invoice tax question about enterprise plan." },
    ];
    const clusters = clusterTickets(tickets);
    expect(clusters.length).toBe(0); // only 2 similar tickets, below MIN_CLUSTER_SIZE of 3
  });
});
