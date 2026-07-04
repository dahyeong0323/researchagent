import { describe, expect, it } from "vitest";
import { collectRssFeeds, collectRssFeedsWithDocuments } from "../sources/rss.ts";
import type { FeedConfig } from "../sources/feed-config.ts";

const feed: FeedConfig = {
  feedName: "Example Retail Feed",
  feedUrl: "https://news.acme.test/rss.xml",
  sourceCategory: "retail_brand",
  language: "en",
  country: "GLOBAL",
  reliabilityTier: 4
};

const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <guid>acme-1</guid>
      <title>Acme Beauty launches refill station pop-up</title>
      <link>https://news.acme.test/acme-refill</link>
      <pubDate>Wed, 01 Jul 2026 09:00:00 GMT</pubDate>
      <description>Acme Beauty launched a refill station pop-up in Seoul.</description>
    </item>
    <item>
      <guid>macro-1</guid>
      <title>Global economy outlook shifts consumer sentiment</title>
      <link>https://news.acme.test/macro</link>
      <description>A generic macro trend article about interest rates.</description>
    </item>
  </channel>
</rss>`;

const articleHtml = `<!doctype html>
<html>
  <head>
    <title>Acme Beauty launches refill station pop-up</title>
    <meta property="og:site_name" content="Example Retail News">
    <meta name="description" content="Acme Beauty launched a refill station pop-up in Seoul.">
  </head>
  <body>
    <article>
      <h1>Acme Beauty launches refill station pop-up</h1>
      <p>Acme Beauty launched a refill station pop-up in Seoul to test lower-waste shopping rituals.</p>
    </article>
  </body>
</html>`;

function fetchByUrl(responses: Record<string, string | Error>) {
  return async (url: string) => {
    const response = responses[url];
    if (response instanceof Error) {
      throw response;
    }
    if (!response) {
      return {
        ok: false,
        status: 404,
        async text() {
          return "";
        }
      };
    }

    return {
      ok: true,
      status: 200,
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null;
        }
      },
      async text() {
        return response;
      }
    };
  };
}

describe("RSS enrichment", () => {
  it("parses RSS entries into raw source items", async () => {
    const items = await collectRssFeeds([feed], {
      fetchImpl: fetchByUrl({ [feed.feedUrl]: rssXml }),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Acme Beauty launches refill station pop-up",
      sourceUrl: "https://news.acme.test/acme-refill",
      rawSummary: "Acme Beauty launched a refill station pop-up in Seoul."
    });
  });

  it("fetches linked article HTML and returns SourceDocuments", async () => {
    const result = await collectRssFeedsWithDocuments([feed], {
      fetchImpl: fetchByUrl({
        [feed.feedUrl]: rssXml,
        "https://news.acme.test/acme-refill": articleHtml
      }),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(result.sourceDocuments).toHaveLength(1);
    expect(result.sourceDocuments[0]).toMatchObject({
      collectorType: "rss",
      documentType: "rss",
      sourceCategory: "retail_brand",
      reliabilityTier: 4
    });
  });

  it("creates verified candidates from RSS article evidence", async () => {
    const result = await collectRssFeedsWithDocuments([feed], {
      fetchImpl: fetchByUrl({
        [feed.feedUrl]: rssXml,
        "https://news.acme.test/acme-refill": articleHtml
      }),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(result.candidates[0]).toMatchObject({
      entityName: "Acme Beauty",
      verificationStatus: "verified",
      briefAllowed: true
    });
  });

  it("keeps a needs-research fallback candidate when article fetch fails", async () => {
    const result = await collectRssFeedsWithDocuments([feed], {
      fetchImpl: fetchByUrl({
        [feed.feedUrl]: rssXml,
        "https://news.acme.test/acme-refill": new Error("article unavailable")
      }),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(result.errors.some((error) => error.includes("article unavailable"))).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.verificationStatus).toBe("needs-research");
    expect(result.candidates[0]?.briefAllowed).toBe(false);
  });
});
