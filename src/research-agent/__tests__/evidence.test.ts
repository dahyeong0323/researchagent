import { describe, expect, it } from "vitest";
import { extractEvidenceForEntity } from "../evidence.ts";
import type { Entity, SourceDocument } from "../types.ts";

const entity: Entity = {
  entityId: "entity:acme-beauty",
  normalizedName: "acme beauty",
  displayName: "Acme Beauty",
  entityType: "company",
  aliases: [],
  confidence: 0.9,
  resolutionMethod: "title"
};

function documentWithParagraph(text: string): SourceDocument {
  return {
    documentId: "doc:evidence",
    canonicalUrl: "https://news.acme.test/story",
    documentType: "manual-url",
    title: "Acme Beauty opens a refill station pop-up",
    siteName: "Test News",
    contentText: text,
    paragraphs: [{ id: "p1", index: 0, text }],
    reliabilityTier: 3,
    fetchedAt: "2026-07-04T00:00:00.000Z"
  };
}

describe("evidence extraction", () => {
  it("extracts evidence when a paragraph contains the entity and a trigger", () => {
    const evidence = extractEvidenceForEntity(
      documentWithParagraph("Acme Beauty opened a refill station pop-up in Seoul."),
      entity
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      entityName: "Acme Beauty",
      paragraphId: "p1",
      trigger: "open"
    });
  });

  it("does not invent evidence without an entity-trigger sentence", () => {
    const evidence = extractEvidenceForEntity(
      documentWithParagraph("The company is known for skincare retail."),
      entity
    );

    expect(evidence).toHaveLength(0);
  });
});
