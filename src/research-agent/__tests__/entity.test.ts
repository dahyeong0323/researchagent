import { describe, expect, it } from "vitest";
import { extractEntitiesFromDocument } from "../entity.ts";
import type { SourceDocument } from "../types.ts";

function documentWith(overrides: Partial<SourceDocument>): SourceDocument {
  return {
    documentId: "doc:entity",
    canonicalUrl: "https://news.acme.test/story",
    documentType: "manual-url",
    title: "Untitled",
    siteName: "Test News",
    contentText: "",
    paragraphs: [],
    reliabilityTier: 3,
    fetchedAt: "2026-07-04T00:00:00.000Z",
    ...overrides
  };
}

describe("entity extraction", () => {
  it("extracts an entity from JSON-LD", () => {
    const document = documentWith({
      contentMarkdown: `<script type="application/ld+json">{"@type":"Organization","name":"Acme Beauty"}</script>`,
      contentText: "Acme Beauty opened a refill station."
    });

    const entities = extractEntitiesFromDocument(document);

    expect(entities[0]).toMatchObject({
      displayName: "Acme Beauty",
      entityType: "company",
      resolutionMethod: "jsonld"
    });
  });

  it("extracts an entity from a title trigger", () => {
    const document = documentWith({
      title: "Acme Beauty opens a refill station pop-up",
      contentText: "A retail article."
    });

    const entities = extractEntitiesFromDocument(document);

    expect(entities[0]?.displayName).toBe("Acme Beauty");
    expect(entities[0]?.resolutionMethod).toBe("title");
  });

  it("rejects generic entity names", () => {
    const document = documentWith({
      title: "명상 앱 출시",
      contentText: "명상 앱 출시 소식입니다."
    });

    expect(extractEntitiesFromDocument(document)).toHaveLength(0);
  });
});
