import type {
  CandidateCategory,
  RawSourceCategory,
  RecommendedFormat,
  VisitPossible
} from "./types.ts";

export const DEFAULT_INPUT_PATH = "data/research-agent/raw_candidates.sample.json";
export const DEFAULT_TOP_LIMIT = 20;

export const CATEGORY_BY_SOURCE: Record<RawSourceCategory, CandidateCategory> = {
  startup_news: "스타트업/투자",
  investment_news: "스타트업/투자",
  retail_brand: "리테일/브랜드",
  popup_offline: "팝업/오프라인",
  big_company_experiment: "대기업 신사업",
  app_product_update: "앱/프로덕트",
  consumer_trend: "소비자 트렌드",
  global_case: "글로벌 비교",
  manual: "리테일/브랜드"
};

export const FORMAT_BY_CATEGORY: Record<CandidateCategory, RecommendedFormat> = {
  "리테일/브랜드": "장문 관찰기",
  "팝업/오프라인": "장문 관찰기",
  "스타트업/투자": "짧은 포스트",
  "대기업 신사업": "비교글",
  "앱/프로덕트": "짧은 포스트",
  "소비자 트렌드": "캐러셀",
  "핀테크/금융": "짧은 포스트",
  "글로벌 비교": "비교글",
  "커리어/네트워크": "짧은 포스트"
};

export const VISIT_POSSIBLE_BY_CATEGORY: Record<CandidateCategory, VisitPossible> = {
  "리테일/브랜드": "확인 필요",
  "팝업/오프라인": "가능",
  "스타트업/투자": "중요하지 않음",
  "대기업 신사업": "확인 필요",
  "앱/프로덕트": "불가능",
  "소비자 트렌드": "중요하지 않음",
  "핀테크/금융": "불가능",
  "글로벌 비교": "불가능",
  "커리어/네트워크": "중요하지 않음"
};

export const SOURCE_RELIABILITY: Record<RawSourceCategory, number> = {
  startup_news: 4,
  investment_news: 4,
  retail_brand: 4,
  popup_offline: 4,
  big_company_experiment: 5,
  app_product_update: 4,
  consumer_trend: 3,
  global_case: 4,
  manual: 3
};

export const RECENT_TOPIC_HINTS = [
  "Olive Better",
  "올리브 베터",
  "Olive Young",
  "올리브영",
  "웰니스 리테일"
];
