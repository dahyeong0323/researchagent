import { describe, expect, it } from "vitest";
import { CATEGORY_BY_SOURCE } from "../config.ts";
import { scoreCandidate } from "../score.ts";
import type { FeedbackMemory, RawSourceItem } from "../types.ts";

function item(overrides: Partial<RawSourceItem>): RawSourceItem {
  return {
    title: overrides.title ?? "Acme Beauty launches refill station pop-up",
    sourceUrl: overrides.sourceUrl ?? "https://news.acme.test/test",
    sourceName: overrides.sourceName ?? "Example News",
    sourceCategory: overrides.sourceCategory ?? "retail_brand",
    collectedAt: overrides.collectedAt ?? "2026-07-04T00:00:00.000Z",
    sourcePublishedAt: overrides.sourcePublishedAt,
    sourceReliability: overrides.sourceReliability,
    rawSummary: overrides.rawSummary,
    country: overrides.country,
    id: overrides.id,
    entityName: overrides.entityName,
    observedFeature: overrides.observedFeature,
    evidenceSnippet: overrides.evidenceSnippet,
    evidenceType: overrides.evidenceType,
    verificationStatus: overrides.verificationStatus
  };
}

function verifiedItem(overrides: Partial<RawSourceItem> = {}): RawSourceItem {
  return item({
    entityName: "Acme Beauty",
    observedFeature: "refill station launch",
    evidenceSnippet: "Acme Beauty launched a refill station pop-up in Seoul.",
    evidenceType: "article",
    verificationStatus: "verified",
    sourcePublishedAt: "2026-07-01T00:00:00.000Z",
    sourceReliability: 4,
    rawSummary: "Acme Beauty opened a concrete retail pop-up with refill behavior and in-store consultation.",
    ...overrides
  });
}

describe("scoreCandidate", () => {
  it("scores a concrete verified retail brand candidate highly", () => {
    const result = scoreCandidate(verifiedItem(), CATEGORY_BY_SOURCE.retail_brand);

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.scoreBreakdown.entityConcreteScore).toBe(15);
    expect(result.scoreBreakdown.evidenceQualityScore).toBeGreaterThan(0);
  });

  it("scores a vague macro candidate lower than a concrete verified candidate", () => {
    const concrete = scoreCandidate(verifiedItem(), CATEGORY_BY_SOURCE.retail_brand);
    const vague = scoreCandidate(
      item({
        title: "Global economy outlook shifts consumer sentiment",
        sourceCategory: "manual",
        rawSummary: "A generic macro article about market conditions without a concrete company action."
      }),
      CATEGORY_BY_SOURCE.consumer_trend
    );

    expect(vague.score).toBeLessThan(concrete.score);
  });

  it("caps example.com candidates low", () => {
    const result = scoreCandidate(
      verifiedItem({ sourceUrl: "https://example.com/source" }),
      CATEGORY_BY_SOURCE.retail_brand
    );

    expect(result.score).toBeLessThanOrEqual(30);
  });

  it("caps rejected candidates even when feedback is positive", () => {
    const memory: FeedbackMemory = {
      categoryWeights: { [CATEGORY_BY_SOURCE.retail_brand]: 1.25 },
      sourceCategoryWeights: { retail_brand: 1.25 },
      rejectedPatterns: [],
      preferredAngles: ["Acme"],
      recentTopics: [],
      candidateFeedback: []
    };

    const result = scoreCandidate(
      verifiedItem({
        verificationStatus: "rejected",
        evidenceType: "official",
        sourceReliability: 5
      }),
      CATEGORY_BY_SOURCE.retail_brand,
      memory
    );

    expect(result.score).toBeLessThanOrEqual(10);
  });
});
