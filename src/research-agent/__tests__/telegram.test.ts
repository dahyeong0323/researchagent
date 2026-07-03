import { describe, expect, it } from "vitest";
import { parseTelegramCallbackData } from "../telegram-poll.ts";
import { buildCandidateInlineKeyboard, renderTelegramDailySummary } from "../telegram.ts";
import type { ScoutCandidate } from "../types.ts";

function candidate(overrides: Partial<ScoutCandidate> = {}): ScoutCandidate {
  return {
    id: overrides.id ?? "candidate-1",
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
    oneLineSummary: "한 줄 요약",
    coreWhyGudiQuestion: overrides.coreWhyGudiQuestion ?? "왜 굳이 이 브랜드는 별도 매장을 만들었을까?",
    businessObservationAngle: "비즈니스 관찰기 각도",
    consumerBehaviorAngle: "소비자 행동 관점",
    connectionToExistingPosts: "기존 글과의 연결",
    overlapRisk: "낮음",
    recommendedFormat: "장문 관찰기",
    visitPossible: "확인 필요",
    sourceUrl: "https://example.com/source",
    sourceName: "테스트 출처",
    nextAction: "채택 검토",
    entityName: overrides.entityName,
    entityType: overrides.entityType ?? "unknown",
    observedFeature: overrides.observedFeature,
    evidenceType: overrides.evidenceType ?? "unknown",
    verificationStatus: overrides.verificationStatus ?? "needs-research",
    verificationNotes: overrides.verificationNotes
  };
}

describe("Telegram daily notification", () => {
  it("renders a Top 5 daily summary with score, topic, category, and why-gudi question", () => {
    const summary = renderTelegramDailySummary([candidate()]);

    expect(summary).toContain("오늘 LinkedIn 소재 후보 1개를 Notion에 저장했습니다.");
    expect(summary).toContain("[보류] 테스트 리테일 후보");
    expect(summary).toContain("카테고리: 리테일/브랜드");
    expect(summary).toContain("검증 상태: needs-research");
    expect(summary).toContain("왜 굳이?: 왜 굳이 이 브랜드는 별도 매장을 만들었을까?");
  });

  it("renders entity name for verified candidates", () => {
    const summary = renderTelegramDailySummary([
      candidate({
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "친구 체크인 기능",
        evidenceType: "official",
        verificationStatus: "verified"
      })
    ]);

    expect(summary).toContain("[91점] Headspace — 친구 체크인 기능");
    expect(summary).toContain("서비스/브랜드: Headspace");
    expect(summary).toContain("검증 상태: verified");
  });

  it("builds Selected, Shortlisted, and Rejected callback buttons with the candidate id", () => {
    const keyboard = buildCandidateInlineKeyboard(candidate({ id: "sample-003" }));

    expect(keyboard.inline_keyboard[0]).toEqual([
      { text: "Selected", callback_data: "selected:sample-003" },
      { text: "Shortlisted", callback_data: "shortlisted:sample-003" },
      { text: "Rejected", callback_data: "rejected:sample-003" }
    ]);
    expect(keyboard.inline_keyboard[1]).toEqual([
      { text: "Writing Brief 만들기", callback_data: "brief:sample-003" }
    ]);
  });

  it("parses callback data into a Notion status update or brief target", () => {
    expect(parseTelegramCallbackData("selected:sample-003")).toEqual({
      action: "selected",
      candidateId: "sample-003",
      status: "Selected"
    });
    expect(parseTelegramCallbackData("brief:sample-003")).toEqual({
      action: "brief",
      candidateId: "sample-003"
    });
    expect(parseTelegramCallbackData("ignored:sample-003")).toBeUndefined();
  });
});
