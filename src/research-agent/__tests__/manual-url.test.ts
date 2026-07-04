import { describe, expect, it } from "vitest";
import { candidatesFromDocumentOrFallback } from "../source-candidates.ts";
import { collectManualUrl } from "../sources/manual-url.ts";

function response(html: string, contentType = "text/html; charset=utf-8") {
  return async () => ({
    ok: true,
    status: 200,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      }
    },
    async text() {
      return html;
    }
  });
}

describe("manual URL safety and fallback", () => {
  it("rejects LinkedIn URLs", async () => {
    await expect(
      collectManualUrl("https://www.linkedin.com/posts/example", {
        fetchImpl: response("<html><body>blocked</body></html>")
      })
    ).rejects.toThrow("LinkedIn URLs are not allowed");
  });

  it("rejects non-HTML responses", async () => {
    await expect(
      collectManualUrl("https://news.example.org/data.json", {
        fetchImpl: response("{}", "application/json")
      })
    ).rejects.toThrow("expected HTML");
  });

  it("rejects login or paywall-looking pages", async () => {
    await expect(
      collectManualUrl("https://news.example.org/paywall", {
        fetchImpl: response("<html><body>Subscribe to continue reading this article.</body></html>")
      })
    ).rejects.toThrow("login, subscription, or paywall");
  });

  it("parses title, canonical URL, site name, and paragraphs from mocked HTML", async () => {
    const result = await collectManualUrl("https://news.example.org/input", {
      fetchImpl: response(`<!doctype html>
<html>
  <head>
    <link rel="canonical" href="https://news.example.org/acme-refill">
    <meta property="og:site_name" content="Example Retail News">
    <title>Acme Beauty launches refill station pop-up</title>
  </head>
  <body>
    <article>
      <p>Acme Beauty launched a refill station pop-up in Seoul.</p>
      <p>The company is testing lower-waste shopping rituals.</p>
    </article>
  </body>
</html>`),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(result.sourceDocument.title).toBe("Acme Beauty launches refill station pop-up");
    expect(result.sourceDocument.canonicalUrl).toBe("https://news.example.org/acme-refill");
    expect(result.sourceDocument.siteName).toBe("Example Retail News");
    expect(result.sourceDocument.paragraphs).toHaveLength(2);
  });

  it("creates one needs-research fallback candidate when no entity is extracted", async () => {
    const result = await collectManualUrl("https://news.example.org/plain", {
      fetchImpl: response(`<!doctype html>
<html>
  <head><title>plain update</title></head>
  <body><article><p>lower waste shopping rituals are mentioned without a concrete named entity.</p></article></body>
</html>`),
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    const candidates = candidatesFromDocumentOrFallback(result.sourceDocument, result.rawSourceItem);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.verificationStatus).toBe("needs-research");
    expect(candidates[0]?.briefAllowed).toBe(false);
  });
});
