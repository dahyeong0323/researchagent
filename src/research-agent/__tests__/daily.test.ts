import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDaily } from "../daily.ts";
import type { FeedConfig } from "../sources/feed-config.ts";
import type { RawSourceItem } from "../types.ts";

const now = () => new Date("2026-07-04T00:00:00.000Z");

function verifiedRawItem(overrides: Partial<RawSourceItem> = {}): RawSourceItem {
  return {
    id: overrides.id ?? "rss-verified-1",
    collectorType: "rss",
    title: overrides.title ?? "Acme Beauty launches refill station pop-up",
    sourceUrl: overrides.sourceUrl ?? "https://news.acme.test/acme-refill",
    sourceName: overrides.sourceName ?? "Example Retail Feed",
    sourceCategory: overrides.sourceCategory ?? "retail_brand",
    sourcePublishedAt: overrides.sourcePublishedAt ?? "2026-07-01T00:00:00.000Z",
    sourceReliability: overrides.sourceReliability ?? 4,
    collectedAt: overrides.collectedAt ?? "2026-07-04T00:00:00.000Z",
    rawSummary: overrides.rawSummary ?? "Acme Beauty launched a refill station pop-up in Seoul.",
    entityName: "entityName" in overrides ? overrides.entityName : "Acme Beauty",
    entityType: overrides.entityType ?? "brand",
    observedFeature: "observedFeature" in overrides ? overrides.observedFeature : "refill station launch",
    evidenceSnippet: "evidenceSnippet" in overrides
      ? overrides.evidenceSnippet
      : "Acme Beauty launched a refill station pop-up in Seoul.",
    evidenceType: overrides.evidenceType ?? "article",
    verificationStatus: "verificationStatus" in overrides ? overrides.verificationStatus : "verified"
  };
}

async function tempRunPaths() {
  const root = await mkdtemp(join(tmpdir(), "research-agent-daily-"));
  const feedsPath = join(root, "feeds.json");
  const manualInboxPath = join(root, "manual-inbox.json");
  const runsDir = join(root, "runs");
  const feeds: FeedConfig[] = [
    {
      feedName: "Example Feed",
      feedUrl: "https://news.acme.test/rss.xml",
      sourceCategory: "retail_brand",
      reliabilityTier: 4
    }
  ];
  await writeFile(feedsPath, `${JSON.stringify(feeds)}\n`, "utf8");
  await writeFile(manualInboxPath, "[]\n", "utf8");
  return { root, feedsPath, manualInboxPath, runsDir };
}

describe("daily batch runner", () => {
  it("daily dry-run completes without Notion or Telegram secrets", async () => {
    const paths = await tempRunPaths();
    try {
      const result = await runDaily(
        {
          dryRun: true,
          date: "2026-07-04",
          feedsPath: paths.feedsPath,
          manualInboxPath: paths.manualInboxPath,
          runsDir: paths.runsDir
        },
        {
          now,
          collectRssFeeds: async () => [verifiedRawItem()]
        }
      );

      expect(result.artifact.runId).toBe("research-agent:2026-07-04");
      expect(result.artifact.notionWritten).toBe(1);
      expect(result.artifact.telegramSent).toBe(0);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("creates a run artifact", async () => {
    const paths = await tempRunPaths();
    try {
      const result = await runDaily(
        {
          dryRun: true,
          date: "2026-07-04",
          feedsPath: paths.feedsPath,
          manualInboxPath: paths.manualInboxPath,
          runsDir: paths.runsDir
        },
        {
          now,
          collectRssFeeds: async () => [verifiedRawItem()]
        }
      );
      const artifact = JSON.parse(await readFile(result.artifactPath, "utf8")) as { candidateCounts: { total: number } };

      expect(artifact.candidateCounts.total).toBe(1);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("captures collector errors without crashing the whole run", async () => {
    const paths = await tempRunPaths();
    try {
      const result = await runDaily(
        {
          dryRun: true,
          date: "2026-07-04",
          feedsPath: paths.feedsPath,
          manualInboxPath: paths.manualInboxPath,
          runsDir: paths.runsDir
        },
        {
          now,
          collectRssFeeds: async () => {
            throw new Error("feed unavailable");
          }
        }
      );

      expect(result.artifact.errors.some((error) => error.includes("feed unavailable"))).toBe(true);
      expect(result.artifact.candidateCounts.total).toBe(0);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("does not mark candidates verified without evidence", async () => {
    const paths = await tempRunPaths();
    try {
      const result = await runDaily(
        {
          dryRun: true,
          date: "2026-07-04",
          feedsPath: paths.feedsPath,
          manualInboxPath: paths.manualInboxPath,
          runsDir: paths.runsDir
        },
        {
          now,
          collectRssFeeds: async () => [
            verifiedRawItem({
              evidenceSnippet: undefined,
              observedFeature: undefined,
              verificationStatus: undefined
            })
          ]
        }
      );

      expect(result.artifact.candidateCounts.verified).toBe(0);
      expect(result.artifact.candidateCounts.needsResearch).toBe(1);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("sends only top candidates to Telegram", async () => {
    const paths = await tempRunPaths();
    let sentCount = 0;
    try {
      const result = await runDaily(
        {
          dryRun: false,
          date: "2026-07-04",
          limit: 2,
          feedsPath: paths.feedsPath,
          manualInboxPath: paths.manualInboxPath,
          runsDir: paths.runsDir
        },
        {
          now,
          collectRssFeeds: async () => [
            verifiedRawItem({ id: "one", title: "Acme Beauty launches refill station pop-up one", sourceUrl: "https://news.acme.test/one" }),
            verifiedRawItem({ id: "two", title: "Beta Market opens Seoul store", sourceUrl: "https://news.acme.test/two" }),
            verifiedRawItem({ id: "three", title: "Coda App launches new feature", sourceUrl: "https://news.acme.test/three" })
          ],
          writeCandidatesToNotion: async (candidates) =>
            candidates.map((candidate) => ({
              ok: true,
              candidateId: candidate.id,
              topicName: candidate.topicName,
              dryRun: false
            })),
          sendTelegramDailySummary: async (candidates) => {
            sentCount = candidates.length;
            return true;
          }
        }
      );

      expect(result.artifact.telegramSent).toBe(1);
      expect(sentCount).toBe(2);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });
});
