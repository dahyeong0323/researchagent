import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_TOP_LIMIT } from "./config.ts";
import { generateCandidatesFromDocument } from "./candidate-from-document.ts";
import { dedupeCandidates } from "./dedupe.ts";
import { loadLocalEnv } from "./env.ts";
import { readFeedbackMemory } from "./feedback.ts";
import { candidatesWithSuccessfulNotionWrites, readNotionConfig, writeCandidatesToNotion } from "./notion.ts";
import { processRawCandidates } from "./scout.ts";
import { candidatesFromDocumentOrFallback } from "./source-candidates.ts";
import { collectManualUrl, collectRssFeeds, collectRssFeedsWithDocuments } from "./sources/index.ts";
import { assertFeedConfigs, type FeedConfig } from "./sources/feed-config.ts";
import { sendTelegramDailySummary, sendTelegramDailySummaryIfEnabled } from "./telegram.ts";
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
  historySkipped: number;
  candidateRefs: DailyCandidateRef[];
  candidateSnapshotPath?: string;
  errors: string[];
};

export type DailyCandidateRef = {
  candidateId: string;
  topicName: string;
  sourceUrl: string;
  entityName?: string;
  observedFeature?: string;
  verificationStatus: ScoutCandidate["verificationStatus"];
  recordedAt: string;
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
  historyPath?: string;
  candidateSnapshotPath?: string;
  feedbackPath?: string;
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

function normalizeUrlForDedupe(urlValue: string): string {
  try {
    const parsed = new URL(urlValue);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return urlValue.trim().toLowerCase().replace(/\/$/, "");
  }
}

function normalizeTextForDedupe(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateDedupeKeys(candidate: Pick<ScoutCandidate, "candidateId" | "topicName" | "sourceUrl" | "entityName" | "observedFeature">): string[] {
  const keys = [
    `id:${candidate.candidateId}`,
    `url:${normalizeUrlForDedupe(candidate.sourceUrl)}`,
    `topic:${normalizeTextForDedupe(candidate.topicName)}`
  ];

  const entity = normalizeTextForDedupe(candidate.entityName);
  const feature = normalizeTextForDedupe(candidate.observedFeature);
  if (entity && feature) {
    keys.push(`entity-feature:${entity}:${feature}`);
  }

  return keys.filter((key) => !key.endsWith(":"));
}

function verificationRank(candidate: ScoutCandidate): number {
  if (candidate.verificationStatus === "verified") {
    return 3;
  }
  if (candidate.verificationStatus === "needs-research") {
    return 2;
  }
  if (candidate.verificationStatus === "rejected") {
    return 0;
  }
  return 1;
}

function evidenceScore(candidate: ScoutCandidate): number {
  return (candidate.evidenceSnippet?.trim().length ?? 0) + (candidate.evidenceParagraphIds?.length ?? 0) * 20;
}

function isBetterScoutCandidate(candidate: ScoutCandidate, current: ScoutCandidate): boolean {
  const candidateRanks = [
    verificationRank(candidate),
    candidate.score,
    candidate.sourceReliability ?? candidate.scoreBreakdown.sourceReliability,
    evidenceScore(candidate)
  ];
  const currentRanks = [
    verificationRank(current),
    current.score,
    current.sourceReliability ?? current.scoreBreakdown.sourceReliability,
    evidenceScore(current)
  ];

  for (let index = 0; index < candidateRanks.length; index += 1) {
    if (candidateRanks[index] !== currentRanks[index]) {
      return candidateRanks[index] > currentRanks[index];
    }
  }

  return false;
}

function dedupeScoutCandidates(candidates: ScoutCandidate[]): ScoutCandidate[] {
  const kept: ScoutCandidate[] = [];
  const keyToIndex = new Map<string, number>();

  for (const candidate of candidates) {
    const keys = candidateDedupeKeys(candidate);
    const existingIndex = keys.map((key) => keyToIndex.get(key)).find((index) => index !== undefined);

    if (existingIndex !== undefined) {
      if (isBetterScoutCandidate(candidate, kept[existingIndex])) {
        kept[existingIndex] = candidate;
        for (const key of keys) {
          keyToIndex.set(key, existingIndex);
        }
      }
      continue;
    }

    const nextIndex = kept.length;
    kept.push(candidate);
    for (const key of keys) {
      keyToIndex.set(key, nextIndex);
    }
  }

  return kept;
}

type DailyCandidateHistory = {
  version: 1;
  updatedAt: string;
  candidates: DailyCandidateRef[];
};

type DailyCandidateSnapshot = {
  version: 1;
  runId: string;
  updatedAt: string;
  candidates: ScoutCandidate[];
};

function normalizeHistory(value: unknown): DailyCandidateHistory {
  if (!value || typeof value !== "object" || !("candidates" in value) || !Array.isArray((value as { candidates: unknown }).candidates)) {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      candidates: []
    };
  }

  const record = value as { updatedAt?: unknown; candidates: unknown[] };
  return {
    version: 1,
    updatedAt: typeof record.updatedAt === "string"
      ? record.updatedAt
      : new Date(0).toISOString(),
    candidates: record.candidates.filter((item): item is DailyCandidateRef =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as DailyCandidateRef).candidateId === "string" &&
      typeof (item as DailyCandidateRef).topicName === "string" &&
      typeof (item as DailyCandidateRef).sourceUrl === "string"
    )
  };
}

