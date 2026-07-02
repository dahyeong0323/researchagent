import { describe, expect, it } from "vitest";
import { dedupeCandidates } from "../dedupe.ts";
import type { RawSourceItem } from "../types.ts";

function item(overrides: Partial<RawSourceItem>): RawSourceItem {
  return {
    id: overrides.id,
    title: overrides.title ?? "기본 후보",
    sourceUrl: overrides.sourceUrl ?? "https://example.com/default",
    sourceName: overrides.sourceName ?? "테스트",
    sourceCategory: overrides.sourceCategory ?? "manual",
    collectedAt: overrides.collectedAt ?? "2026-07-02T00:00:00+09:00",
    rawSummary: overrides.rawSummary,
    country: overrides.country
  };
}

describe("dedupeCandidates", () => {
  it("removes candidates with the same sourceUrl", () => {
    const result = dedupeCandidates([
      item({ id: "a", title: "첫 번째", sourceUrl: "https://example.com/a?utm=test" }),
      item({ id: "b", title: "두 번째", sourceUrl: "https://example.com/a" })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a");
  });

  it("removes candidates with highly similar titles", () => {
    const result = dedupeCandidates([
      item({ id: "a", title: "중고거래 플랫폼이 오프라인 검수 팝업을 여는 사례", sourceUrl: "https://example.com/a" }),
      item({ id: "b", title: "중고거래 플랫폼이 오프라인 검수 팝업을 여는 선택", sourceUrl: "https://example.com/b" })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a");
  });
});
