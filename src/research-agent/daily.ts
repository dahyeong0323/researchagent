import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_TOP_LIMIT } from "./config.ts";
import { generateCandidatesFromDocument } from "./candidate-from-document.ts";
import { dedupeCandidates } from "./dedupe.ts";
import { loadLocalEnv } from "./env.ts";
import { readNotionConfig, writeCandidatesToNotion } from "./notion.ts";
import { processRawCandidates } from "./scout.ts";
import { candidatesFromDocumentOrFallback } from "./source-candidates.ts";
import { collectManualUrl, collectRssFeeds, collectRssFeedsWithDocuments } from "./sources/index.ts";
import { assertFeedConfigs, type FeedConfig } from "./sources/feed-config.ts";
import { sendTelegramDailySummary } from "./telegram.ts";
import type { RawSourceItem, ScoutCandidate } from "./types.ts";

loadLocalEnv();

export type DailyRunArtifact = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  sourceCounts: Record<string, number>;
  candidateCounts: {
    total: number;
    verified: number;
    needsResearch: number;
    rejected: number;
  };
  notionWritten: number;
  telegramSent: number;
  errors: string[];
};

type ManualInbox =
  | Array<string | RawSourceItem>
  | {
      urls?: string[];
      rawSourceItems?: RawSourceItem[];
    };

export type DailyRunOptions = {
  dryRun?: boolean;
  date?: string;
  limit?: number;
  feedsPath?: string;
  manualInboxPath?: string;
  runsDir?: string;
};

export type DailyRunDependencies = {
  collectRssFeeds?: typeof collectRssFeeds;
  collectRssFeedsWithDocuments?: typeof collectRssFeedsWithDocuments;
  collectManualUrl?: typeof collectManualUrl;
  writeCandidatesToNotion?: typeof writeCandidatesToNotion;
  sendTelegramDailySummary?: typeof sendTelegramDailySummary;
  now?: () => Date;
};

const DEFAULT_FEEDS_PATH = process.env.RESEARCH_AGENT_FEEDS_PATH ?? "data/research-agent/feeds.sample.json";
const DEFAULT_MANUAL_INBOX_PATH = process.env.RESEARCH_AGENT_MANUAL_INBOX_PATH ?? "data/research-agent/manual-inbox.json";
const DEFAULT_RUNS_DIR = process.env.RESEARCH_AGENT_RUNS_DIR ?? "data/research-agent/runs";

function todayIsoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function readCliOptions(argv: string[]): DailyRunOptions {
  const options: DailyRunOptions = {
    dryRun: false,
    limit: DEFAULT_TOP_LIMIT,
    feedsPath: DEFAULT_FEEDS_PATH,
    manualInboxPath: DEFAULT_MANUAL_INBOX_PATH,
    runsDir: DEFAULT_RUNS_DIR
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--date" && next) {
      options.date = next;
      index += 1;
    } else if ((arg === "--limit" || arg === "-l") && next) {
      options.limit = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--feeds" && next) {
      options.feedsPath = next;
      index += 1;
    } else if (arg === "--manual-inbox" && next) {
      options.manualInboxPath = next;
      index += 1;
    } else if (arg === "--runs-dir" && next) {
      options.runsDir = next;
      index += 1;
    }
  }

  return options;
}

async function readJsonIfExists(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function isRawSourceItem(value: unknown): value is RawSourceItem {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Partial<RawSourceItem>).title === "string" &&
    typeof (value as Partial<RawSourceItem>).sourceUrl === "string" &&
    typeof (value as Partial<RawSourceItem>).sourceName === "string" &&
    typeof (value as Partial<RawSourceItem>).sourceCategory === "string" &&
    typeof (value as Partial<RawSourceItem>).collectedAt === "string";
}

function normalizeManualInbox(value: unknown): { urls: string[]; rawSourceItems: RawSourceItem[] } {
  if (!value) {
    return { urls: [], rawSourceItems: [] };
  }

  if (Array.isArray(value)) {
    return {
      urls: value.filter((item): item is string => typeof item === "string"),
      rawSourceItems: value.filter(isRawSourceItem)
    };
  }

  if (typeof value !== "object") {
    return { urls: [], rawSourceItems: [] };
  }

  const inbox = value as { urls?: unknown; rawSourceItems?: unknown };
  return {
    urls: Array.isArray(inbox.urls)
      ? inbox.urls.filter((item: unknown): item is string => typeof item === "string")
      : [],
    rawSourceItems: Array.isArray(inbox.rawSourceItems) ? inbox.rawSourceItems.filter(isRawSourceItem) : []
  };
}

function candidateCounts(candidates: ScoutCandidate[]): DailyRunArtifact["candidateCounts"] {
  return {
    total: candidates.length,
    verified: candidates.filter((candidate) => candidate.verificationStatus === "verified").length,
    needsResearch: candidates.filter((candidate) => candidate.verificationStatus === "needs-research").length,
    rejected: candidates.filter((candidate) => candidate.verificationStatus === "rejected").length
  };
}

