import { describe, expect, it } from "vitest";
import { createResearchTaskFromCandidate, renderResearchTaskMarkdown } from "../research-task.ts";
import type { ScoutCandidate } from "../types.ts";

function candidate(overrides: Partial<ScoutCandidate> = {}): ScoutCandidate {
  return {
    id: overrides.id ?? "candidate-research-1",
    candidateId: overrides.candidateId ?? overrides.id ?? "candidate-research-1",
    discoveredDate: "2026-07-03",
    status: "new",
    feedbackLabels: [],
    score: overrides.score ?? 82,
    scoreBreakdown: {
      concreteCase: 16,
      whyGudiStrength: 16,
      consumerBehaviorPotential: 13,
      businessInterpretability: 13,
      dahyeongFit: 12,
      novelty: 7,
      sourceReliability: 3,
      visitabilityBonus: 0
    },
    category: overrides.category ?? "리테일/브랜드",
    topicName: overrides.topicName ?? "Sample brand opens offline verification pop-up",
    oneLineSummary: overrides.oneLineSummary ?? "A sample candidate needs real evidence before writing.",
    coreWhyGudiQuestion:
      overrides.coreWhyGudiQuestion ?? "Why would this brand open an offline verification pop-up?",
    businessObservationAngle:
      overrides.businessObservationAngle ?? "The case may show trust-building through offline space.",
    consumerBehaviorAngle:
      overrides.consumerBehaviorAngle ?? "Consumers may want proof before transacting.",
    connectionToExistingPosts:
      overrides.connectionToExistingPosts ?? "Could connect to prior offline trust observations.",
    overlapRisk: overrides.overlapRisk ?? "낮음",
    recommendedFormat: overrides.recommendedFormat ?? "장문 관찰기",
    visitPossible: overrides.visitPossible ?? "확인 필요",
    sourceUrl: overrides.sourceUrl ?? "https://example.com/sample-pop-up",
    sourceName: overrides.sourceName ?? "Sample source",
    nextAction: overrides.nextAction ?? "make-research-task",
    entityName: overrides.entityName,
    entityType: overrides.entityType ?? "unknown",
    observedFeature: overrides.observedFeature,
    evidenceSnippet: overrides.evidenceSnippet,
    evidenceType: overrides.evidenceType ?? "unknown",
    verificationStatus: overrides.verificationStatus ?? "needs-research",
    verificationNotes:
      overrides.verificationNotes ?? "Candidate needs a real source, entity, observed feature, and evidence.",
    needsVerification: overrides.needsVerification,
    briefAllowed: overrides.briefAllowed ?? false
  };
}

describe("structured research tasks", () => {
  it("creates a ResearchTask for a needs-research candidate", () => {
    const task = createResearchTaskFromCandidate(candidate());

    expect(task.taskId).toBe("research-task:candidate-research-1");
    expect(task.candidateId).toBe("candidate-research-1");
    expect(task.status).toBe("open");
    expect(task.priority).toBe("medium");
  });

  it("includes missing entity, evidence, source, and feature fields", () => {
    const task = createResearchTaskFromCandidate(candidate());

    expect(task.missingFields).toContain("real public source URL");
    expect(task.missingFields).toContain("specific entity name");
    expect(task.missingFields).toContain("observed feature or strategic choice");
    expect(task.missingFields).toContain("evidence snippet or evidence paragraph reference");
  });

  it("renders markdown without a Writing Brief heading", () => {
    const researchCandidate = candidate();
    const task = createResearchTaskFromCandidate(researchCandidate);
    const markdown = renderResearchTaskMarkdown(task, researchCandidate);

    expect(markdown).toContain("# Research Task:");
    expect(markdown).toContain("## Candidate");
    expect(markdown).toContain("## Why this needs research");
    expect(markdown).toContain("## Missing fields");
    expect(markdown).toContain("## Verification questions");
    expect(markdown).toContain("## Suggested search queries");
    expect(markdown).toContain("## Completion criteria");
    expect(markdown).not.toContain("# Writing Brief");
  });
});
