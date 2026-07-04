import { describe, expect, it } from "vitest";
import { processRawCandidates } from "../scout.ts";
import { isBriefAllowed, verifySourceItem } from "../verification.ts";
import type { RawSourceItem } from "../types.ts";

function item(overrides: Partial<RawSourceItem> = {}): RawSourceItem {
  return {
    id: overrides.id ?? "source-1",
    title: overrides.title ?? "Headspace launches friend check-in feature",
    sourceUrl: overrides.sourceUrl ?? "https://www.headspace.com/articles/friend-check-in",
    sourceName: overrides.sourceName ?? "Headspace",
    rawSummary: overrides.rawSummary ?? "Headspace describes a friend check-in feature.",
    country: overrides.country ?? "GLOBAL",
    sourceCategory: overrides.sourceCategory ?? "app_product_update",
    collectedAt: overrides.collectedAt ?? "2026-07-03T00:00:00.000Z",
    entityName: overrides.entityName,
    entityType: overrides.entityType,
    observedFeature: overrides.observedFeature,
    evidenceSnippet: overrides.evidenceSnippet,
    evidenceType: overrides.evidenceType,
    verificationStatus: overrides.verificationStatus,
    verificationNotes: overrides.verificationNotes
  };
}

describe("strict entity verification", () => {
  it("marks example.com sources as needs-research", () => {
    const result = verifySourceItem(
      item({
        sourceUrl: "https://example.com/research-agent-samples/meditation-app-friend-checkin",
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceSnippet: "Headspace describes a friend check-in feature.",
        evidenceType: "article"
      })
    );

    expect(result.verificationStatus).toBe("needs-research");
    expect(result.missingFields).toContain("real public source URL");
    expect(result.briefAllowed).toBe(false);
    expect(isBriefAllowed(result)).toBe(false);
  });

  it("marks missing entity names as needs-research", () => {
    const result = verifySourceItem(
      item({
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceSnippet: "Headspace describes a friend check-in feature.",
        evidenceType: "article"
      })
    );

    expect(result.verificationStatus).toBe("needs-research");
    expect(result.missingFields).toContain("specific entity name");
  });

  it("marks generic entity names as needs-research", () => {
    const result = verifySourceItem(
      item({
        entityName: "some brand",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceSnippet: "A friend check-in feature is described.",
        evidenceType: "article"
      })
    );

    expect(result.verificationStatus).toBe("needs-research");
    expect(result.missingFields).toContain("specific entity name");
  });

  it("marks unknown entity types as needs-research", () => {
    const result = verifySourceItem(
      item({
        entityName: "Headspace",
        entityType: "unknown",
        observedFeature: "friend check-in",
        evidenceSnippet: "Headspace describes a friend check-in feature.",
        evidenceType: "official"
      })
    );

    expect(result.verificationStatus).toBe("needs-research");
    expect(result.missingFields).toContain("known entity type");
  });

  it("marks missing observed features as needs-research", () => {
    const result = verifySourceItem(
      item({
        entityName: "Headspace",
        entityType: "app",
        evidenceSnippet: "Headspace describes a friend check-in feature.",
        evidenceType: "official"
      })
    );

    expect(result.verificationStatus).toBe("needs-research");
    expect(result.missingFields).toContain("observed feature or strategic choice");
  });

  it("marks missing evidence snippets as needs-research", () => {
    const result = verifySourceItem(
      item({
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceType: "official"
      })
    );

    expect(result.verificationStatus).toBe("needs-research");
    expect(result.needsVerification).toContain("evidence snippet or evidence paragraph reference");
    expect(result.briefAllowed).toBe(false);
  });

  it("marks missing evidence types as needs-research", () => {
    const result = verifySourceItem(
      item({
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceSnippet: "Headspace describes a friend check-in feature."
      })
    );

    expect(result.verificationStatus).toBe("needs-research");
    expect(result.missingFields).toContain("known evidence type");
  });

  it("marks LinkedIn-only source URLs as needs-research", () => {
    const result = verifySourceItem(
      item({
        sourceUrl: "https://www.linkedin.com/posts/headspace_friend-check-in",
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceSnippet: "Headspace describes a friend check-in feature.",
        evidenceType: "article"
      })
    );

    expect(result.verificationStatus).toBe("needs-research");
    expect(result.missingFields).toContain("non-LinkedIn public source URL");
  });

  it("marks generic titles and summaries as needs-research", () => {
    const result = verifySourceItem(
      item({
        title: "Sample",
        rawSummary: "Placeholder",
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceSnippet: "Headspace describes a friend check-in feature.",
        evidenceType: "article"
      })
    );

    expect(result.verificationStatus).toBe("needs-research");
    expect(result.missingFields).toContain("non-generic title");
    expect(result.missingFields).toContain("non-generic summary");
  });

  it("marks real source plus entity, feature, and evidence as verified", () => {
    const result = verifySourceItem(
      item({
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceSnippet: "Headspace describes a friend check-in feature.",
        evidenceType: "official"
      })
    );

    expect(result.verificationStatus).toBe("verified");
    expect(result.missingFields).toEqual([]);
    expect(result.briefAllowed).toBe(true);
    expect(isBriefAllowed(result)).toBe(true);
  });

  it("rejects source-unsupported claims", () => {
    const result = verifySourceItem(
      item({
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceSnippet: "Headspace describes a friend check-in feature.",
        evidenceType: "official",
        verificationNotes: "source does not support claim"
      })
    );

    expect(result.verificationStatus).toBe("rejected");
    expect(result.rejectedReason).toBe("Source does not support the candidate claim.");
    expect(result.briefAllowed).toBe(false);
    expect(isBriefAllowed(result)).toBe(false);
  });

  it("applies verification fields and briefAllowed to processed candidates", () => {
    const [candidate] = processRawCandidates([
      item({
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceSnippet: "Headspace describes a friend check-in feature.",
        evidenceType: "official"
      })
    ]);

    expect(candidate.candidateId).toBe(candidate.id);
    expect(candidate.verificationStatus).toBe("verified");
    expect(candidate.briefAllowed).toBe(true);
    expect(candidate.missingFields).toEqual([]);
    expect(candidate.entityName).toBe("Headspace");
    expect(candidate.observedFeature).toBe("friend check-in");
  });
});
