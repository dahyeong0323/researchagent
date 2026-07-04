import type { SourceParagraph } from "../types.ts";
import { normalizeWhitespace } from "./source-utils.ts";

export type ParsedHtmlDocument = {
  canonicalUrl: string;
  title: string;
  siteName: string;
  description?: string;
  publishedAt?: string;
  contentText: string;
  paragraphs: SourceParagraph[];
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "));
}

function firstMatch(html: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return undefined;
}

function absolutizeUrl(value: string | undefined, sourceUrl: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value, sourceUrl).toString();
  } catch {
    return undefined;
  }
}

function extractParagraphs(html: string): SourceParagraph[] {
  const candidates = [...html.matchAll(/<(p|li|h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => normalizeWhitespace(stripTags(match[2] ?? "")))
    .filter((text) => text.length >= 20);

  return candidates.map((text, index) => ({
    id: `p${index + 1}`,
    index,
    text
  }));
}

function readableHtmlRegion(html: string): string {
  return (
    firstMatch(html, [
      /<article\b[^>]*>([\s\S]*?)<\/article>/i,
      /<main\b[^>]*>([\s\S]*?)<\/main>/i,
      /<body\b[^>]*>([\s\S]*?)<\/body>/i
    ]) ?? html
  );
}

function fallbackBodyText(html: string): string {
  const body = readableHtmlRegion(html);
  return normalizeWhitespace(stripTags(body));
}

export function parseHtmlDocument(html: string, sourceUrl: string): ParsedHtmlDocument {
  const cleanedHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

  const canonicalUrl =
    absolutizeUrl(
      firstMatch(cleanedHtml, [
        /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i,
        /<meta\b[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["'][^>]*>/i
      ]),
      sourceUrl
    ) ?? sourceUrl;
  const title =
    firstMatch(cleanedHtml, [
      /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<title\b[^>]*>([\s\S]*?)<\/title>/i,
      /<h1\b[^>]*>([\s\S]*?)<\/h1>/i
    ]) ?? "Untitled source";
  const siteName =
    firstMatch(cleanedHtml, [
      /<meta\b[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<meta\b[^>]*name=["']application-name["'][^>]*content=["']([^"']+)["'][^>]*>/i
    ]) ?? new URL(sourceUrl).hostname;
  const description = firstMatch(cleanedHtml, [
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i
  ]);
  const publishedAt = firstMatch(cleanedHtml, [
    /<meta\b[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*name=["']date["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*name=["']pubdate["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*name=["']publishdate["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i
  ]);

  const readableRegion = readableHtmlRegion(cleanedHtml);
  const paragraphs = extractParagraphs(readableRegion);
  const contentText =
    paragraphs.length > 0 ? paragraphs.map((paragraph) => paragraph.text).join("\n\n") : fallbackBodyText(readableRegion);

  if (normalizeWhitespace(contentText).length === 0) {
    throw new Error("Parsed HTML did not contain readable text.");
  }

  return {
    canonicalUrl,
    title: normalizeWhitespace(title),
    siteName: normalizeWhitespace(siteName),
    description: description ? normalizeWhitespace(description) : undefined,
    publishedAt,
    contentText,
    paragraphs
  };
}
