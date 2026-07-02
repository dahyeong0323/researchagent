import { describe, expect, it } from "vitest";
import { normalizeFeedbackMemory } from "../feedback.ts";

describe("normalizeFeedbackMemory", () => {
  it("raises category weight for Selected feedback", () => {
    const memory = normalizeFeedbackMemory({
      candidateFeedback: [
        {
          topicName: "선택 후보",
          category: "리테일/브랜드",
          sourceCategory: "retail_brand",
          status: "Selected",
          feedbackLabels: ["바로 글 가능"],
          angleKeywords: ["소비자 신뢰"],
          decidedAt: "2026-07-02"
        }
      ]
    });

    expect(memory.categoryWeights["리테일/브랜드"]).toBeGreaterThan(1);
  });

  it("adds rejected patterns for Rejected feedback with too-news-like label", () => {
    const memory = normalizeFeedbackMemory({
      candidateFeedback: [
        {
          topicName: "투자유치 기사",
          category: "스타트업/투자",
          sourceCategory: "investment_news",
          status: "Rejected",
          feedbackLabels: ["너무 뉴스 같음"],
          decidedAt: "2026-07-02"
        }
      ]
    });

    expect(memory.rejectedPatterns).toContain("단순 투자유치");
    expect(memory.rejectedPatterns).toContain("보도자료");
  });
});
