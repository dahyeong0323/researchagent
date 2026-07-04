import { describe, expect, it } from "vitest";
import { parseTelegramCallbackData } from "../telegram-poll.ts";
import { buildCandidateInlineKeyboard, renderTelegramDailySummary } from "../telegram.ts";
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

describe("Telegram daily notification", () => {
  it("renders required candidate fields", () => {
    const summary = renderTelegramDailySummary([candidate()]);

    expect(summary).toContain("Score: 91");
    expect(summary).toContain("Entity/Topic: 테스트 리테일 후보");
    expect(summary).toContain("Observed Feature: needs-research");
    expect(summary).toContain("Verification Status: needs-research");
    expect(summary).toContain("Source: 테스트 출처");
    expect(summary).toContain("Evidence Type: unknown");
    expect(summary).toContain("Missing Fields: needs-research");
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
      "Missing Fields: observed feature or strategic choice, evidence snippet or evidence paragraph reference"
    );
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
      { text: "Make Writing Brief", callback_data: "brief:create:sample-verified" }
    ]);
  });

  it("shows Make Research Task for needs-research candidates", () => {
    const keyboard = buildCandidateInlineKeyboard(candidate({ id: "sample-needs-research" }));

    expect(keyboard.inline_keyboard[1]).toEqual([
      { text: "Make Research Task", callback_data: "research-task:create:sample-needs-research" }
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
      callback_data: "brief:create:sample-rejected"
    });
    expect(keyboard.inline_keyboard[1]).toEqual([
      { text: "Make Research Task", callback_data: "research-task:create:sample-rejected" }
    ]);
  });

  it("builds status callback buttons with the new callback format", () => {
    const keyboard = buildCandidateInlineKeyboard(candidate({ id: "sample-003" }));

    expect(keyboard.inline_keyboard[0]).toEqual([
      { text: "Selected", callback_data: "status:selected:sample-003" },
      { text: "Shortlisted", callback_data: "status:shortlisted:sample-003" },
      { text: "Rejected", callback_data: "status:rejected:sample-003" },
      { text: "Needs Research", callback_data: "status:needs-research:sample-003" }
    ]);
  });

  it("parses status, task, and brief callback data", () => {
    expect(parseTelegramCallbackData("status:selected:sample-003")).toEqual({
      action: "selected",
      candidateId: "sample-003",
      status: "Selected"
    });
    expect(parseTelegramCallbackData("status:needs-research:sample-003")).toEqual({
      action: "needs-research",
      candidateId: "sample-003",
      status: "Needs Research"
    });
    expect(parseTelegramCallbackData("research-task:create:sample-003")).toEqual({
      action: "research-task:create",
      candidateId: "sample-003"
    });
    expect(parseTelegramCallbackData("task:create:sample-003")).toEqual({
      action: "research-task:create",
      candidateId: "sample-003"
    });
    expect(parseTelegramCallbackData("brief:create:sample-003")).toEqual({
      action: "brief:create",
      candidateId: "sample-003"
    });
    expect(parseTelegramCallbackData("ignored:sample-003")).toBeUndefined();
  });
});
