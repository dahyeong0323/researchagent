import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectRssFeeds } from "../sources/rss.ts";
import type { FeedConfig } from "../sources/feed-config.ts";

async function fixtureXml(): Promise<string> {
  return readFile(resolve("src/research-agent/__fixtures__/rss/sample-feed.xml"), "utf8");
}

function fetchXml(xml: string) {
  return async () => ({
    ok: true,
    status: 200,
    async text() {
      return xml;
    }
  });
}

const feeds: FeedConfig[] = [
  {
    feedName: "Example Retail Feed",
    feedUrl: "https://news.acme.test/rss.xml",
    sourceCategory: "retail_brand",
    country: "GLOBAL",
    language: "en",
    reliabilityTier: 4
  }
];

describe("RSS collector", () => {
  it("parses fixture entries into raw source items", async () => {
    const items = await collectRssFeeds(feeds, {
      fetchImpl: fetchXml(await fixtureXml()),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(items[0]).toMatchObject({
      title: "Acme Beauty launches refill station pop-up",
      sourceUrl: "https://news.acme.test/acme-refill-pop-up",
      sourceName: "Example Retail Feed",
      sourceReliability: 4,
      collectorType: "rss"
    });
  });

  it("filters generic macro and boilerplate entries", async () => {
    const items = await collectRssFeeds(feeds, {
      fetchImpl: fetchXml(await fixtureXml()),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(items.map((item) => item.title)).toEqual([
      "Acme Beauty launches refill station pop-up"
    ]);
  });
});
