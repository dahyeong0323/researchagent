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
      sourceCategory: "retail_brand",
      sourceReliability: 4,
      sourcePublishedAt: "2026-07-01T09:00:00.000Z",
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

  it("removes duplicate URLs before creating raw source items", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <guid>one</guid>
      <title>Beta Market opens weekly grocery pickup store</title>
      <link>https://news.acme.test/beta-pickup</link>
      <pubDate>Wed, 01 Jul 2026 09:00:00 GMT</pubDate>
      <description>Beta Market opened a weekly grocery pickup store in Seoul.</description>
    </item>
    <item>
      <guid>two</guid>
      <title>Beta Market opens weekly grocery pickup store</title>
      <link>https://news.acme.test/beta-pickup</link>
      <pubDate>Wed, 01 Jul 2026 10:00:00 GMT</pubDate>
      <description>Beta Market opened a weekly grocery pickup store in Seoul.</description>
    </item>
  </channel>
</rss>`;

    const items = await collectRssFeeds(feeds, {
      fetchImpl: fetchXml(xml),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.sourceUrl).toBe("https://news.acme.test/beta-pickup");
  });

  it("keeps RSS entries with invalid pubDate without throwing", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <guid>invalid-date</guid>
      <title>Beta Market opens weekly grocery pickup store</title>
      <link>https://news.acme.test/beta-invalid-date</link>
      <pubDate>not a real date</pubDate>
      <description>Beta Market opened a weekly grocery pickup store in Seoul.</description>
    </item>
  </channel>
</rss>`;

    const items = await collectRssFeeds(feeds, {
      fetchImpl: fetchXml(xml),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.sourcePublishedAt).toBeUndefined();
    expect(items[0]?.publishedAt).toBeUndefined();
  });

  it("keeps one-word English brands with concrete launch signals", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <guid>netflix-launch</guid>
      <title>Netflix launches immersive retail pop-up</title>
      <link>https://news.acme.test/netflix-pop-up</link>
      <description>Netflix launched an immersive retail pop-up for fans in Seoul.</description>
    </item>
  </channel>
</rss>`;

    const items = await collectRssFeeds(feeds, {
      fetchImpl: fetchXml(xml),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(items.map((item) => item.title)).toEqual(["Netflix launches immersive retail pop-up"]);
  });
});
