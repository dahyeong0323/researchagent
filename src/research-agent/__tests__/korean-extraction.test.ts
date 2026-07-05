import { describe, expect, it } from "vitest";
import { generateCandidatesFromDocument } from "../candidate-from-document.ts";
import { candidatesFromDocumentOrFallback } from "../source-candidates.ts";
import type { RawSourceItem, RawSourceCategory, SourceDocument } from "../types.ts";

function documentWith(
  title: string,
  paragraphs: string[],
  overrides: Partial<SourceDocument> = {}
): SourceDocument {
  return {
    documentId: overrides.documentId ?? `doc:korean:${title.slice(0, 12)}`,
    canonicalUrl: overrides.canonicalUrl ?? "https://news.acme.co.kr/korean-article",
    documentType: overrides.documentType ?? "manual-url",
    title,
    siteName: overrides.siteName ?? "Korean Business News",
    contentText: paragraphs.join("\n"),
    paragraphs: paragraphs.map((text, index) => ({ id: `p${index + 1}`, index, text })),
    sourceCategory: overrides.sourceCategory ?? "retail_brand",
    language: "ko",
    country: "KR",
    reliabilityTier: overrides.reliabilityTier ?? 4,
    fetchedAt: "2026-07-05T00:00:00.000Z",
    ...overrides
  };
}

function fallbackRawItem(document: SourceDocument, sourceCategory: RawSourceCategory = "consumer_trend"): RawSourceItem {
  return {
    id: `${document.documentId}:fallback`,
    collectorType: document.documentType,
    title: document.title,
    sourceUrl: document.canonicalUrl,
    sourceName: document.siteName,
    sourceCategory,
    sourceReliability: document.reliabilityTier,
    collectedAt: document.fetchedAt,
    rawSummary: document.contentText,
    rawText: document.contentText,
    language: "ko",
    country: "KR",
    evidenceType: "unknown",
    verificationStatus: "needs-research"
  };
}

describe("Korean entity and evidence extraction", () => {
  it("extracts a Korean retail brand launch article", () => {
    const [candidate] = generateCandidatesFromDocument(
      documentWith("올리브영, 웰니스 특화 매장 Olive Better 오픈", [
        "CJ올리브영은 웰니스 특화 매장 Olive Better를 서울 성수동에 오픈했다.",
        "Olive Better는 건강 관리 상품과 상담형 진열을 강화한 매장이다."
      ])
    );

    expect(candidate.entityName).toBe("Olive Better");
    expect(candidate.entityType).toBe("brand");
    expect(candidate.evidenceSnippet).toContain("Olive Better");
    expect(candidate.observedFeature).toContain("오픈");
    expect(candidate.verificationStatus).toBe("verified");
    expect(candidate.briefAllowed).toBe(true);
  });

  it("extracts a Korean startup funding article without converting it to manual", () => {
    const [candidate] = generateCandidatesFromDocument(
      documentWith(
        "AI 리테일 스타트업 리테일랩스, 프리A 투자 유치",
        ["리테일랩스는 오프라인 매장 데이터를 분석하는 AI 솔루션을 운영하며 프리A 투자 유치를 완료했다."],
        {
          documentType: "rss",
          collectorType: "rss",
          sourceCategory: "startup_news",
          canonicalUrl: "https://startupnews.co.kr/retail-labs-funding"
        }
      )
    );

    expect(candidate.entityName).toContain("리테일랩스");
    expect(candidate.entityType).toBe("company");
    expect(candidate.category).not.toBe("manual");
    expect(candidate.evidenceType).toBe("article");
    expect(candidate.evidenceSnippet).toContain("투자 유치");
    expect(candidate.verificationStatus).toBe("verified");
    expect(candidate.briefAllowed).toBe(true);
  });

  it("extracts a Korean app update launch", () => {
    const [candidate] = generateCandidatesFromDocument(
      documentWith(
        "루틴 관리 앱 해빗프렌즈, 친구 체크인 기능 출시",
        ["해빗프렌즈는 친구 체크인 기능을 출시했다. 이용자는 친구에게 루틴 수행 여부를 공유할 수 있다."],
        {
          sourceCategory: "app_product_update",
          canonicalUrl: "https://appnews.co.kr/habit-friends-checkin"
        }
      )
    );

    expect(candidate.entityName).toBe("해빗프렌즈");
    expect(candidate.entityType).toBe("app");
    expect(candidate.observedFeature).toContain("친구 체크인");
    expect(candidate.observedFeature).toContain("출시");
    expect(candidate.verificationStatus).toBe("verified");
    expect(candidate.briefAllowed).toBe(true);
  });

  it("uses paragraph-backed evidence when Korean entity and action are in neighboring sentences", () => {
    const [candidate] = generateCandidatesFromDocument(
      documentWith(
        "루틴 관리 앱 해빗프렌즈, 친구 체크인 기능 출시",
        ["해빗프렌즈는 루틴 관리 앱이다. 이번 업데이트에서는 친구 체크인 기능을 출시했다."],
        {
          sourceCategory: "app_product_update",
          canonicalUrl: "https://appnews.co.kr/habit-friends-split"
        }
      )
    );

    expect(candidate.entityName).toBe("해빗프렌즈");
    expect(candidate.evidenceSnippet).toBe(
      "해빗프렌즈는 루틴 관리 앱이다. 이번 업데이트에서는 친구 체크인 기능을 출시했다."
    );
    expect(candidate.observedFeature).toContain("친구 체크인");
    expect(candidate.evidenceParagraphIds).toEqual(["p1"]);
    expect(candidate.verificationStatus).toBe("verified");
    expect(candidate.briefAllowed).toBe(true);
  });

  it("keeps generic Korean app trend pages as needs-research", () => {
    const document = documentWith(
      "명상 앱이 요즘 인기다",
      ["요즘 많은 사용자가 명상 앱을 찾고 있지만 특정 서비스의 출시나 업데이트 근거는 없다."],
      {
        sourceCategory: "consumer_trend",
        canonicalUrl: "https://news.acme.co.kr/meditation-app-trend"
      }
    );
    const [candidate] = candidatesFromDocumentOrFallback(document, fallbackRawItem(document));

    expect(candidate.verificationStatus).toBe("needs-research");
    expect(candidate.briefAllowed).toBe(false);
    expect(candidate.evidenceSnippet).toBeUndefined();
  });
});
