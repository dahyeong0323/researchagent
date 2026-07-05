import { describe, expect, it } from "vitest";
import { generateCandidatesFromDocument, generateRawSourceItemsFromDocument } from "../candidate-from-document.ts";
import type { EntityType, SourceDocument } from "../types.ts";

function sourceDocument(
  paragraphs: string[],
  hints: { entityName?: string; entityType?: EntityType } = {}
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

  it("generates needs-research RawSourceItems when entity evidence is missing", () => {
    const [item] = generateRawSourceItemsFromDocument(
      sourceDocument(["Acme Beauty is a skincare retailer with stores in Seoul."])
    );

    expect(item.entityName).toBe("Acme Beauty");
    expect(item.evidenceSnippet).toBeUndefined();
    expect(item.verificationStatus).toBe("needs-research");
  });
});
