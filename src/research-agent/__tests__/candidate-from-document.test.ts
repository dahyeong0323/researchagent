import { describe, expect, it } from "vitest";
import { generateCandidatesFromDocument, generateRawSourceItemsFromDocument } from "../candidate-from-document.ts";
import { CATEGORY_BY_SOURCE } from "../config.ts";
import type { EntityType, SourceDocument } from "../types.ts";

function sourceDocument(
  paragraphs: string[],
  hints: Partial<SourceDocument> & { entityName?: string; entityType?: EntityType } = {}
): SourceDocument & { entityName?: string; entityType?: EntityType } {
  return {
    documentId: "doc:candidate",
    canonicalUrl: "https://news.acme.co.kr/acme-beauty-refill",
    documentType: "manual-url",
    title: "Acme Beauty opens a refill station pop-up",
    publishedAt: "2026-07-01T09:00:00+09:00",
    siteName: "Example Retail News",
    contentText: paragraphs.join("\n"),
    paragraphs: paragraphs.map((text, index) => ({ id: `p${index + 1}`, index, text })),
    reliabilityTier: 3,
    fetchedAt: "2026-07-04T00:00:00.000Z",
    ...hints
  };
}

describe("candidate generation from document", () => {
  it("generates a verified candidate only with entity and evidence", () => {
    const [candidate] = generateCandidatesFromDocument(
      sourceDocument(["Acme Beauty opened a refill station pop-up in Seoul."], {
        entityName: "Acme Beauty",
        entityType: "brand"
      })
    );

    expect(candidate.entityName).toBe("Acme Beauty");
    expect(candidate.observedFeature).toBe("opened a refill station pop-up in Seoul");
    expect(candidate.evidenceSnippet).toContain("opened a refill station");
    expect(candidate.evidenceParagraphIds).toEqual(["p1"]);
    expect(candidate.verificationStatus).toBe("verified");
    expect(candidate.briefAllowed).toBe(true);
  });

  it("generates a needs-research candidate when evidence is missing", () => {
    const [candidate] = generateCandidatesFromDocument(
      sourceDocument(["Acme Beauty is a skincare retailer with stores in Seoul."])
    );

    expect(candidate.entityName).toBe("Acme Beauty");
    expect(candidate.evidenceSnippet).toBeUndefined();
    expect(candidate.verificationStatus).toBe("needs-research");
    expect(candidate.briefAllowed).toBe(false);
    expect(candidate.nextAction).toBe("make-research-task");
  });

  it("generates verified-ready RawSourceItems from document evidence", () => {
    const [item] = generateRawSourceItemsFromDocument(
      sourceDocument(["Acme Beauty opened a refill station pop-up in Seoul."], {
        entityName: "Acme Beauty",
        entityType: "brand"
      })
    );

    expect(item).toMatchObject({
      entityName: "Acme Beauty",
      entityType: "brand",
      observedFeature: "opened a refill station pop-up in Seoul",
      evidenceSnippet: "Acme Beauty opened a refill station pop-up in Seoul.",
      evidenceType: "article",
      verificationStatus: "verified"
    });
  });

  it("preserves startup source metadata when generating RawSourceItems from documents", () => {
    const [item] = generateRawSourceItemsFromDocument(
      sourceDocument(["Acme AI launched a diagnostic workflow for small clinics."], {
        documentType: "rss",
        collectorType: "rss",
        sourceCategory: "startup_news",
        country: "US",
        language: "en",
        reliabilityTier: 5,
        collectedAt: "2026-07-03T00:00:00.000Z",
        rawHtml: "<html><body>Acme AI launched a diagnostic workflow for small clinics.</body></html>",
        entityName: "Acme AI",
        entityType: "company"
      })
    );

    expect(item).toMatchObject({
      collectorType: "rss",
      sourceCategory: "startup_news",
      country: "US",
      language: "en",
      sourceReliability: 5,
      collectedAt: "2026-07-03T00:00:00.000Z"
    });
    expect(item.rawHtml).toContain("diagnostic workflow");
  });

  it("does not convert investment documents to manual candidates", () => {
    const [candidate] = generateCandidatesFromDocument(
      sourceDocument(["Beta Capital invested in Ledgerly to expand invoice automation."], {
        documentType: "rss",
        collectorType: "rss",
        sourceCategory: "investment_news",
        reliabilityTier: 4,
        entityName: "Beta Capital",
        entityType: "company"
      })
    );

    expect(candidate.category).toBe(CATEGORY_BY_SOURCE.investment_news);
    expect(candidate.scoreBreakdown.sourceReliability).toBe(4);
  });

  it("defaults manual URL documents without sourceCategory to manual", () => {
    const [item] = generateRawSourceItemsFromDocument(
      sourceDocument(["Acme Beauty opened a refill station pop-up in Seoul."], {
        entityName: "Acme Beauty",
        entityType: "brand"
      })
    );

    expect(item.collectorType).toBe("manual-url");
    expect(item.sourceCategory).toBe("manual");
    expect(item.country).toBe("UNKNOWN");
    expect(item.language).toBe("unknown");
    expect(item.sourceReliability).toBe(3);
  });

  it("scores document-derived candidates with preserved source category", () => {
    const [candidate] = generateCandidatesFromDocument(
      sourceDocument(["Acme AI launched a diagnostic workflow for small clinics."], {
        documentType: "official-blog",
        collectorType: "official-blog",
        sourceCategory: "startup_news",
        reliabilityTier: 5,
        entityName: "Acme AI",
        entityType: "company"
      })
    );

    expect(candidate.category).toBe(CATEGORY_BY_SOURCE.startup_news);
    expect(candidate.scoreBreakdown.sourceReliability).toBe(4);
    expect(candidate.scoreBreakdown.sourceReliabilityScore).toBe(15);
  });

  it("generates needs-research RawSourceItems when entity evidence is missing", () => {
    const [item] = generateRawSourceItemsFromDocument(
      sourceDocument(["Acme Beauty is a skincare retailer with stores in Seoul."])
    );

    expect(item.entityName).toBe("Acme Beauty");
    expect(item.evidenceSnippet).toBeUndefined();
    expect(item.verificationStatus).toBe("needs-research");
  });
});
