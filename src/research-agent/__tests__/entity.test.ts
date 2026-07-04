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

    expect(entities[0]).toMatchObject({
      displayName: "Acme Beauty",
      resolutionMethod: "title"
    });
  });

  it("infers Headspace as an app from title and product context", () => {
    const document = documentWith({
      title: "Headspace launches friend check-in feature",
      description: "The meditation app is testing a social accountability feature.",
      contentText: "Headspace said the app feature helps members check in with friends."
    });

    const entities = extractEntitiesFromDocument(document);

    expect(entities[0]).toMatchObject({
      displayName: "Headspace",
      entityType: "app",
      resolutionMethod: "title"
    });
  });

  it("extracts Olive Better as a brand from retail context", () => {
    const document = documentWith({
      title: "Olive Better opens a Seongsu store",
      description: "A beauty retail brand opens an offline store.",
      contentText: "Olive Better opened a store in Seongsu for beauty shoppers."
    });

    const entities = extractEntitiesFromDocument(document);

    expect(entities[0]).toMatchObject({
      displayName: "Olive Better",
      entityType: "brand"
    });
  });

  it("extracts Daiso from a Korean title trigger", () => {
    const document = documentWith({
      title: "다이소 launches a travel goods section",
      contentText: "다이소는 여행용품 섹션을 확대했다."
    });

    const entities = extractEntitiesFromDocument(document);

    expect(entities[0]).toMatchObject({
      displayName: "다이소",
      entityType: "brand"
    });
  });

  it("extracts repeated body entities with paragraph references", () => {
    const document = documentWith({
      title: "Retail trend report",
      contentText: [
        "Acme Beauty opened a refill station in Seoul.",
        "Acme Beauty said the store is designed around lower-waste shopping."
      ].join("\n"),
      paragraphs: [
        { id: "p1", index: 0, text: "Acme Beauty opened a refill station in Seoul." },
        { id: "p2", index: 1, text: "Acme Beauty said the store is designed around lower-waste shopping." }
      ]
    });

    const entities = extractEntitiesFromDocument(document);

    expect(entities[0]).toMatchObject({
      displayName: "Acme Beauty",
      resolutionMethod: "body",
      sourceParagraphIds: ["p1", "p2"]
    });
  });

  it("rejects generic entity names", () => {
    const document = documentWith({
      title: "some brand launches a feature",
      contentText: "some brand launches a feature."
    });

    expect(extractEntitiesFromDocument(document)).toHaveLength(0);
  });
});
