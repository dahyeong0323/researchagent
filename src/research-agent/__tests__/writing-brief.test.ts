import { describe, expect, it } from "vitest";
import {
  chooseStyleReference,
  inferBusinessMechanism,
  inferGenericThesisToAvoid,
  renderWritingBrief,
  toWritingBrief
} from "../export-to-writing.ts";
import type { ScoutCandidate } from "../types.ts";

function candidate(overrides: Partial<ScoutCandidate> = {}): ScoutCandidate {
  return {
    id: overrides.id ?? "candidate-writing-1",
    discoveredDate: "2026-07-03",
    status: "new",
    feedbackLabels: [],
    score: overrides.score ?? 88,
    scoreBreakdown: {
      concreteCase: 18,
      whyGudiStrength: 18,
      consumerBehaviorPotential: 15,
      businessInterpretability: 14,
      dahyeongFit: 12,
      novelty: 7,
      sourceReliability: 4,
      visitabilityBonus: 0
    },
    category: overrides.category ?? "앱/프로덕트",
    topicName: overrides.topicName ?? "명상 앱이 혼자 하는 세션보다 친구 체크인을 강조하는 선택",
    oneLineSummary:
      overrides.oneLineSummary ?? "명상 앱이 개인 콘텐츠보다 친구 체크인과 루틴 확인을 전면에 둔다.",
    coreWhyGudiQuestion:
      overrides.coreWhyGudiQuestion ?? "왜 굳이 명상 앱은 조용한 개인 경험에 친구 체크인을 붙였을까?",
    businessObservationAngle:
      overrides.businessObservationAngle ?? "웰니스 앱이 콘텐츠 라이브러리보다 반복 사용 장치를 강화한다.",
    consumerBehaviorAngle:
      overrides.consumerBehaviorAngle ?? "사용자는 혼자 의지를 내는 것보다 누군가가 확인할 때 루틴을 더 쉽게 지킨다.",
    connectionToExistingPosts: overrides.connectionToExistingPosts ?? "습관과 소비자 행동 관찰",
    overlapRisk: overrides.overlapRisk ?? "낮음",
    recommendedFormat: overrides.recommendedFormat ?? "장문 관찰기",
    visitPossible: overrides.visitPossible ?? "중요하지 않음",
    sourceUrl: overrides.sourceUrl ?? "https://example.com/meditation-checkin",
    sourceName: overrides.sourceName ?? "테스트 출처",
    nextAction: overrides.nextAction ?? "채택 검토"
  };
}

describe("Writing Brief v2", () => {
  it("turns a meditation app friend check-in candidate into a product retention brief", () => {
    const meditationCandidate = candidate();
    const mechanism = inferBusinessMechanism(meditationCandidate).toLowerCase();
    const brief = toWritingBrief(meditationCandidate);

    expect(["retention", "habit", "accountability"].some((keyword) => mechanism.includes(keyword))).toBe(true);
    expect(inferGenericThesisToAvoid(meditationCandidate)).toContain("앱이 생활 루틴으로 들어간다");
    expect(chooseStyleReference(meditationCandidate)).toBe("product-observation");
    expect(brief.refinedCoreQuestion.length).toBeLessThan(brief.coreWhyGudiQuestion.length);
    expect(brief.refinedCoreQuestion).not.toContain("기능 제공을 넘어");
    expect(brief.refinedCoreQuestion).toMatch(/명상/);
    expect(brief.refinedCoreQuestion).toMatch(/친구|체크인/);
    expect(brief.postOutline.length).toBeGreaterThanOrEqual(7);
    expect(brief.evidenceBoundary.needsVerification.some((item) => item.includes("앱 화면"))).toBe(true);
  });

  it("uses a retail style reference for retail candidates", () => {
    const retailCandidate = candidate({
      category: "리테일/브랜드",
      topicName: "브랜드가 굳이 작은 오프라인 매장을 여는 선택",
      oneLineSummary: "브랜드가 판매보다 체험과 신뢰 형성을 위해 매장을 연다.",
      coreWhyGudiQuestion: "왜 굳이 온라인 판매가 가능한 브랜드가 작은 매장을 열까?"
    });

    expect(chooseStyleReference(retailCandidate)).toBe("retail-observation");
  });

  it("renders the v2 strategy sections", () => {
    const markdown = renderWritingBrief(toWritingBrief(candidate()));

    expect(markdown).toContain("## Core Tension");
    expect(markdown).toContain("## Sharp Thesis");
    expect(markdown).toContain("## Business Mechanism");
    expect(markdown).toContain("## 확인된 사실 / 추론 / 확인 필요");
    expect(markdown).toContain("## 필요한 추가 조사");
  });
});
