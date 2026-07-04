import { RECENT_TOPIC_HINTS, SOURCE_RELIABILITY, VISIT_POSSIBLE_BY_CATEGORY } from "./config.ts";
import {
  feedbackOverlapRisk,
  feedbackScoreAdjustment,
  feedbackScoreMultiplier
} from "./feedback.ts";
import type { CandidateCategory, FeedbackMemory, RawSourceItem, ScoreBreakdown, VerificationStatus } from "./types.ts";

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function scoreConcreteCase(text: string): number {
  let score = 10;
  if (includesAny(text, ["브랜드", "매장", "앱", "스타트업", "제품", "플랫폼", "은행", "편의점"])) {
    score += 5;
  }
  if (includesAny(text, ["Olive", "무신사", "다이소", "서점", "베이커리", "카페", "통신사", "자동차"])) {
    score += 3;
  }
  if (includesAny(text, ["전용", "별도", "팝업", "구독", "제휴", "진단", "검수", "루틴"])) {
    score += 2;
  }
  return Math.min(score, 20);
}

function scoreWhyGudi(text: string): number {
  let score = 9;
  if (includesAny(text, ["왜 굳이", "별도", "전용", "대신", "넘어", "바꾸", "확장", "분리"])) {
    score += 5;
  }
  if (includesAny(text, ["오프라인", "팝업", "구독", "루틴", "상담", "진단", "제휴", "생활"])) {
    score += 4;
  }
  if (includesAny(text, ["단순", "아니라", "보다", "먼저"])) {
    score += 2;
  }
  return Math.min(score, 20);
}

function scoreConsumerBehavior(text: string): number {
  let score = 6;
  if (includesAny(text, ["소비", "구매", "방문", "선택", "신뢰", "선물", "비교", "루틴", "혼자"])) {
    score += 5;
  }
  if (includesAny(text, ["체험", "상담", "검수", "발견", "픽업", "예약", "체크인"])) {
    score += 4;
  }
  return Math.min(score, 15);
}

function scoreBusinessInterpretability(text: string, category: CandidateCategory): number {
  let score = 7;
  if (includesAny(text, ["전략", "제휴", "수익", "SaaS", "플랫폼", "유통", "포지셔닝", "카테고리"])) {
    score += 4;
  }
  if (["스타트업/투자", "대기업 신사업", "앱/프로덕트", "리테일/브랜드"].includes(category)) {
    score += 3;
  }
  if (includesAny(text, ["전환", "확대", "실험", "운영", "제공"])) {
    score += 1;
  }
  return Math.min(score, 15);
}

function scoreDahyeongFit(text: string, category: CandidateCategory): number {
  let score = 7;
  if (["리테일/브랜드", "팝업/오프라인", "앱/프로덕트", "소비자 트렌드"].includes(category)) {
    score += 4;
  }
  if (includesAny(text, ["웰니스", "생활", "학생", "청년", "커리어", "루틴", "오프라인", "혼자"])) {
    score += 4;
  }
  return Math.min(score, 15);
}

function scoreNovelty(text: string): number {
  const overlapsRecentTopic = RECENT_TOPIC_HINTS.some((topic) => text.includes(topic));
  return overlapsRecentTopic ? 5 : 10;
}

function normalizeText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function isGenericEntityName(value: string | undefined): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return (
    normalized.length === 0 ||
    [
      "명상 앱",
      "어떤 서비스",
      "한 브랜드",
      "this app",
      "a startup",
      "a company",
      "some brand",
      "meditation app"
    ].includes(normalized)
  );
}

function hasLikelyEntityInText(text: string): boolean {
  return /\b[A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){1,3}\b/u.test(text);
}

function scoreEntityConcrete(item: RawSourceItem, text: string): number {
  if (item.entityName && !isGenericEntityName(item.entityName)) {
    return 15;
  }

  return hasLikelyEntityInText(text) ? 7 : 0;
}

function scoreEvidenceQuality(item: RawSourceItem): number {
  if (item.evidenceSnippet && item.evidenceSnippet.trim().length >= 30) {
    return 20;
  }

  if (item.evidenceSnippet) {
    return 14;
  }

  if (item.observedFeature) {
    return 6;
  }

  return 0;
}

