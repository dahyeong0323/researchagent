import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RawSourceItem } from "../types.ts";
import { checksum, normalizeWhitespace } from "./source-utils.ts";
import type { FeedConfig } from "./feed-config.ts";

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

type CollectRssOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: Date;
};

type ParsedEntry = {
  title: string;
  link: string;
  guid?: string;
  publishedAt?: string;
  summary?: string;
};

const businessSignalPattern =
  /\b(launch|launches|launched|update|updates|updated|expand|expands|expanded|open|opens|opened|introduce|introduces|introduced|rolls out|rolled out|feature|partnership|store|pop-up|popup)\b|출시|도입|확대|오픈|개편/u;

const genericMacroPattern =
  /\b(global economy|market outlook|consumer sentiment|inflation|interest rates|macro trend|economic forecast)\b/i;

const prBoilerplatePattern =
  /\b(shareholder alert|class action|earnings call|financial results|law offices|investor notice)\b/i;

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'");
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/gu, " "));
}

function tagValue(block: string, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "iu");
  const match = pattern.exec(block);
  return match ? normalizeWhitespace(stripTags(match[1])) : undefined;
}

function linkValue(block: string): string | undefined {
  const atomLink = /<link[^>]+href=["']([^"']+)["'][^>]*\/?>/iu.exec(block);
  if (atomLink?.[1]) {
    return decodeEntities(atomLink[1]).trim();
  }

  return tagValue(block, "link");
}

function parseFeedEntries(xml: string): ParsedEntry[] {
  const entryPattern = /<(item|entry)\b[\s\S]*?<\/\1>/giu;
  const entries: ParsedEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = entryPattern.exec(xml)) !== null) {
    const block = match[0];
    const title = tagValue(block, "title");
    const link = linkValue(block);

    if (!title || !link) {
      continue;
    }

    entries.push({
      title,
      link,
      guid: tagValue(block, "guid") ?? tagValue(block, "id"),
      publishedAt: tagValue(block, "pubDate") ?? tagValue(block, "published") ?? tagValue(block, "updated"),
      summary: tagValue(block, "description") ?? tagValue(block, "summary") ?? tagValue(block, "content")
    });
  }

  return entries;
}

function hasLikelyEntity(text: string): boolean {
  if (/\b[A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){1,3}\b/u.test(text)) {
    return true;
  }

  return /[가-힣A-Za-z0-9]+(?:랩스|스토어|페이|뱅크|뷰티|커머스|마켓|브랜드|앱|AI)/u.test(text);
}

function isQualityEntry(entry: ParsedEntry): boolean {
  const text = `${entry.title} ${entry.summary ?? ""}`;

  if (!hasLikelyEntity(text)) {
    return false;
  }

  if (genericMacroPattern.test(text) || prBoilerplatePattern.test(text)) {
    return false;
  }

  return businessSignalPattern.test(text);
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueEntries(entries: ParsedEntry[]): ParsedEntry[] {
  const seen = new Set<string>();
  const kept: ParsedEntry[] = [];

  for (const entry of entries) {
    const key = entry.guid ?? entry.link ?? normalizeTitle(entry.title);
    const titleKey = normalizeTitle(entry.title);
    if (seen.has(key) || seen.has(entry.link) || seen.has(titleKey)) {
      continue;
    }

    seen.add(key);
    seen.add(entry.link);
    seen.add(titleKey);
    kept.push(entry);
  }

  return kept;
}

async function fetchFeed(feed: FeedConfig, options: CollectRssOptions): Promise<string> {
  if (!/^https?:\/\//iu.test(feed.feedUrl)) {
    return readFile(resolve(feed.feedUrl), "utf8");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);

  try {
    const response = await fetchImpl(feed.feedUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`RSS fetch failed for ${feed.feedName}: ${response.status}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function rawItemFromEntry(entry: ParsedEntry, feed: FeedConfig, collectedAt: string): RawSourceItem {
  const sourcePublishedAt = entry.publishedAt ? new Date(entry.publishedAt).toISOString() : undefined;
  const id = entry.guid ?? checksum(`${feed.feedUrl}:${entry.link}:${entry.title}`);

  return {
    id,
    collectorType: "rss",
    title: entry.title,
    sourceUrl: entry.link,
    sourceName: feed.feedName,
    sourcePublishedAt,
    publishedAt: sourcePublishedAt,
    rawSummary: entry.summary,
    canonicalUrl: entry.link,
    fetchStatus: "success",
    parseStatus: "success",
    language: feed.language,
    country: feed.country,
    sourceCategory: feed.sourceCategory,
    sourceReliability: feed.reliabilityTier,
    collectedAt
  };
}

export async function collectRssFeeds(
  configs: FeedConfig[],
  options: CollectRssOptions = {}
): Promise<RawSourceItem[]> {
  const collectedAt = (options.now ?? new Date()).toISOString();
  const items: RawSourceItem[] = [];

  for (const feed of configs) {
    const xml = await fetchFeed(feed, options);
    const entries = uniqueEntries(parseFeedEntries(xml).filter(isQualityEntry));
    items.push(...entries.map((entry) => rawItemFromEntry(entry, feed, collectedAt)));
  }

  return items;
}
