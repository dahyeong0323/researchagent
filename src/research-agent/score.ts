import { RECENT_TOPIC_HINTS, SOURCE_RELIABILITY, VISIT_POSSIBLE_BY_CATEGORY } from "./config.ts";
import {
  feedbackOverlapRisk,
  feedbackScoreAdjustment,
  feedbackScoreMultiplier
} from "./feedback.ts";
import type { CandidateCategory, FeedbackMemory, RawSourceItem, ScoreBreakdown } from "./types.ts";

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
    visitabilityBonus
  };

  const baseScore = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const weightAdjustment = Math.round((feedbackScoreMultiplier(item, category, memory) - 1) * 20);
  const score = Math.max(
    0,
    Math.min(100, baseScore + weightAdjustment + feedbackScoreAdjustment(item, memory))
  );

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
