import { describe, expect, it } from "vitest";
import { CATEGORY_BY_SOURCE, FORMAT_BY_CATEGORY, VISIT_POSSIBLE_BY_CATEGORY } from "../config.ts";
import { createWritingAgentHandoffPayload } from "../handoff.ts";
import type { ScoutCandidate, WritingBrief } from "../types.ts";

function candidate(overrides: Partial<ScoutCandidate> = {}): ScoutCandidate {
  const category = CATEGORY_BY_SOURCE.retail_brand;

  return {
    id: overrides.id ?? "candidate-handoff-1",
    candidateId: overrides.candidateId ?? overrides.id ?? "candidate-handoff-1",
    discoveredDate: "2026-07-04",
    status: "new",
    feedbackLabels: [],
    score: overrides.score ?? 92,
    scoreBreakdown: {
      concreteCase: 20,
      whyGudiStrength: 18,
      consumerBehaviorPotential: 14,
      businessInterpretability: 14,
      dahyeongFit: 12,
      novelty: 8,
      sourceReliability: 5,
      visitabilityBonus: 0
    },
    category,
    topicName: overrides.topicName ?? "Acme Beauty launches refill station pop-up",
    oneLineSummary: overrides.oneLineSummary ?? "Acme Beauty launched a refill station pop-up in Seoul.",
    coreWhyGudiQuestion: overrides.coreWhyGudiQuestion ?? "Why is Acme Beauty turning refills into a store ritual?",
    businessObservationAngle: overrides.businessObservationAngle ?? "Retail refill station as a repeat-visit mechanism.",
    consumerBehaviorAngle: overrides.consumerBehaviorAngle ?? "Consumers get a reason to bring containers back to store.",
    connectionToExistingPosts: overrides.connectionToExistingPosts ?? "Connect to retail behavior observations.",
    overlapRisk: overrides.overlapRisk ?? ("low" as ScoutCandidate["overlapRisk"]),
    recommendedFormat: overrides.recommendedFormat ?? FORMAT_BY_CATEGORY[category],
    visitPossible: overrides.visitPossible ?? VISIT_POSSIBLE_BY_CATEGORY[category],
    sourceUrl: overrides.sourceUrl ?? "https://news.acme.test/acme-refill",
    sourceName: overrides.sourceName ?? "Example News",
    sourcePublishedAt: overrides.sourcePublishedAt ?? "2026-07-01T00:00:00.000Z",
    sourceReliability: overrides.sourceReliability ?? 4,
    nextAction: overrides.nextAction ?? "make-writing-brief",
    entityName: overrides.entityName ?? "Acme Beauty",
    entityType: overrides.entityType ?? "brand",
    observedFeature: overrides.observedFeature ?? "refill station launch",
    evidenceSnippet: "evidenceSnippet" in overrides
      ? overrides.evidenceSnippet
      : "Acme Beauty launched a refill station pop-up in Seoul.",
    evidenceType: overrides.evidenceType ?? "article",
    evidenceParagraphIds: overrides.evidenceParagraphIds ?? ["p1"],
    verificationStatus: overrides.verificationStatus ?? "verified",
    verificationNotes: overrides.verificationNotes,
    confirmedFacts: overrides.confirmedFacts ?? ["Entity identified: Acme Beauty"],
    reasonableInferences: overrides.reasonableInferences ?? ["Refill station may encourage repeat visits."],
    needsVerification: overrides.needsVerification ?? ["Do not claim sales impact."],
    briefAllowed: overrides.briefAllowed ?? true
  };
}

function brief(): WritingBrief {
  return {
    topicName: "Acme Beauty launches refill station pop-up",
    coreWhyGudiQuestion: "Why is Acme Beauty turning refills into a store ritual?",
    refinedCoreQuestion: "Why does Acme Beauty need a refill station?",
    oneLineSummary: "Acme Beauty launched a refill station pop-up in Seoul.",
    businessObservationAngle: "Retail refill station as a repeat-visit mechanism.",
    consumerBehaviorAngle: "Consumers get a reason to bring containers back to store.",
    coreTension: "Refill behavior needs a physical prompt.",
    nonObviousInsight: "The station is a habit device, not just sustainability messaging.",
    businessMechanism: "The business mechanism is repeat store visits around refill behavior.",
    consumerPsychology: "Customers need a visible ritual to remember reuse.",
    sharpThesis: "Refill works when it becomes a store ritual.",
    genericThesisToAvoid: ["Sustainability is important."],
    betterOpeningScene: "Start at the refill counter.",
    postOutline: ["Open with scene"],
    evidenceNeeded: ["Verify operating dates."],
    evidenceBoundary: {
      confirmedFacts: ["Acme Beauty launched a refill station pop-up."],
      reasonableInferences: ["It may support repeat visits."],
      needsVerification: ["Sales impact is unknown."]
    },
    possibleStructure: ["Scene", "Mechanism"],
    counterArguments: ["It may be a one-off campaign."],
    sourceUrls: ["https://news.acme.test/acme-refill"],
    recommendedFormat: FORMAT_BY_CATEGORY[CATEGORY_BY_SOURCE.retail_brand],
    styleReference: "retail-observation"
  };
}

describe("writing agent handoff", () => {
  it("creates a handoff payload for verified candidates", () => {
    const payload = createWritingAgentHandoffPayload(candidate(), brief(), {
      createdAt: "2026-07-04T00:00:00.000Z"
    });

    expect(payload.candidateId).toBe("candidate-handoff-1");
    expect(payload.entityName).toBe("Acme Beauty");
    expect(payload.evidenceSnippet).toContain("refill station");
    expect(payload.sourceUrls).toEqual(["https://news.acme.test/acme-refill"]);
  });

  it("includes unique source URLs from candidate and brief", () => {
    const writingBrief = brief();
    writingBrief.sourceUrls = [
      "https://news.acme.test/acme-refill",
      "https://official.acme.test/refill-launch"
    ];

    const payload = createWritingAgentHandoffPayload(candidate(), writingBrief);

    expect(payload.sourceUrls).toEqual([
      "https://news.acme.test/acme-refill",
      "https://official.acme.test/refill-launch"
    ]);
  });

  it("blocks needs-research candidates", () => {
    expect(() =>
      createWritingAgentHandoffPayload(
        candidate({ verificationStatus: "needs-research", briefAllowed: false }),
        brief()
      )
    ).toThrow("verified and briefAllowed");
  });

  it("allows candidates with evidence paragraph ids when evidenceSnippet is missing", () => {
    const payload = createWritingAgentHandoffPayload(
      candidate({ evidenceSnippet: undefined, evidenceParagraphIds: ["p7"] }),
      brief()
    );

    expect(payload.evidenceSnippet).toBe("Evidence paragraph ids: p7");
    expect(payload.evidenceParagraphIds).toEqual(["p7"]);
  });

  it("blocks candidates missing all evidence references", () => {
    expect(() =>
      createWritingAgentHandoffPayload(
        candidate({ evidenceSnippet: undefined, evidenceParagraphIds: [] }),
        brief()
      )
    ).toThrow("evidenceSnippet or evidenceParagraphIds");
  });

  it("requires human approval", () => {
    const payload = createWritingAgentHandoffPayload(candidate(), brief());

    expect(payload.humanApprovalRequired).toBe(true);
  });

  it("includes prohibited claims from needsVerification", () => {
    const payload = createWritingAgentHandoffPayload(candidate(), brief());

    expect(payload.prohibitedClaims).toContain("Do not claim until verified: Do not claim sales impact.");
  });
});
