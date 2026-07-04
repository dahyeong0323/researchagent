import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectManualUrl, parseHtmlDocument } from "../sources/index.ts";

function fetchHtml(html: string) {
  return async () => ({
    ok: true,
    status: 200,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null;
      }
    },
    async text() {
      return html;
    }
  });
}

async function fixtureHtml(): Promise<string> {
  return readFile(
    resolve("src/research-agent/__fixtures__/source-pages/brand-launch.html"),
    "utf8"
  );
}

describe("manual URL collector", () => {
  it("extracts title from a fixture page", async () => {
    const html = await fixtureHtml();
    const parsed = parseHtmlDocument(html, "https://news.example.org/acme");

    expect(parsed.title).toBe("Acme Beauty opens a refill station pop-up");
  });

  it("extracts canonical URL from a fixture page", async () => {
    const html = await fixtureHtml();
    const parsed = parseHtmlDocument(html, "https://news.example.org/acme");

    expect(parsed.canonicalUrl).toBe("https://news.example.org/acme-beauty-refill-popup");
  });

  it("extracts publishedAt from a fixture page", async () => {
    const html = await fixtureHtml();
    const parsed = parseHtmlDocument(html, "https://news.example.org/acme");

    expect(parsed.publishedAt).toBe("2026-07-01T09:00:00+09:00");
  });

  it("extracts contentText and paragraphs without real network", async () => {
    const html = await fixtureHtml();
    const result = await collectManualUrl("https://news.example.org/acme", {
      fetchImpl: fetchHtml(html),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(result.rawSourceItem.title).toBe("Acme Beauty opens a refill station pop-up");
    expect(result.rawSourceItem.sourceUrl).toBe("https://news.example.org/acme-beauty-refill-popup");
    expect(result.sourceDocument.siteName).toBe("Example Retail News");
    expect(result.sourceDocument.description).toContain("Acme Beauty");
    expect(result.sourceDocument.collectorType).toBe("manual-url");
    expect(result.sourceDocument.sourceUrl).toBe("https://news.example.org/acme");
    expect(result.sourceDocument.fetchStatus).toBe("success");
    expect(result.sourceDocument.contentText).toContain("refill station pop-up");
    expect(result.sourceDocument.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(result.rawSourceItem.fetchStatus).toBe("success");
    expect(result.rawSourceItem.parseStatus).toBe("success");
  });

  it("falls back to readable body text when article tags are absent", async () => {
    const html = [
      "<html>",
      "<head>",
      "<meta property=\"og:url\" content=\"/body-only\">",
      "<meta name=\"description\" content=\"Body fallback description\">",
      "<title>Body fallback article</title>",
      "</head>",
      "<body>",
      "<div>Acme Beauty introduced a refill station pilot without an article wrapper.</div>",
      "</body>",
      "</html>"
    ].join("");

    const result = await collectManualUrl("https://news.example.org/input", {
      fetchImpl: fetchHtml(html),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(result.sourceDocument.canonicalUrl).toBe("https://news.example.org/body-only");
    expect(result.sourceDocument.description).toBe("Body fallback description");
    expect(result.sourceDocument.contentText).toContain("introduced a refill station pilot");
  });

  it("rejects LinkedIn URLs", async () => {
    await expect(
      collectManualUrl("https://www.linkedin.com/posts/example", {
        fetchImpl: fetchHtml("<html><body><p>This should not be fetched.</p></body></html>")
      })
    ).rejects.toThrow("LinkedIn URLs are not allowed");
  });

  it("rejects empty bodies as parse failures", async () => {
    await expect(
      collectManualUrl("https://news.example.org/empty", {
        fetchImpl: fetchHtml("")
      })
    ).rejects.toThrow("empty body");
  });
});