async function readCandidateHistory(path: string): Promise<DailyCandidateHistory> {
  try {
    return normalizeHistory(JSON.parse(await readFile(resolve(path), "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return normalizeHistory(undefined);
    }
    throw error;
  }
}

function candidateRef(candidate: ScoutCandidate, recordedAt: string): DailyCandidateRef {
  return {
    candidateId: candidate.candidateId,
    topicName: candidate.topicName,
    sourceUrl: candidate.sourceUrl,
    entityName: candidate.entityName,
    observedFeature: candidate.observedFeature,
    verificationStatus: candidate.verificationStatus,
    recordedAt
  };
}

function filterCandidatesByHistory(
  candidates: ScoutCandidate[],
  history: DailyCandidateHistory
): { candidates: ScoutCandidate[]; skipped: number } {
  const historyKeys = new Set(history.candidates.flatMap(candidateDedupeKeys));
  const filtered = candidates.filter((candidate) => !candidateDedupeKeys(candidate).some((key) => historyKeys.has(key)));
  return {
    candidates: filtered,
    skipped: candidates.length - filtered.length
  };
}

async function writeCandidateHistory(path: string, candidates: ScoutCandidate[], recordedAt: string): Promise<void> {
  if (candidates.length === 0) {
    return;
  }

  const history = await readCandidateHistory(path);
  const newRefs = candidates.map((candidate) => candidateRef(candidate, recordedAt));
  const newKeys = new Set(newRefs.flatMap(candidateDedupeKeys));
  const merged: DailyCandidateHistory = {
    version: 1,
    updatedAt: recordedAt,
    candidates: [
      ...history.candidates.filter((ref) => !candidateDedupeKeys(ref).some((key) => newKeys.has(key))),
      ...newRefs
    ]
  };

  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

async function writeRunArtifact(path: string, artifact: DailyRunArtifact): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function writeCandidateSnapshot(
  path: string,
  runId: string,
  candidates: ScoutCandidate[],
  updatedAt: string
): Promise<void> {
  const snapshot: DailyCandidateSnapshot = {
    version: 1,
    runId,
    updatedAt,
    candidates
  };
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export async function runDaily(
  options: DailyRunOptions = {},
  dependencies: DailyRunDependencies = {}
): Promise<{ artifact: DailyRunArtifact; artifactPath: string; candidates: ScoutCandidate[] }> {
  const now = dependencies.now?.() ?? new Date();
  const date = options.date ?? todayIsoDate(now);
  const runId = `research-agent:${date}`;
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

  let feedbackMemory;
  try {
    feedbackMemory = await readFeedbackMemory(options.feedbackPath ?? process.env.SCOUT_FEEDBACK_PATH);
  } catch (error) {
    errors.push(`feedback: ${error instanceof Error ? error.message : String(error)}`);
  }

  const rawCandidates = processRawCandidates(dedupeCandidates(rawItems), rawItems.length || limit, feedbackMemory);
  const combinedCandidates = sortCandidates(dedupeScoutCandidates([...rawCandidates, ...directCandidates]));
  const runsDir = options.runsDir ?? DEFAULT_RUNS_DIR;
  const historyPath = options.historyPath ?? resolve(runsDir, "candidate-history.json");
  const historyResult = options.dryRun
    ? { candidates: combinedCandidates, skipped: 0 }
    : filterCandidatesByHistory(combinedCandidates, await readCandidateHistory(historyPath));
  const candidates = historyResult.candidates.slice(0, limit);
  const counts = candidateCounts(candidates);

  let notionWritten = 0;
  const writtenCandidates: ScoutCandidate[] = [];
  if (!options.dryRun && candidates.length > 0) {
    try {
      const notionWriter = dependencies.writeCandidatesToNotion ?? writeCandidatesToNotion;
      const results = await notionWriter(candidates, readNotionConfig(false));
      notionWritten = results.filter((result) => result.ok).length;
      writtenCandidates.push(...candidatesWithSuccessfulNotionWrites(candidates, results));
    } catch (error) {
      errors.push(`notion: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const finishedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const candidateSnapshotPath = options.candidateSnapshotPath ?? resolve(runsDir, "latest-candidates.json");
  let candidateSnapshotWritten = false;
  if (!options.dryRun && candidates.length > 0) {
    try {
      await writeCandidateSnapshot(candidateSnapshotPath, runId, candidates, finishedAt);
      candidateSnapshotWritten = true;
    } catch (error) {
      errors.push(`candidate-snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let telegramSent = 0;
  if (!options.dryRun && writtenCandidates.length > 0 && candidateSnapshotWritten) {
    const telegramSender = dependencies.sendTelegramDailySummary ?? sendTelegramDailySummary;
    telegramSent = (await sendTelegramDailySummaryIfEnabled(writtenCandidates, telegramSender)) ? 1 : 0;
  }

  if (!options.dryRun) {
    await writeCandidateHistory(historyPath, writtenCandidates, finishedAt);
  }

  const artifact: DailyRunArtifact = {
    runId,
    startedAt,
    finishedAt,
    sourceCounts,
    candidateCounts: counts,
    notionWritten,
    telegramSent,
    historySkipped: historyResult.skipped,
    candidateRefs: candidates.map((candidate) => candidateRef(candidate, finishedAt)),
    candidateSnapshotPath: !options.dryRun && candidateSnapshotWritten ? resolve(candidateSnapshotPath) : undefined,
    errors
  };
  const artifactPath = resolve(runsDir, `${date}.json`);
  if (!options.dryRun) {
    await writeRunArtifact(artifactPath, artifact);
  }

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
