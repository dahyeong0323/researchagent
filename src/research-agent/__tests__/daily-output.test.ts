import { describe, expect, it } from "vitest";
import { renderDailyScoutMarkdown } from "../daily-output.ts";
import type { ScoutCandidate } from "../types.ts";

const candidate: ScoutCandidate = {
  id: "candidate-1",
  discoveredDate: "2026-07-02",
  status: "new",
  feedbackLabels: [],
  score: 91,
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
  category: "리테일/브랜드",
  topicName: "테스트 리테일 후보",
  oneLineSummary: "한 줄 요약",
  coreWhyGudiQuestion: "왜 굳이 이 브랜드는 별도 매장을 만들었을까?",
  businessObservationAngle: "비즈니스 각도",
  consumerBehaviorAngle: "소비자 행동 각도",
  connectionToExistingPosts: "기존 글과의 연결",
  overlapRisk: "낮음",
  recommendedFormat: "장문 관찰기",
  visitPossible: "확인 필요",
  sourceUrl: "https://example.com/source",
  sourceName: "테스트 출처",
  nextAction: "채택 검토"
};

describe("renderDailyScoutMarkdown", () => {
  it("includes candidate title, score, why-gudi question, and source", () => {
    const markdown = renderDailyScoutMarkdown([candidate], "2026-07-02");

    expect(markdown).toContain("테스트 리테일 후보");
    expect(markdown).toContain("[91점]");
    expect(markdown).toContain("왜 굳이 이 브랜드는 별도 매장을 만들었을까?");
    expect(markdown).toContain("https://example.com/source");
  });
});
