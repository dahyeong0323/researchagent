import { FORMAT_BY_CATEGORY, VISIT_POSSIBLE_BY_CATEGORY } from "./config.ts";
import { classifyCandidate } from "./classify.ts";
import { dedupeCandidates } from "./dedupe.ts";
import { renderDailyScoutMarkdown } from "./daily-output.ts";
import { applyEnrichment, enrichCandidateWithLlm } from "./llm.ts";
import { overlapRiskFor, scoreCandidate } from "./score.ts";
import { applyVerificationToCandidate, verifySourceItem } from "./verification.ts";
import {
  generateBusinessObservationAngle,
  generateConnectionToExistingPosts,
  generateConsumerBehaviorAngle,
  generateOneLineSummary,
  generateTopicName,
  generateWhyGudiQuestion
} from "./why-question.ts";
import type { FeedbackMemory, NextAction, RawSourceItem, ScoutCandidate } from "./types.ts";

function normalizeCandidate(item: RawSourceItem): RawSourceItem {
  return {
    ...item,
    title: item.title.trim(),
    sourceUrl: item.sourceUrl.trim(),
    sourceName: item.sourceName.trim(),
    rawSummary: item.rawSummary?.trim(),
    country: item.country ?? "UNKNOWN"
  };
}

function nextActionFor(score: number, visitPossible: ScoutCandidate["visitPossible"]): NextAction {
  if (score >= 88) {
    return "채택 검토";
  }
  if (visitPossible === "가능" && score >= 80) {
    return "직접 방문";
  }
  if (score >= 76) {
    return "추가 조사";
  }
  if (score >= 65) {
    return "보류";
  }
  return "폐기";
}

export function processRawCandidates(
  items: RawSourceItem[],
  limit = 20,
  memory?: FeedbackMemory
): ScoutCandidate[] {
  const normalized = items.map(normalizeCandidate);
  const deduped = dedupeCandidates(normalized);

  return deduped
    .map((item): ScoutCandidate => {
      const category = classifyCandidate(item);
      const { score, scoreBreakdown } = scoreCandidate(item, category, memory);
      const visitPossible = VISIT_POSSIBLE_BY_CATEGORY[category];

      const candidate: ScoutCandidate = {
        id: item.id ?? item.sourceUrl,
        candidateId: item.id ?? item.sourceUrl,
        discoveredDate: item.collectedAt.slice(0, 10),
        status: "new",
        feedbackLabels: [],
        score,
        scoreBreakdown,
        category,
        topicName: generateTopicName(item),
        oneLineSummary: generateOneLineSummary(item),
        coreWhyGudiQuestion: generateWhyGudiQuestion(item, category),
        businessObservationAngle: generateBusinessObservationAngle(item, category),
        consumerBehaviorAngle: generateConsumerBehaviorAngle(item),
        connectionToExistingPosts: generateConnectionToExistingPosts(item),
        overlapRisk: overlapRiskFor(item, memory),
        recommendedFormat: FORMAT_BY_CATEGORY[category],
        visitPossible,
        sourceUrl: item.sourceUrl,
        sourceName: item.sourceName,
        sourcePublishedAt: item.sourcePublishedAt ?? item.publishedAt,
        nextAction: nextActionFor(score, visitPossible),
        entityType: "unknown",
        evidenceType: "unknown",
        verificationStatus: "needs-research",
        briefAllowed: false
      };

      return applyVerificationToCandidate(candidate, verifySourceItem(item));
    })
    .sort((left, right) => right.score - left.score || left.topicName.localeCompare(right.topicName))
    .slice(0, limit);
}

export async function processRawCandidatesWithLlm(
  items: RawSourceItem[],
  limit = 20,
  memory?: FeedbackMemory
): Promise<ScoutCandidate[]> {
  const normalized = items.map(normalizeCandidate);
  const deduped = dedupeCandidates(normalized);
  const candidates = processRawCandidates(items, limit, memory);

  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const rawItemsById = new Map(deduped.map((item) => [item.id ?? item.sourceUrl, item]));

  const enrichedCandidates: ScoutCandidate[] = [];

  for (const candidate of candidates) {
    const rawItem = rawItemsById.get(candidate.id);
    if (!rawItem) {
      enrichedCandidates.push(candidate);
      continue;
    }

    try {
      const enrichment = await enrichCandidateWithLlm(rawItem, candidatesById.get(candidate.id) ?? candidate);
      enrichedCandidates.push(applyEnrichment(candidate, enrichment));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `LLM enrichment fallback for ${candidate.id}: ${message}\n`
      );
      enrichedCandidates.push(candidate);
    }
  }

  return enrichedCandidates;
}

export function scoutToMarkdown(
  items: RawSourceItem[],
  date: string,
  limit = 20,
  memory?: FeedbackMemory
): string {
  return renderDailyScoutMarkdown(processRawCandidates(items, limit, memory), date);
}

export async function scoutToMarkdownWithLlm(
  items: RawSourceItem[],
  date: string,
  limit = 20,
  memory?: FeedbackMemory
): Promise<string> {
  return renderDailyScoutMarkdown(await processRawCandidatesWithLlm(items, limit, memory), date);
}
