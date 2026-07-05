import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_BY_SOURCE, FORMAT_BY_CATEGORY } from "../config.ts";
import {
  buildWritingAgentHandoffPayload,
  writeWritingAgentHandoffPayload
} from "../writing-agent-handoff.ts";
import type { ScoutCandidate, WritingBrief } from "../types.ts";

function candidate(overrides: Partial<ScoutCandidate> = {}): ScoutCandidate {
  const category = CATEGORY_BY_SOURCE.retail_brand;

  return {
    id: "candidate-1",
    candidateId: "candidate-1",
    discoveredDate: "2026-07-04",
    status: "new",
    feedbackLabels: [],
    score: 95,
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
    topicName: "Acme Beauty launches refill station pop-up",
    oneLineSummary: "Acme Beauty launched a refill station pop-up.",
    coreWhyGudiQuestion: "Why does Acme Beauty need a refill ritual?",
    businessObservationAngle: "Refill as a repeat visit mechanism.",
    consumerBehaviorAngle: "Consumers need a physical reminder for refill behavior.",
    connectionToExistingPosts: "Connect to retail rituals.",
    overlapRisk: "낮음",
    recommendedFormat: FORMAT_BY_CATEGORY[category],
    visitPossible: "확인 필요",
    sourceUrl: "https://news.acme.test/acme-refill",
    sourceName: "Example News",
    sourcePublishedAt: "2026-07-01T00:00:00.000Z",
    nextAction: "make-writing-brief",
    entityName: "Acme Beauty",
    entityType: "brand",
    observedFeature: "refill station launch",
    evidenceSnippet: "Acme Beauty launched a refill station pop-up.",
    evidenceType: "article",
    evidenceParagraphIds: ["p1"],
    verificationStatus: "verified",
    confirmedFacts: ["Acme Beauty launched a refill station pop-up."],
    reasonableInferences: ["The refill station may support repeat visits."],
    needsVerification: ["Do not claim sales impact."],
    briefAllowed: true,
    ...overrides
  };
}

function brief(): WritingBrief {
  const category = CATEGORY_BY_SOURCE.retail_brand;

  return {
    topicName: "Acme Beauty launches refill station pop-up",
    coreWhyGudiQuestion: "Why does Acme Beauty need a refill ritual?",
    refinedCoreQuestion: "Why make refill a store ritual?",
    oneLineSummary: "Acme Beauty launched a refill station pop-up.",
    businessObservationAngle: "Refill as a repeat visit mechanism.",
    consumerBehaviorAngle: "Consumers need a physical reminder for refill behavior.",
    coreTension: "Reuse requires memory and habit.",
    nonObviousInsight: "The station is a habit device.",
    businessMechanism: "The business mechanism is repeat visits around refill behavior.",
    consumerPsychology: "Visible rituals make reuse easier.",
    sharpThesis: "Refill works when it becomes a store ritual.",
    genericThesisToAvoid: ["Sustainability matters."],
    betterOpeningScene: "Open at the refill counter.",
    postOutline: ["Scene", "Mechanism"],
    evidenceNeeded: ["Verify sales impact."],
    evidenceBoundary: {
      confirmedFacts: ["Acme Beauty launched a refill station pop-up."],
      reasonableInferences: ["It may support repeat visits."],
      needsVerification: ["Sales impact is unknown."]
    },
    possibleStructure: ["Scene", "Analysis"],
    counterArguments: ["It could be a one-off campaign."],
    sourceUrls: ["https://news.acme.test/acme-refill"],
    recommendedFormat: FORMAT_BY_CATEGORY[category],
    styleReference: "retail-observation"
  };
}

describe("writing agent handoff payload", () => {
  it("creates a payload for verified brief-allowed candidates", () => {
    const payload = buildWritingAgentHandoffPayload(candidate(), brief(), {
      createdAt: "2026-07-04T00:00:00.000Z"
    });

    expect(payload).toMatchObject({
      candidateId: "candidate-1",
      entityName: "Acme Beauty",
      humanApprovalRequired: true
    });
    expect(payload.sourceUrls).toEqual(["https://news.acme.test/acme-refill"]);
  });

  it("throws for needs-research candidates", () => {
    expect(() =>
      buildWritingAgentHandoffPayload(candidate({ verificationStatus: "needs-research", briefAllowed: false }), brief())
    ).toThrow("verified");
  });

  it("throws for rejected candidates", () => {
    expect(() =>
      buildWritingAgentHandoffPayload(candidate({ verificationStatus: "rejected", briefAllowed: false }), brief())
    ).toThrow("verified");
  });

  it("allows paragraph-based evidence when evidenceSnippet is missing", () => {
    const payload = buildWritingAgentHandoffPayload(
      candidate({ evidenceSnippet: undefined, evidenceParagraphIds: ["p9"] }),
      brief()
    );

    expect(payload.evidenceSnippet).toBe("Evidence paragraph ids: p9");
    expect(payload.evidenceParagraphIds).toEqual(["p9"]);
  });

  it("throws when all evidence references are missing", () => {
    expect(() =>
      buildWritingAgentHandoffPayload(candidate({ evidenceSnippet: undefined, evidenceParagraphIds: [] }), brief())
    ).toThrow("evidenceSnippet or evidenceParagraphIds");
  });

  it("copies unresolved needsVerification into prohibited claims", () => {
    const payload = buildWritingAgentHandoffPayload(candidate(), brief());

    expect(payload.prohibitedClaims).toContain("Do not claim until verified: Do not claim sales impact.");
  });

  it("writes a JSON payload to disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "research-agent-handoff-"));
    try {
      const outputPath = await writeWritingAgentHandoffPayload(candidate(), brief(), { outputDir: root });
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as { humanApprovalRequired?: unknown };

      expect(payload.humanApprovalRequired).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
