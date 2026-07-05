import { describe, expect, it } from "vitest";
import { extractEvidenceForEntity } from "../evidence.ts";
import type { Entity, SourceDocument } from "../types.ts";

const entity: Entity = {
  entityId: "entity:acme-beauty",
  normalizedName: "acme beauty",
  displayName: "Acme Beauty",
  entityType: "brand",
  aliases: [],
  confidence: 0.9,
  resolutionMethod: "title"
};

const koreanEntity: Entity = {
  entityId: "entity:daiso",
  normalizedName: "다이소",
  displayName: "다이소",
  entityType: "brand",
  aliases: [],
  confidence: 0.9,
  resolutionMethod: "title"
};

function documentWithParagraph(text: string, overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    documentId: "doc:evidence",
    canonicalUrl: "https://news.acme.test/story",
    documentType: "manual-url",
    title: "Acme Beauty opens a refill station pop-up",
    siteName: "Test News",
    contentText: text,
    paragraphs: [{ id: "p1", index: 0, text }],
    reliabilityTier: 3,
    fetchedAt: "2026-07-04T00:00:00.000Z",
    ...overrides
  };
}

describe("evidence extraction", () => {
  it("extracts evidence, observedFeature, and source metadata from an entity-trigger sentence", () => {
    const evidence = extractEvidenceForEntity(
      documentWithParagraph("Acme Beauty opened a refill station pop-up in Seoul."),
      entity
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      entityName: "Acme Beauty",
      observedFeature: "opened a refill station pop-up in Seoul",
      evidenceSnippet: "Acme Beauty opened a refill station pop-up in Seoul.",
      evidenceType: "article",
      sourceUrl: "https://news.acme.test/story",
      paragraphId: "p1",
      trigger: "opened"
    });
  });

  it("does not invent evidence without an entity-trigger sentence", () => {
    const evidence = extractEvidenceForEntity(
      documentWithParagraph("The company is known for skincare retail."),
      entity
    );

    expect(evidence).toHaveLength(0);
  });

  it("does not match English triggers inside unrelated words", () => {
    const evidence = extractEvidenceForEntity(
      documentWithParagraph("Acme Beauty sponsored a creator contest in Seoul."),
      entity
    );

    expect(evidence).toHaveLength(0);
  });

  it("extracts Korean trigger evidence", () => {
    const evidence = extractEvidenceForEntity(
      documentWithParagraph("다이소는 여행용품 섹션을 확대했다."),
      koreanEntity
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      entityName: "다이소",
      observedFeature: "여행용품 섹션을 확대했다",
      trigger: "확대"
    });
  });

  it("uses manual-observation evidence type for manual observations", () => {
    const evidence = extractEvidenceForEntity(
      documentWithParagraph("Acme Beauty tested a refill station in store.", {
        documentType: "manual-observation"
      }),
      entity
    );

    expect(evidence[0]?.evidenceType).toBe("manual-observation");
  });

  it("does not return snippets that are absent from the source text", () => {
    const document = documentWithParagraph("Acme Beauty partnered with a refill logistics startup.");
    const [evidence] = extractEvidenceForEntity(document, entity);

    expect(document.contentText).toContain(evidence.evidenceSnippet);
  });
});
