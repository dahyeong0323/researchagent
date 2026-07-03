import { describe, expect, it } from "vitest";
import { processRawCandidates } from "../scout.ts";
import { verifySourceItem } from "../verification.ts";
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

describe("entity verification", () => {
  it("marks example.com sources as needs-research", () => {
    const result = verifySourceItem(
      item({
        sourceUrl: "https://example.com/research-agent-samples/meditation-app-friend-checkin",
        entityName: "Headspace"
      })
    );

    expect(result.verificationStatus).toBe("needs-research");
  });

  it("marks missing entity names as needs-research", () => {
    const result = verifySourceItem(item());

    expect(result.verificationStatus).toBe("needs-research");
  });

  it("marks a named entity with a real source URL as verified", () => {
    const result = verifySourceItem(
      item({
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "친구 체크인 기능",
        evidenceType: "official"
      })
    );

    expect(result.verificationStatus).toBe("verified");
  });

  it("applies verification fields to processed candidates", () => {
    const [candidate] = processRawCandidates([
      item({
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "친구 체크인 기능",
        evidenceType: "official"
      })
    ]);

    expect(candidate.verificationStatus).toBe("verified");
    expect(candidate.entityName).toBe("Headspace");
    expect(candidate.observedFeature).toBe("친구 체크인 기능");
  });
});
