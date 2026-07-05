import { describe, expect, it } from "vitest";
import { writeCandidatesToNotionAndMaybeSendTelegram } from "../index.ts";
import type { ScoutCandidate } from "../types.ts";

function candidate(overrides: Partial<ScoutCandidate> = {}): ScoutCandidate {
  return {
    id: overrides.id ?? "candidate-1",
    candidateId: overrides.candidateId ?? overrides.id ?? "candidate-1",
    discoveredDate: "2026-07-02",
    status: "new",
    feedbackLabels: [],
    score: overrides.score ?? 91,
    scoreBreakdown: {
      concreteCase: 20,
      whyGudiStrength: 18,
      consumerBehaviorPotential: 14,
      businessInterpretability: 14,
      dahyeongFit: 12,
      novelty: 8,
      sourceReliability: 5,
      visitabilityBonus: 0
    },
    category: overrides.category ?? "retail_brand",
    topicName: overrides.topicName ?? "Acme Beauty launches refill station",
    oneLineSummary: overrides.oneLineSummary ?? "Acme Beauty launched a refill station.",
    coreWhyGudiQuestion: overrides.coreWhyGudiQuestion ?? "Why did Acme Beauty make refill visible?",
    businessObservationAngle: overrides.businessObservationAngle ?? "Retail behavior observation",
    consumerBehaviorAngle: overrides.consumerBehaviorAngle ?? "Refill participation behavior",
    connectionToExistingPosts: overrides.connectionToExistingPosts ?? "Connects to retail ritual posts",
    overlapRisk: overrides.overlapRisk ?? "low",
    recommendedFormat: overrides.recommendedFormat ?? "short observation",
    visitPossible: overrides.visitPossible ?? "unknown",
    sourceUrl: overrides.sourceUrl ?? "https://news.acme.co.kr/source",
    sourceName: overrides.sourceName ?? "Example News",
    nextAction: overrides.nextAction ?? "review",
    entityName: overrides.entityName ?? "Acme Beauty",
    entityType: overrides.entityType ?? "brand",
    observedFeature: overrides.observedFeature ?? "refill station launch",
    evidenceType: overrides.evidenceType ?? "article",
    evidenceSnippet: overrides.evidenceSnippet ?? "Acme Beauty launched a refill station.",
    verificationStatus: overrides.verificationStatus ?? "verified",
    briefAllowed: overrides.briefAllowed ?? true,
    verificationNotes: overrides.verificationNotes,
    missingFields: overrides.missingFields
  } as ScoutCandidate;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("research agent Notion and Telegram CLI flow", () => {
  it("does not call Notion or Telegram for zero live candidates", async () => {
    const previousNotionApiKey = process.env.NOTION_API_KEY;
    const previousNotionDatabaseId = process.env.NOTION_DATABASE_ID;
    const previousNotionDataSourceId = process.env.NOTION_DATA_SOURCE_ID;
    delete process.env.NOTION_API_KEY;
    delete process.env.NOTION_DATABASE_ID;
    delete process.env.NOTION_DATA_SOURCE_ID;
    let notionCalled = false;
    let telegramCalled = false;

    try {
      const results = await writeCandidatesToNotionAndMaybeSendTelegram([], false, {
        writeCandidatesToNotion: async () => {
          notionCalled = true;
          throw new Error("Notion writer should not be called");
        },
        sendTelegramDailySummary: async () => {
          telegramCalled = true;
          return true;
        }
      });

      expect(results).toEqual([]);
      expect(notionCalled).toBe(false);
      expect(telegramCalled).toBe(false);
    } finally {
      restoreEnv("NOTION_API_KEY", previousNotionApiKey);
      restoreEnv("NOTION_DATABASE_ID", previousNotionDatabaseId);
      restoreEnv("NOTION_DATA_SOURCE_ID", previousNotionDataSourceId);
    }
  });

  it("does not call Notion or Telegram for zero dry-run candidates", async () => {
    let notionCalled = false;
    let telegramCalled = false;

    const results = await writeCandidatesToNotionAndMaybeSendTelegram([], true, {
      writeCandidatesToNotion: async () => {
        notionCalled = true;
        return [];
      },
      sendTelegramDailySummary: async () => {
        telegramCalled = true;
        return true;
      }
    });

    expect(results).toEqual([]);
    expect(notionCalled).toBe(false);
    expect(telegramCalled).toBe(false);
  });

  it("sends Telegram only for successful Notion writes", async () => {
    const previousTelegramEnabled = process.env.TELEGRAM_ENABLED;
    const candidates = [
      candidate({ id: "candidate-1" }),
      candidate({ id: "candidate-2", topicName: "Beta Market opens compact store" })
    ];
    let sentCandidateIds: string[] = [];

    try {
      process.env.TELEGRAM_ENABLED = "1";
      const results = await writeCandidatesToNotionAndMaybeSendTelegram(candidates, false, {
        writeCandidatesToNotion: async () => [
          {
            ok: true,
            candidateId: "candidate-1",
            topicName: "Acme Beauty launches refill station",
            dryRun: false
          },
          {
            ok: false,
            candidateId: "candidate-2",
            topicName: "Beta Market opens compact store",
            dryRun: false,
            error: "Notion request failed"
          }
        ],
        sendTelegramDailySummary: async (sentCandidates) => {
          sentCandidateIds = sentCandidates.map((sentCandidate) => sentCandidate.id);
          return true;
        }
      });

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(sentCandidateIds).toEqual(["candidate-1"]);
    } finally {
      restoreEnv("TELEGRAM_ENABLED", previousTelegramEnabled);
    }
  });

  it("does not send Telegram in dry-run mode", async () => {
    const previousTelegramEnabled = process.env.TELEGRAM_ENABLED;
    let telegramCalled = false;

    try {
      process.env.TELEGRAM_ENABLED = "1";
      await writeCandidatesToNotionAndMaybeSendTelegram([candidate()], true, {
        writeCandidatesToNotion: async (candidates) =>
          candidates.map((notionCandidate) => ({
            ok: true,
            candidateId: notionCandidate.id,
            topicName: notionCandidate.topicName,
            dryRun: true
          })),
        sendTelegramDailySummary: async () => {
          telegramCalled = true;
          return true;
        }
      });

      expect(telegramCalled).toBe(false);
    } finally {
      restoreEnv("TELEGRAM_ENABLED", previousTelegramEnabled);
    }
  });

  it("keeps Telegram failures non-fatal after Notion writes", async () => {
    const previousTelegramEnabled = process.env.TELEGRAM_ENABLED;

    try {
      process.env.TELEGRAM_ENABLED = "1";
      await expect(
        writeCandidatesToNotionAndMaybeSendTelegram([candidate()], false, {
          writeCandidatesToNotion: async (candidates) =>
            candidates.map((notionCandidate) => ({
              ok: true,
              candidateId: notionCandidate.id,
              topicName: notionCandidate.topicName,
              dryRun: false
            })),
          sendTelegramDailySummary: async () => {
            throw new Error("telegram unavailable");
          }
        })
      ).resolves.toEqual([
        {
          ok: true,
          candidateId: "candidate-1",
          topicName: "Acme Beauty launches refill station",
          dryRun: false
        }
      ]);
    } finally {
      restoreEnv("TELEGRAM_ENABLED", previousTelegramEnabled);
    }
  });

  it("does not send Telegram when TELEGRAM_ENABLED is not 1", async () => {
    const previousTelegramEnabled = process.env.TELEGRAM_ENABLED;
    let telegramCalled = false;

    try {
      delete process.env.TELEGRAM_ENABLED;
      await writeCandidatesToNotionAndMaybeSendTelegram([candidate()], false, {
        writeCandidatesToNotion: async (candidates) =>
          candidates.map((notionCandidate) => ({
            ok: true,
            candidateId: notionCandidate.id,
            topicName: notionCandidate.topicName,
            dryRun: false
          })),
        sendTelegramDailySummary: async () => {
          telegramCalled = true;
          return true;
        }
      });

      expect(telegramCalled).toBe(false);
    } finally {
      restoreEnv("TELEGRAM_ENABLED", previousTelegramEnabled);
    }
  });
});
