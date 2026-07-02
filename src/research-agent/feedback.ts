import { readFile } from "node:fs/promises";
import type {
  CandidateCategory,
  CandidateFeedbackRecord,
  FeedbackLabel,
  FeedbackMemory,
  RawSourceCategory,
  RawSourceItem
} from "./types.ts";

const EMPTY_MEMORY: FeedbackMemory = {
  categoryWeights: {},
  sourceCategoryWeights: {},
  rejectedPatterns: [],
  preferredAngles: [],
  recentTopics: [],
  candidateFeedback: []
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNumberMap<T extends string>(
  value: unknown
): Partial<Record<T, number>> {
  if (!isObject(value)) {
    return {};
  }

  const result: Partial<Record<T, number>> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      result[key as T] = rawValue;
    }
  }
  return result;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
}

function normalizeFeedbackLabels(value: unknown): FeedbackLabel[] {
  return normalizeStringArray(value) as FeedbackLabel[];
}

function normalizeFeedbackRecord(value: unknown): CandidateFeedbackRecord | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const topicName = value.topicName;
  const category = value.category;
  const status = value.status;
  const decidedAt = value.decidedAt;

  if (
    typeof topicName !== "string" ||
    typeof category !== "string" ||
    typeof status !== "string" ||
    typeof decidedAt !== "string" ||
    !["Selected", "Shortlisted", "Rejected"].includes(status)
  ) {
    return undefined;
  }

  return {
    candidateId: typeof value.candidateId === "string" ? value.candidateId : undefined,
    topicName,
    category: category as CandidateCategory,
    sourceCategory: typeof value.sourceCategory === "string" ? (value.sourceCategory as RawSourceCategory) : undefined,
    status: status as CandidateFeedbackRecord["status"],
    feedbackLabels: normalizeFeedbackLabels(value.feedbackLabels),
    angleKeywords: normalizeStringArray(value.angleKeywords),
    decidedAt
  };
}

function clampWeight(value: number): number {
  return Math.max(0.75, Math.min(1.25, value));
}

function deriveWeights(records: CandidateFeedbackRecord[]): Pick<
  FeedbackMemory,
  "categoryWeights" | "sourceCategoryWeights" | "rejectedPatterns" | "preferredAngles" | "recentTopics"
> {
  const categoryWeights: Partial<Record<CandidateCategory, number>> = {};
  const sourceCategoryWeights: Partial<Record<RawSourceCategory, number>> = {};
  const rejectedPatterns = new Set<string>();
  const preferredAngles = new Set<string>();
  const recentTopics = new Set<string>();

  for (const record of records) {
    const statusDelta =
      record.status === "Selected" ? 0.08 : record.status === "Shortlisted" ? 0.03 : -0.08;
    categoryWeights[record.category] = clampWeight((categoryWeights[record.category] ?? 1) + statusDelta);

    if (record.sourceCategory) {
      sourceCategoryWeights[record.sourceCategory] = clampWeight(
        (sourceCategoryWeights[record.sourceCategory] ?? 1) + statusDelta
      );
    }

    if (record.status === "Selected" || record.status === "Shortlisted") {
      for (const keyword of record.angleKeywords ?? []) {
        preferredAngles.add(keyword);
      }
    }

    if (record.status === "Rejected") {
      rejectedPatterns.add(record.topicName);
      for (const label of record.feedbackLabels) {
        if (label === "너무 뉴스 같음") {
          rejectedPatterns.add("단순 투자유치");
          rejectedPatterns.add("보도자료");
        }
        if (label === "너무 어려움" || label === "내 톤 아님") {
          rejectedPatterns.add("전문");
          rejectedPatterns.add("거시경제");
        }
        if (label === "너무 겹침") {
          recentTopics.add(record.topicName);
        }
      }
    }

    recentTopics.add(record.topicName);
  }

  return {
    categoryWeights,
    sourceCategoryWeights,
    rejectedPatterns: [...rejectedPatterns],
    preferredAngles: [...preferredAngles],
    recentTopics: [...recentTopics]
  };
}

export function normalizeFeedbackMemory(value: unknown): FeedbackMemory {
  if (!isObject(value)) {
    return EMPTY_MEMORY;
  }

  const candidateFeedback = Array.isArray(value.candidateFeedback)
    ? value.candidateFeedback
        .map(normalizeFeedbackRecord)
        .filter((record): record is CandidateFeedbackRecord => Boolean(record))
    : [];

  const derived = deriveWeights(candidateFeedback);

  return {
    categoryWeights: {
      ...derived.categoryWeights,
      ...normalizeNumberMap<CandidateCategory>(value.categoryWeights)
    },
    sourceCategoryWeights: {
      ...derived.sourceCategoryWeights,
      ...normalizeNumberMap<RawSourceCategory>(value.sourceCategoryWeights)
    },
    rejectedPatterns: [
      ...new Set([...derived.rejectedPatterns, ...normalizeStringArray(value.rejectedPatterns)])
    ],
    preferredAngles: [
      ...new Set([...derived.preferredAngles, ...normalizeStringArray(value.preferredAngles)])
    ],
    recentTopics: [
      ...new Set([...derived.recentTopics, ...normalizeStringArray(value.recentTopics)])
    ],
    candidateFeedback
  };
}

export async function readFeedbackMemory(path?: string): Promise<FeedbackMemory | undefined> {
  if (!path) {
    return undefined;
  }

  const content = await readFile(path, "utf8");
  return normalizeFeedbackMemory(JSON.parse(content));
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => keyword.trim() !== "" && text.includes(keyword));
}

export function feedbackScoreMultiplier(
  item: RawSourceItem,
  category: CandidateCategory,
  memory?: FeedbackMemory
): number {
  if (!memory) {
    return 1;
  }

  const categoryWeight = memory.categoryWeights[category] ?? 1;
  const sourceWeight = memory.sourceCategoryWeights[item.sourceCategory] ?? 1;
  return clampWeight(categoryWeight * sourceWeight);
}

export function feedbackScoreAdjustment(
  item: RawSourceItem,
  memory?: FeedbackMemory
): number {
  if (!memory) {
    return 0;
  }

  const text = `${item.title} ${item.rawSummary ?? ""}`;
  let adjustment = 0;

  if (includesAny(text, memory.preferredAngles)) {
    adjustment += 4;
  }

  if (includesAny(text, memory.rejectedPatterns)) {
    adjustment -= 8;
  }

  if (includesAny(text, memory.recentTopics)) {
    adjustment -= 5;
  }

  return adjustment;
}

export function feedbackOverlapRisk(
  item: RawSourceItem,
  memory?: FeedbackMemory
): "낮음" | "중간" | "높음" | undefined {
  if (!memory) {
    return undefined;
  }

  const text = `${item.title} ${item.rawSummary ?? ""}`;
  if (includesAny(text, memory.recentTopics)) {
    return "높음";
  }
  return undefined;
}
