import { basename, resolve } from "node:path";
import type { FeedConfig } from "./sources/feed-config.ts";
import type { RawSourceItem, ScoutCandidate } from "./types.ts";

export class UnsafeLiveSourceError extends Error {
  constructor(readonly reasons: string[]) {
    super(
      [
        "Unsafe live research-agent source configuration.",
        "Live runs cannot use sample fixtures, local fixture paths, .test/example URLs, or placeholder sources.",
        "Run with --dry-run for fixtures, or set RESEARCH_AGENT_FEEDS_PATH / RESEARCH_AGENT_MANUAL_INBOX_PATH to real public sources.",
        ...reasons.map((reason) => `- ${reason}`)
      ].join("\n")
    );
    this.name = "UnsafeLiveSourceError";
  }
}

export type LiveSourceGuardInput = {
  dryRun?: boolean;
  feedsPath?: string;
  manualInboxPath?: string;
  feeds?: FeedConfig[];
  manualUrls?: string[];
  rawSourceItems?: RawSourceItem[];
  candidates?: ScoutCandidate[];
};

function normalizePath(value: string): string {
  return resolve(value).replace(/\\/g, "/").toLowerCase();
}

function unsafePathReason(label: string, pathValue: string | undefined): string | undefined {
  if (!pathValue) {
    return undefined;
  }

  const normalized = normalizePath(pathValue);
  const fileName = basename(normalized);
  if (normalized.includes("/__fixtures__/") || normalized.includes("/fixtures/")) {
    return `${label} points at a fixture path: ${pathValue}`;
  }

  if (fileName.includes(".sample.") || fileName.endsWith(".sample.json")) {
    return `${label} points at a sample file: ${pathValue}`;
  }

  return undefined;
}

function hostIsUnsafe(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "test" ||
    hostname.endsWith(".test") ||
    hostname === "example.com" ||
    hostname === "www.example.com" ||
    hostname.endsWith(".example.com") ||
    hostname === "example.org" ||
    hostname === "www.example.org" ||
    hostname.endsWith(".example.org") ||
    hostname === "example.net" ||
    hostname === "www.example.net" ||
    hostname.endsWith(".example.net")
  );
}

function unsafeUrlReason(label: string, urlValue: string | undefined): string | undefined {
  if (!urlValue || urlValue.trim().length === 0) {
    return `${label} is empty`;
  }

  const trimmed = urlValue.trim();
  if (!/^https?:\/\//iu.test(trimmed)) {
    return `${label} is not an HTTP(S) public URL: ${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return `${label} is not a valid URL: ${trimmed}`;
  }

  const lower = trimmed.toLowerCase();
  if (hostIsUnsafe(parsed.hostname.toLowerCase())) {
    return `${label} uses a fixture or placeholder host: ${trimmed}`;
  }

  if (lower.includes("placeholder")) {
    return `${label} looks like placeholder data: ${trimmed}`;
  }

  return undefined;
}

export function findUnsafeLiveSourceReasons(input: LiveSourceGuardInput): string[] {
  if (input.dryRun) {
    return [];
  }

  const reasons = [
    unsafePathReason("feedsPath", input.feedsPath),
    unsafePathReason("manualInboxPath", input.manualInboxPath),
    ...(input.feeds ?? []).map((feed, index) => unsafeUrlReason(`feeds[${index}].feedUrl`, feed.feedUrl)),
    ...(input.manualUrls ?? []).map((url, index) => unsafeUrlReason(`manualUrls[${index}]`, url)),
    ...(input.rawSourceItems ?? []).map((item, index) =>
      unsafeUrlReason(`rawSourceItems[${index}].sourceUrl`, item.sourceUrl)
    ),
    ...(input.candidates ?? []).map((candidate, index) =>
      unsafeUrlReason(`candidates[${index}].sourceUrl`, candidate.sourceUrl)
    )
  ];

  return reasons.filter((reason): reason is string => Boolean(reason));
}

export function assertSafeLiveSources(input: LiveSourceGuardInput): void {
  const reasons = findUnsafeLiveSourceReasons(input);
  if (reasons.length > 0) {
    throw new UnsafeLiveSourceError(reasons);
  }
}
