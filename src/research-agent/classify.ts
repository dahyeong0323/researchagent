import { CATEGORY_BY_SOURCE } from "./config.ts";
import type { CandidateCategory, RawSourceItem } from "./types.ts";

const keywordRules: Array<{ category: CandidateCategory; keywords: string[] }> = [
  { category: "핀테크/금융", keywords: ["은행", "금융", "보험", "카드", "자산", "요금제"] },
  { category: "커리어/네트워크", keywords: ["채용", "커리어", "면접", "포트폴리오"] },
  { category: "팝업/오프라인", keywords: ["팝업", "부스"] },
  { category: "앱/프로덕트", keywords: ["앱", "플랫폼", "기능", "서비스"] },
  { category: "소비자 트렌드", keywords: ["Z세대", "소비", "선물", "혼자", "루틴"] }
];

export function classifyCandidate(item: RawSourceItem): CandidateCategory {
  const text = `${item.title} ${item.rawSummary ?? ""}`;

  if (item.sourceCategory !== "manual") {
    return CATEGORY_BY_SOURCE[item.sourceCategory];
  }

  const matchedRule = keywordRules.find((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword))
  );

  return matchedRule?.category ?? CATEGORY_BY_SOURCE[item.sourceCategory];
}
