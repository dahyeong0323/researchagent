import { describe, expect, it } from "vitest";
import { dedupeCandidates } from "../dedupe.ts";
import type { RawSourceItem } from "../types.ts";

function item(overrides: Partial<RawSourceItem>): RawSourceItem {
  return {
    id: overrides.id,
    title: overrides.title ?? "Acme Beauty launches refill station pop-up",
    sourceUrl: overrides.sourceUrl ?? "https://news.acme.test/default",
    sourceName: overrides.sourceName ?? "Example News",
    sourceCategory: overrides.sourceCategory ?? "manual",
    collectedAt: overrides.collectedAt ?? "2026-07-02T00:00:00.000Z",
    sourcePublishedAt: overrides.sourcePublishedAt,
    sourceReliability: overrides.sourceReliability,
    rawSummary: overrides.rawSummary,
    country: overrides.country,
    entityName: overrides.entityName,
    observedFeature: overrides.observedFeature,
    evidenceSnippet: overrides.evidenceSnippet,
    evidenceType: overrides.evidenceType,
    verificationStatus: overrides.verificationStatus
  };
}

describe("dedupeCandidates", () => {
  it("removes candidates with the same sourceUrl", () => {
    const result = dedupeCandidates([
      item({ id: "a", title: "First", sourceUrl: "https://news.acme.test/a?utm=test" }),
      item({ id: "b", title: "Second", sourceUrl: "https://news.acme.test/a" })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a");
  });

  it("removes candidates with highly similar titles", () => {
    const result = dedupeCandidates([
      item({ id: "a", title: "Acme Beauty launches refill station pop-up", sourceUrl: "https://news.acme.test/a" }),
      item({ id: "b", title: "Acme Beauty launched refill station pop up", sourceUrl: "https://news.acme.test/b" })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a");
  });

  it("keeps the verified candidate inside a duplicate cluster", () => {
    const result = dedupeCandidates([
      item({
        id: "needs",
        title: "Acme Beauty launches refill station pop-up",
        sourceUrl: "https://news.acme.test/a",
        verificationStatus: "needs-research",
        sourceReliability: 3
      }),
      item({
        id: "verified",
        title: "Acme Beauty launched refill station pop up",
        sourceUrl: "https://news.acme.test/b",
        verificationStatus: "verified",
        sourceReliability: 4,
        evidenceSnippet: "Acme Beauty launched a refill station pop-up in Seoul.",
        sourcePublishedAt: "2026-07-01T00:00:00.000Z"
      })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("verified");
  });

  it("keeps verified evidence when the same entity and topic use less similar titles", () => {
    const result = dedupeCandidates([
      item({
        id: "needs",
        title: "Retail report on refill shopping behavior",
        sourceUrl: "https://news.acme.test/a",
        entityName: "Acme Beauty",
        observedFeature: "refill station launch",
        verificationStatus: "needs-research",
        sourceReliability: 5
      }),
      item({
        id: "verified",
        title: "Acme Beauty opens Seoul refill pop-up",
        sourceUrl: "https://news.acme.test/b",
        entityName: "Acme Beauty",
        observedFeature: "opened a refill station pop-up in Seoul",
        verificationStatus: "verified",
        sourceReliability: 3,
        evidenceSnippet: "Acme Beauty opened a refill station pop-up in Seoul."
      })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("verified");
  });
});