function sortCandidates(candidates: ScoutCandidate[]): ScoutCandidate[] {
  return [...candidates].sort((left, right) => right.score - left.score || left.topicName.localeCompare(right.topicName));
}

async function writeRunArtifact(path: string, artifact: DailyRunArtifact): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

export async function runDaily(
  options: DailyRunOptions = {},
  dependencies: DailyRunDependencies = {}
): Promise<{ artifact: DailyRunArtifact; artifactPath: string; candidates: ScoutCandidate[] }> {
  const now = dependencies.now?.() ?? new Date();
  const date = options.date ?? todayIsoDate(now);
  const limit = options.limit ?? DEFAULT_TOP_LIMIT;
  const startedAt = now.toISOString();
  const errors: string[] = [];
  const sourceCounts: Record<string, number> = {};
  const rawItems: RawSourceItem[] = [];
  const directCandidates: ScoutCandidate[] = [];
  const rssCollector = dependencies.collectRssFeeds ?? collectRssFeeds;
  const rssDocumentCollector = dependencies.collectRssFeedsWithDocuments ?? collectRssFeedsWithDocuments;
  const manualCollector = dependencies.collectManualUrl ?? collectManualUrl;

  try {
    const feedValue = await readJsonIfExists(options.feedsPath ?? DEFAULT_FEEDS_PATH);
    if (feedValue) {
      assertFeedConfigs(feedValue);
      if (dependencies.collectRssFeeds) {
        const rssItems = await rssCollector(feedValue as FeedConfig[], { now });
        rawItems.push(...rssItems);
        sourceCounts.rss = rssItems.length;
      } else {
        const rssResult = await rssDocumentCollector(feedValue as FeedConfig[], { now });
        directCandidates.push(...rssResult.candidates);
        sourceCounts.rss = rssResult.rawSourceItems.length;
        sourceCounts.rssDocuments = rssResult.sourceDocuments.length;
        errors.push(...rssResult.errors);
      }
    } else {
      sourceCounts.rss = 0;
      sourceCounts.rssDocuments = 0;
    }
  } catch (error) {
    sourceCounts.rss = 0;
    errors.push(`rss: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const manualValue = await readJsonIfExists(options.manualInboxPath ?? DEFAULT_MANUAL_INBOX_PATH);
    const manualInbox = normalizeManualInbox(manualValue);
    rawItems.push(...manualInbox.rawSourceItems);
    sourceCounts.manualRaw = manualInbox.rawSourceItems.length;
    sourceCounts.manualUrl = 0;

    for (const url of manualInbox.urls) {
      try {
        const collected = await manualCollector(url, { now });
        const documentCandidates = generateCandidatesFromDocument(collected.sourceDocument);
        if (documentCandidates.length > 0) {
          directCandidates.push(...documentCandidates);
        } else {
          directCandidates.push(...candidatesFromDocumentOrFallback(collected.sourceDocument, collected.rawSourceItem));
        }
        sourceCounts.manualUrl += 1;
      } catch (error) {
        errors.push(`manual-url:${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    sourceCounts.manualRaw = 0;
    sourceCounts.manualUrl = 0;
    errors.push(`manual-inbox: ${error instanceof Error ? error.message : String(error)}`);
  }

  const rawCandidates = processRawCandidates(dedupeCandidates(rawItems), rawItems.length || limit);
  const candidates = sortCandidates([...rawCandidates, ...directCandidates]).slice(0, limit);
  const counts = candidateCounts(candidates);

  let notionWritten = 0;
  if (candidates.length > 0) {
    try {
      const notionWriter = dependencies.writeCandidatesToNotion ?? writeCandidatesToNotion;
      const results = await notionWriter(candidates, readNotionConfig(Boolean(options.dryRun)));
      notionWritten = results.filter((result) => result.ok).length;
    } catch (error) {
      errors.push(`notion: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let telegramSent = 0;
  if (!options.dryRun && candidates.length > 0 && notionWritten > 0) {
    try {
      const telegramSender = dependencies.sendTelegramDailySummary ?? sendTelegramDailySummary;
      telegramSent = (await telegramSender(candidates.slice(0, Math.min(limit, 5)))) ? 1 : 0;
    } catch (error) {
      errors.push(`telegram: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const finishedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const artifact: DailyRunArtifact = {
    runId: `research-agent:${date}`,
    startedAt,
    finishedAt,
    sourceCounts,
    candidateCounts: counts,
    notionWritten,
    telegramSent,
    errors
  };
  const artifactPath = resolve(options.runsDir ?? DEFAULT_RUNS_DIR, `${date}.json`);
  await writeRunArtifact(artifactPath, artifact);

  return { artifact, artifactPath, candidates };
}

async function main(): Promise<void> {
  const result = await runDaily(readCliOptions(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result.artifact, null, 2)}\n`);
  process.stdout.write(`Run artifact: ${result.artifactPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Daily research agent failed: ${message}\n`);
    process.exitCode = 1;
  });
}
