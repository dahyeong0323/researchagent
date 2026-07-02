import type { RawSourceItem } from "./types.ts";

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, "");
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .filter((token) => token.length >= 2)
  );
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

export function dedupeCandidates(items: RawSourceItem[]): RawSourceItem[] {
  const seenUrls = new Set<string>();
  const kept: RawSourceItem[] = [];
  const keptTitleTokens: Set<string>[] = [];

  for (const item of items) {
    const urlKey = normalizeUrl(item.sourceUrl);
    if (seenUrls.has(urlKey)) {
      continue;
    }

    const currentTitleTokens = titleTokens(item.title);
    const hasSimilarTitle = keptTitleTokens.some(
      (tokens) => jaccardSimilarity(tokens, currentTitleTokens) >= 0.82
    );

    if (hasSimilarTitle) {
      continue;
    }

    seenUrls.add(urlKey);
    kept.push(item);
    keptTitleTokens.push(currentTitleTokens);
  }

  return kept;
}
