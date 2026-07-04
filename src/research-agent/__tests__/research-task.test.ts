import { describe, expect, it } from "vitest";
import { createResearchTask, createResearchTaskFromCandidate, renderResearchTaskMarkdown } from "../research-task.ts";
import type { ScoutCandidate, VerificationResult } from "../types.ts";

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
    missingFields: overrides.missingFields,
    briefAllowed: overrides.briefAllowed ?? false
  };
}

function verificationResult(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    verificationId: overrides.verificationId ?? "verification:candidate-research-1",
    candidateId: overrides.candidateId ?? "candidate-research-1",
    entityName: overrides.entityName,
    entityType: overrides.entityType ?? "unknown",
    observedFeature: overrides.observedFeature,
    verificationStatus: overrides.verificationStatus ?? "needs-research",
    sourceReliability: overrides.sourceReliability ?? 1,
    evidenceSnippet: overrides.evidenceSnippet,
    evidenceType: overrides.evidenceType ?? "unknown",
    evidenceParagraphIds: overrides.evidenceParagraphIds ?? [],
    confirmedFacts: overrides.confirmedFacts ?? [],
    reasonableInferences: overrides.reasonableInferences ?? [],
    needsVerification: overrides.needsVerification ?? ["known entity type", "known evidence type"],
    missingFields: overrides.missingFields ?? ["known entity type", "known evidence type"],
    briefAllowed: overrides.briefAllowed ?? false,
    verificationNotes: overrides.verificationNotes ?? "Verification result says this needs more research.",
    reviewedBy: "system",
    reviewedAt: "2026-07-03T00:00:00.000Z"
  };
}

describe("structured research tasks", () => {
  it("creates a ResearchTask for a needs-research candidate", () => {
    const task = createResearchTaskFromCandidate(candidate());

    expect(task.taskId).toBe("research-task:candidate-research-1");
    expect(task.candidateId).toBe("candidate-research-1");
    expect(task.topicName).toBe("Sample brand opens offline verification pop-up");
    expect(task.reason).toBe("Candidate needs a real source, entity, observed feature, and evidence.");
    expect(task.status).toBe("open");
    expect(task.priority).toBe("medium");
  });

  it("includes missing entity, evidence, source, and feature fields", () => {
    const task = createResearchTaskFromCandidate(candidate());

    expect(task.missingFields).toContain("real public source URL");
    expect(task.missingFields).toContain("specific entity name");
    expect(task.missingFields).toContain("observed feature or strategic choice");
    expect(task.missingFields).toContain("evidence snippet or evidence paragraph reference");
    expect(task.missingFields).toContain("known entity type");
    expect(task.missingFields).toContain("known evidence type");
  });

  it("can build a ResearchTask from an explicit VerificationResult", () => {
    const task = createResearchTask(
      candidate({
        sourceUrl: "https://news.example.org/article",
        entityName: "Acme Beauty",
        entityType: "brand"
      }),
      verificationResult({
        entityName: "Acme Beauty",
        entityType: "brand",
        missingFields: ["observed feature or strategic choice"],
        verificationNotes: "Observed feature still needs a directly cited source sentence."
      })
    );

    expect(task.reason).toBe("Observed feature still needs a directly cited source sentence.");
    expect(task.currentSourceUrl).toBe("https://news.example.org/article");
    expect(task.currentEntityName).toBe("Acme Beauty");
    expect(task.missingFields).toEqual(["observed feature or strategic choice"]);
    expect(task.questionsToAnswer.some((question) => question.includes("concrete feature"))).toBe(true);
  });

  it("includes concrete research questions and required evidence", () => {
    const task = createResearchTaskFromCandidate(candidate());

    expect(task.questionsToAnswer).toContain(
      'What exact entity is behind "Sample brand opens offline verification pop-up"?'
    );
    expect(task.requiredEvidence).toContain(
      "A public, non-placeholder URL that can be opened without login or paywall bypass."
    );
    expect(task.requiredEvidence).toContain(
      "A source sentence or paragraph that directly supports the observed feature or strategic choice."
    );
  });

  it("renders markdown without a Writing Brief heading", () => {
    const researchCandidate = candidate();
    const task = createResearchTaskFromCandidate(researchCandidate);
    const markdown = renderResearchTaskMarkdown(task, researchCandidate);

    expect(markdown).toContain("# Research Task:");
    expect(markdown).toContain("## Candidate");
    expect(markdown).toContain("## Why this needs research");
    expect(markdown).toContain("## Missing fields");
    expect(markdown).toContain("## Current verified facts");
    expect(markdown).toContain("## Research questions");
    expect(markdown).toContain("## Required evidence");
    expect(markdown).toContain("## Suggested search queries");
    expect(markdown).toContain("## Completion criteria");
    expect(markdown).toContain("What exact entity is behind");
    expect(markdown).toContain("A public, non-placeholder URL");
    expect(markdown).not.toContain("# Writing Brief");
  });
});
