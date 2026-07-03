import { describe, expect, it } from "vitest";
import { buildCandidatePagePayload, validateCandidatePagePayload } from "../notion.ts";
import type { ScoutCandidate } from "../types.ts";

const candidate: ScoutCandidate = {
  id: "candidate-telegram-1",
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
  businessObservationAngle: "비즈니스 관찰기 각도",
  consumerBehaviorAngle: "소비자 행동 관점",
  connectionToExistingPosts: "기존 글과의 연결",
  overlapRisk: "낮음",
  recommendedFormat: "장문 관찰기",
  visitPossible: "확인 필요",
  sourceUrl: "https://example.com/source",
  sourceName: "테스트 출처",
  nextAction: "채택 검토",
  entityName: "테스트 브랜드",
  entityType: "brand",
  observedFeature: "별도 매장",
  evidenceSnippet: "테스트 근거",
  evidenceType: "article",
  verificationStatus: "verified",
  verificationNotes: "테스트 검증"
};

describe("Notion payload mapping", () => {
  it("includes Candidate ID as a required rich text property", () => {
    const payload = buildCandidatePagePayload(candidate, {
      database_id: "test-database-id"
    });

    expect(() => validateCandidatePagePayload(payload)).not.toThrow();
    expect(payload.properties["Candidate ID"]).toEqual({
      rich_text: [
        {
          text: {
            content: "candidate-telegram-1"
          }
        }
      ]
    });
    expect(payload.properties["서비스/브랜드명"]).toEqual({
      rich_text: [
        {
          text: {
            content: "테스트 브랜드"
          }
        }
      ]
    });
    expect(payload.properties["검증 상태"]).toEqual({
      select: {
        name: "verified"
      }
    });
  });
});
