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

function normalizeToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("ches") || token.endsWith("shes")) {
    return token.slice(0, -2);
  }
  if (token.endsWith("ed") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 4) {
    return token.slice(0, -1);
  }
  return token;
}

function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .map(normalizeToken)
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

function verificationRank(item: RawSourceItem): number {
  if (item.verificationStatus === "verified") {
    return 3;
  }
  if (item.verificationStatus === "needs-research") {
    return 2;
  }
  if (item.verificationStatus === "rejected") {
    return 0;
  }
  return 1;
}

function publishedTime(item: RawSourceItem): number {
  const value = item.sourcePublishedAt ?? item.publishedAt ?? item.collectedAt;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function evidenceScore(item: RawSourceItem): number {
  return item.evidenceSnippet?.trim().length ?? 0;
}

function isBetterCandidate(candidate: RawSourceItem, current: RawSourceItem): boolean {
  const candidateRanks = [
    verificationRank(candidate),
    candidate.sourceReliability ?? 0,
    evidenceScore(candidate),
    publishedTime(candidate)
  ];
  const currentRanks = [
    verificationRank(current),
    current.sourceReliability ?? 0,
    evidenceScore(current),
    publishedTime(current)
  ];

  for (let index = 0; index < candidateRanks.length; index += 1) {
    if (candidateRanks[index] !== currentRanks[index]) {
      return candidateRanks[index] > currentRanks[index];
    }
  }

  return false;
}

export function dedupeCandidates(items: RawSourceItem[]): RawSourceItem[] {
  const seenUrls = new Set<string>();
  const kept: RawSourceItem[] = [];
  const keptTitleTokens: Set<string>[] = [];

  for (const item of items) {
    const urlKey = normalizeUrl(item.sourceUrl);
    const existingUrlIndex = kept.findIndex((keptItem) => normalizeUrl(keptItem.sourceUrl) === urlKey);
    if (existingUrlIndex >= 0) {
      if (isBetterCandidate(item, kept[existingUrlIndex])) {
        kept[existingUrlIndex] = item;
        keptTitleTokens[existingUrlIndex] = titleTokens(item.title);
      }
      continue;
    }

    const currentTitleTokens = titleTokens(item.title);
    const similarTitleIndex = keptTitleTokens.findIndex(
      (tokens) => jaccardSimilarity(tokens, currentTitleTokens) >= 0.82
    );

    if (similarTitleIndex >= 0) {
      if (isBetterCandidate(item, kept[similarTitleIndex])) {
        seenUrls.delete(normalizeUrl(kept[similarTitleIndex].sourceUrl));
        seenUrls.add(urlKey);
        kept[similarTitleIndex] = item;
        keptTitleTokens[similarTitleIndex] = currentTitleTokens;
      }
      continue;
    }

    seenUrls.add(urlKey);
    kept.push(item);
    keptTitleTokens.push(currentTitleTokens);
  }

  return kept;
}