function scoreSourceReliability(item: RawSourceItem): number {
  const rawReliability = item.sourceReliability ?? SOURCE_RELIABILITY[item.sourceCategory] ?? 1;
  return Math.max(0, Math.min(15, rawReliability * 3));
}

function scoreFreshness(item: RawSourceItem): number {
  const published = item.sourcePublishedAt ?? item.publishedAt;
  if (!published) {
    return 0;
  }

  const publishedAt = new Date(published).getTime();
  const collectedAt = new Date(item.collectedAt).getTime();
  if (!Number.isFinite(publishedAt) || !Number.isFinite(collectedAt)) {
    return 0;
  }

  const ageDays = Math.max(0, (collectedAt - publishedAt) / 86_400_000);
  if (ageDays <= 7) {
    return 10;
  }
  if (ageDays <= 30) {
    return 8;
  }
  if (ageDays <= 90) {
    return 5;
  }
  return 2;
}

function scoreVerificationStatus(status: VerificationStatus | undefined): number {
  if (status === "verified") {
    return 10;
  }
  if (status === "needs-research") {
    return 2;
  }
  if (status === "rejected") {
    return -20;
  }
  return 0;
}

function hostnameFor(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function scoreCapFor(item: RawSourceItem): number {
  let cap = 100;
  const host = hostnameFor(item.sourceUrl);

  if (item.verificationStatus === "rejected") {
    cap = Math.min(cap, 5);
  }
  if (item.verificationStatus === "needs-research") {
    cap = Math.min(cap, 60);
  }
  if (!item.entityName || isGenericEntityName(item.entityName)) {
    cap = Math.min(cap, 45);
  }
  if (!item.evidenceSnippet) {
    cap = Math.min(cap, 60);
  }
  if (host === "example.com" || host.endsWith(".example.com") || item.sourceUrl.includes("example.com")) {
    cap = Math.min(cap, 30);
  }

  return cap;
}

export function scoreCandidate(
  item: RawSourceItem,
  category: CandidateCategory,
  memory?: FeedbackMemory
): { score: number; scoreBreakdown: ScoreBreakdown } {
  const text = `${item.title} ${item.rawSummary ?? ""}`;
  const visitPossible = VISIT_POSSIBLE_BY_CATEGORY[category];
  const visitabilityBonus = visitPossible === "가능" ? 2 : visitPossible === "확인 필요" ? 1 : 0;

  const scoreBreakdown: ScoreBreakdown = {
    concreteCase: scoreConcreteCase(text),
    whyGudiStrength: scoreWhyGudi(text),
    consumerBehaviorPotential: scoreConsumerBehavior(text),
    businessInterpretability: scoreBusinessInterpretability(text, category),
    dahyeongFit: scoreDahyeongFit(text, category),
    novelty: scoreNovelty(text),
    sourceReliability: SOURCE_RELIABILITY[item.sourceCategory],
    entityConcreteScore: scoreEntityConcrete(item, text),
    evidenceQualityScore: scoreEvidenceQuality(item),
    sourceReliabilityScore: scoreSourceReliability(item),
    sourceFreshnessScore: scoreFreshness(item),
    verificationStatusScore: scoreVerificationStatus(item.verificationStatus),
    visitabilityBonus
  };

  const baseScore = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const weightAdjustment = Math.round((feedbackScoreMultiplier(item, category, memory) - 1) * 20);
  const uncappedScore = Math.max(
    0,
    Math.min(100, baseScore + weightAdjustment + feedbackScoreAdjustment(item, memory))
  );
  const score = Math.min(uncappedScore, scoreCapFor(item));

  return { score, scoreBreakdown };
}

export function overlapRiskFor(item: RawSourceItem, memory?: FeedbackMemory): "낮음" | "중간" | "높음" {
  const feedbackRisk = feedbackOverlapRisk(item, memory);
  if (feedbackRisk) {
    return feedbackRisk;
  }

  const text = `${item.title} ${item.rawSummary ?? ""}`;
  if (RECENT_TOPIC_HINTS.some((topic) => text.includes(topic))) {
    return "높음";
  }
  if (includesAny(text, ["웰니스", "건강", "오프라인", "리테일"])) {
    return "중간";
  }
  return "낮음";
}
