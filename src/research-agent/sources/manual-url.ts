import type { RawSourceItem, SourceDocument } from "../types.ts";
import { parseHtmlDocument } from "./parse-html.ts";
import { assertSafeManualUrl, checksum, looksLoginOrPaywalled } from "./source-utils.ts";

type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText?: string;
  url?: string;
  headers?: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
};

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<FetchResponseLike>;

export type ManualUrlCollectionResult = {
  rawSourceItem: RawSourceItem;
  sourceDocument: SourceDocument;
};

export type ManualUrlCollectOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: Date;
};

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.MANUAL_URL_FETCH_TIMEOUT_MS ?? "10000", 10);

async function fetchHtml(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) {
      throw new Error(`Manual URL fetch failed with ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`);
    }

    const finalUrl = response.url ? assertSafeManualUrl(response.url).toString() : url;
    const contentType = response.headers?.get("content-type")?.toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error(`Manual URL collector expected HTML but received ${contentType}.`);
    }

    const html = await response.text();
    if (html.trim().length === 0) {
      throw new Error("Manual URL fetch returned an empty body.");
    }

    if (looksLoginOrPaywalled(html)) {
      throw new Error("Manual URL appears to require login, subscription, or paywall access.");
    }

    return { html, finalUrl };
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectManualUrl(
  value: string,
  options: ManualUrlCollectOptions = {}
): Promise<ManualUrlCollectionResult> {
  const url = assertSafeManualUrl(value);
  const fetchImpl = options.fetchImpl ?? fetch;
  const fetchedAt = (options.now ?? new Date()).toISOString();
  const fetched = await fetchHtml(url.toString(), fetchImpl, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const parsed = parseHtmlDocument(fetched.html, fetched.finalUrl);
  const canonicalUrl = assertSafeManualUrl(parsed.canonicalUrl).toString();
  const documentId = `manual-url:${checksum(canonicalUrl).slice(0, 16)}`;

  const sourceDocument: SourceDocument = {
    id: documentId,
    documentId,
    sourceItemId: documentId,
    collectorType: "manual-url",
    sourceUrl: url.toString(),
    canonicalUrl,
    documentType: "manual-url",
    title: parsed.title,
    description: parsed.description,
    publishedAt: parsed.publishedAt,
    siteName: parsed.siteName,
    siteType: "public-web",
    contentText: parsed.contentText,
    rawHtml: fetched.html,
    paragraphs: parsed.paragraphs,
    sourceCategory: "manual",
    collectedAt: fetchedAt,
    language: "unknown",
    country: "UNKNOWN",
    reliabilityTier: 3,
    fetchStatus: "success",
    fetchChecksum: checksum(fetched.html),
    fetchedAt
  };

  const rawSourceItem: RawSourceItem = {
    id: documentId,
    collectorType: "manual-url",
    title: parsed.title,
    sourceUrl: canonicalUrl,
    sourceName: parsed.siteName,
    sourceCategory: "manual",
    sourcePublishedAt: parsed.publishedAt,
    collectedAt: fetchedAt,
    country: "UNKNOWN",
    language: "UNKNOWN",
    rawSummary: parsed.contentText.slice(0, 500),
    rawText: parsed.contentText,
    rawHtml: fetched.html,
    canonicalUrl,
    fetchStatus: "success",
    parseStatus: "success",
    evidenceType: "article",
    verificationStatus: "needs-research",
    verificationNotes: "Manual URL collected; entity and evidence extraction still required."
  };

  return {
    rawSourceItem,
    sourceDocument
  };
}
