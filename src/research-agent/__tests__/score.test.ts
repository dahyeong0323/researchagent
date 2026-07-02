import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../score.ts";
import type { RawSourceItem } from "../types.ts";

function item(overrides: Partial<RawSourceItem>): RawSourceItem {
  return {
    title: overrides.title ?? "후보",
    sourceUrl: overrides.sourceUrl ?? "https://example.com/test",
    sourceName: overrides.sourceName ?? "테스트",
    sourceCategory: overrides.sourceCategory ?? "manual",
    collectedAt: overrides.collectedAt ?? "2026-07-02T00:00:00+09:00",
    rawSummary: overrides.rawSummary,
    country: overrides.country,
    id: overrides.id
  };
}

describe("scoreCandidate", () => {
  it("scores a concrete retail brand candidate highly", () => {
    const candidate = item({
      title: "다이소가 뷰티 전용 진열 구역을 확대하는 사례",
      sourceCategory: "retail_brand",
      rawSummary:
        "저가 생활용품 매장이 뷰티 카테고리를 별도 목적 방문 구역처럼 키우는 사례. 소비자의 비교, 발견, 구매 행동을 볼 수 있다."
    });

    const result = scoreCandidate(candidate, "리테일/브랜드");

    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("scores a vague macro candidate lower than a concrete retail candidate", () => {
    const concrete = scoreCandidate(
      item({
        title: "다이소가 뷰티 전용 진열 구역을 확대하는 사례",
        sourceCategory: "retail_brand",
        rawSummary: "브랜드, 매장, 제품, 소비자 구매 행동이 구체적으로 드러나는 사례."
      }),
      "리테일/브랜드"
    );
    const vague = scoreCandidate(
      item({
        title: "글로벌 경제 환경 변화에 따른 소비 심리 전망",
        sourceCategory: "manual",
        rawSummary: "거시경제 흐름과 시장 전망을 일반적으로 설명하는 후보."
      }),
      "소비자 트렌드"
    );

    expect(vague.score).toBeLessThan(concrete.score);
  });
});
