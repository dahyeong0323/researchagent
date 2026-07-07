import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTelegramCallbackData } from "../telegram-poll.ts";
import { buildCandidateInlineKeyboard, renderTelegramDailySummary, sendTelegramDailySummary } from "../telegram.ts";
import { registerTelegramCallbackCandidateIds, TELEGRAM_CALLBACK_DATA_MAX_BYTES } from "../telegram-callback.ts";
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
    category: overrides.category ?? "리테일/브랜드",
    topicName: overrides.topicName ?? "테스트 리테일 후보",
    oneLineSummary: overrides.oneLineSummary ?? "한 줄 요약",
    coreWhyGudiQuestion:
      overrides.coreWhyGudiQuestion ?? "왜 굳이 이 브랜드는 별도 매장을 만들었을까?",
    businessObservationAngle: overrides.businessObservationAngle ?? "비즈니스 관찰기 각도",
    consumerBehaviorAngle: overrides.consumerBehaviorAngle ?? "소비자 행동 관점",
    connectionToExistingPosts: overrides.connectionToExistingPosts ?? "기존 글과의 연결",
    overlapRisk: overrides.overlapRisk ?? "낮음",
    recommendedFormat: overrides.recommendedFormat ?? "장문 관찰기",
    visitPossible: overrides.visitPossible ?? "확인 필요",
    sourceUrl: overrides.sourceUrl ?? "https://example.com/source",
    sourceName: overrides.sourceName ?? "테스트 출처",
    nextAction: overrides.nextAction ?? "채택 검토",
    entityName: overrides.entityName,
    entityType: overrides.entityType ?? "unknown",
    observedFeature: overrides.observedFeature,
    evidenceType: overrides.evidenceType ?? "unknown",
    evidenceSnippet: overrides.evidenceSnippet,
    verificationStatus: overrides.verificationStatus ?? "needs-research",
    briefAllowed: overrides.briefAllowed ?? false,
    verificationNotes: overrides.verificationNotes,
    missingFields: overrides.missingFields
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("Telegram daily notification", () => {
  it("renders required candidate fields", () => {
    const summary = renderTelegramDailySummary([candidate()]);

    expect(summary).toContain("Score: 91");
    expect(summary).toContain("Entity/Topic: 테스트 리테일 후보");
    expect(summary).toContain("Observed Feature: needs-research");
    expect(summary).toContain("Verification Status: needs-research");
    expect(summary).toContain("Source: 테스트 출처");
    expect(summary).toContain("Evidence Type: unknown");
    expect(summary).toContain("Missing Fields (blocks writing): needs-research");
    expect(summary).toContain("Why Gudi Question: 왜 굳이 이 브랜드는 별도 매장을 만들었을까?");
    expect(summary).toContain("Brief Allowed: no");
    expect(summary).toContain("Next Action: Make Research Task");
  });

  it("renders verified entity and evidence in the Telegram summary", () => {
    const summary = renderTelegramDailySummary([
      candidate({
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceType: "official",
        evidenceSnippet: "Headspace announced friend check-ins in its product update.",
        verificationStatus: "verified",
        briefAllowed: true
      })
    ]);

    expect(summary).toContain("Entity/Topic: Headspace");
    expect(summary).toContain("Observed Feature: friend check-in");
    expect(summary).toContain("Evidence: Headspace announced friend check-ins in its product update.");
    expect(summary).not.toContain("Missing Fields:");
  });

  it("renders missing fields for needs-research candidates", () => {
    const summary = renderTelegramDailySummary([
      candidate({
        id: "sample-needs-research",
        missingFields: ["observed feature or strategic choice", "evidence snippet or evidence paragraph reference"]
      })
    ]);

    expect(summary).toContain(
      "Missing Fields (blocks writing): observed feature or strategic choice, evidence snippet or evidence paragraph reference"
    );
  });

  it("renders an explicit Telegram test title when provided", () => {
    const summary = renderTelegramDailySummary([candidate()], {
      title: "Telegram button test: Notion write was not attempted."
    });

    expect(summary.startsWith("Telegram button test: Notion write was not attempted.")).toBe(true);
    expect(summary).not.toContain("Notion에 저장했습니다");
  });

  it("does not send an empty daily summary", async () => {
    const previousTelegramEnabled = process.env.TELEGRAM_ENABLED;
    const previousBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const previousChatId = process.env.TELEGRAM_CHAT_ID;
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;

    try {
      process.env.TELEGRAM_ENABLED = "1";
      process.env.TELEGRAM_BOT_TOKEN = "token";
      process.env.TELEGRAM_CHAT_ID = "chat";
      globalThis.fetch = (async () => {
        fetchCalled = true;
        return new Response(null, { status: 200 });
      }) as typeof fetch;

      await expect(sendTelegramDailySummary([])).resolves.toBe(false);
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv("TELEGRAM_ENABLED", previousTelegramEnabled);
      restoreEnv("TELEGRAM_BOT_TOKEN", previousBotToken);
      restoreEnv("TELEGRAM_CHAT_ID", previousChatId);
    }
  });

  it("shows Make Writing Brief only for verified brief-allowed candidates", () => {
    const keyboard = buildCandidateInlineKeyboard(
      candidate({
        id: "sample-verified",
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in",
        evidenceType: "official",
        verificationStatus: "verified",
        briefAllowed: true
      })
    );

    expect(keyboard.inline_keyboard[1]).toEqual([
      { text: "Make Writing Brief", callback_data: "b:i:sample-verified" }
    ]);
  });

  it("shows Make Research Task for needs-research candidates", () => {
    const keyboard = buildCandidateInlineKeyboard(candidate({ id: "sample-needs-research" }));

    expect(keyboard.inline_keyboard[1]).toEqual([
      { text: "Make Research Task", callback_data: "t:i:sample-needs-research" }
    ]);
  });

  it("does not show Make Writing Brief for rejected candidates", () => {
    const keyboard = buildCandidateInlineKeyboard(
      candidate({
        id: "sample-rejected",
        verificationStatus: "rejected",
        briefAllowed: false
      })
    );

    expect(keyboard.inline_keyboard.flat()).not.toContainEqual({
      text: "Make Writing Brief",
      callback_data: "b:i:sample-rejected"
    });
    expect(keyboard.inline_keyboard[1]).toEqual([
      { text: "Make Research Task", callback_data: "t:i:sample-rejected" }
    ]);
  });

  it("builds status callback buttons with the new callback format", () => {
    const keyboard = buildCandidateInlineKeyboard(candidate({ id: "sample-003" }));

    expect(keyboard.inline_keyboard[0]).toEqual([
      { text: "Selected", callback_data: "s:s:i:sample-003" },
      { text: "Shortlisted", callback_data: "s:h:i:sample-003" },
      { text: "Rejected", callback_data: "s:r:i:sample-003" },
      { text: "Needs Research", callback_data: "s:n:i:sample-003" }
    ]);
  });

  it("parses status, task, and brief callback data", () => {
    expect(parseTelegramCallbackData("s:s:i:sample-003")).toEqual({
      action: "selected",
      candidateId: "sample-003",
      status: "Selected"
    });
    expect(parseTelegramCallbackData("s:n:i:sample-003")).toEqual({
      action: "needs-research",
      candidateId: "sample-003",
      status: "Needs Research"
    });
    expect(parseTelegramCallbackData("t:i:sample-003")).toEqual({
      action: "research-task:create",
      candidateId: "sample-003"
    });
    expect(parseTelegramCallbackData("b:i:sample-003")).toEqual({
      action: "brief:create",
      candidateId: "sample-003"
    });
    expect(parseTelegramCallbackData("ignored:sample-003")).toBeUndefined();
  });

  it("parses legacy callback data with colon-containing candidate IDs", () => {
    const candidateId = "candidate:manual-url:https://brand.example/news:entity:brand";

    expect(parseTelegramCallbackData(`status:selected:${candidateId}`)).toEqual({
      action: "selected",
      candidateId,
      status: "Selected"
    });
    expect(parseTelegramCallbackData(`research-task:create:${candidateId}`)).toEqual({
      action: "research-task:create",
      candidateId
    });
    expect(parseTelegramCallbackData(`task:create:${candidateId}`)).toEqual({
      action: "research-task:create",
      candidateId
    });
    expect(parseTelegramCallbackData(`brief:create:${candidateId}`)).toEqual({
      action: "brief:create",
      candidateId
    });
    expect(parseTelegramCallbackData(`brief:${candidateId}`)).toEqual({
      action: "brief:create",
      candidateId
    });
  });

  it("keeps generated callback data within Telegram's 64 byte limit", async () => {
    const longCandidateId = `candidate:${"manual-url:".repeat(10)}https://example.co.kr/path:entity:acme-beauty`;
    const keyboard = buildCandidateInlineKeyboard(
      candidate({
        id: longCandidateId,
        candidateId: longCandidateId,
        entityName: "ACME Beauty",
        entityType: "brand",
        observedFeature: "flagship refill counter",
        evidenceType: "article",
        verificationStatus: "verified",
        briefAllowed: true
      })
    );

    for (const button of keyboard.inline_keyboard.flat()) {
      expect(Buffer.byteLength(button.callback_data, "utf8")).toBeLessThanOrEqual(
        TELEGRAM_CALLBACK_DATA_MAX_BYTES
      );
    }

    const tempDir = await mkdtemp(join(tmpdir(), "telegram-callbacks-"));
    const registryPath = join(tempDir, "callbacks.json");
    try {
      await registerTelegramCallbackCandidateIds([longCandidateId], registryPath, new Date("2026-07-04T00:00:00Z"));
      expect(parseTelegramCallbackData(keyboard.inline_keyboard[0][0].callback_data, { registryPath })).toEqual({
        action: "selected",
        candidateId: longCandidateId,
        status: "Selected"
      });
      expect(parseTelegramCallbackData(keyboard.inline_keyboard[1][0].callback_data, { registryPath })).toEqual({
        action: "brief:create",
        candidateId: longCandidateId
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
