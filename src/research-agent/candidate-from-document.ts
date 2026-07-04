import { FORMAT_BY_CATEGORY, VISIT_POSSIBLE_BY_CATEGORY } from "./config.ts";
import { classifyCandidate } from "./classify.ts";
import { extractEntitiesFromDocument } from "./entity.ts";
import { extractEvidenceForEntity } from "./evidence.ts";
import { overlapRiskFor, scoreCandidate } from "./score.ts";
import { applyVerificationToCandidate, verifyCandidate } from "./verification.ts";
import type { EvidenceCandidate, RawSourceItem, ScoutCandidate, SourceDocument } from "./types.ts";

function nowDate(document: SourceDocument): string {
  return document.fetchedAt.slice(0, 10);
}

function rawItemFromDocument(document: SourceDocument, entityName?: string, evidence?: EvidenceCandidate): RawSourceItem {
  return {
    id: document.sourceItemId ?? document.documentId,
    collectorType: document.documentType,
    title: document.title,
    sourceUrl: document.canonicalUrl,
    sourceName: document.siteName,
    sourcePublishedAt: document.publishedAt,
    rawSummary: evidence?.evidenceSnippet ?? document.paragraphs[0]?.text ?? document.contentText.slice(0, 180),
    rawText: document.contentText,
    canonicalUrl: document.canonicalUrl,
    fetchStatus: "success",
    parseStatus: "success",
    sourceCategory: "manual",
    collectedAt: document.fetchedAt,
    entityName,
    entityType: "unknown",
    observedFeature: evidence?.trigger,
    evidenceSnippet: evidence?.evidenceSnippet,
    evidenceType: evidence?.evidenceType,
    verificationStatus: evidence ? "verified" : "needs-research"
  };
}

function observedFeatureFromEvidence(evidence: EvidenceCandidate): string {
  return `${evidence.entityName} ${evidence.trigger}`;
}

function buildCandidate(
  document: SourceDocument,
  rawItem: RawSourceItem,
  evidence: EvidenceCandidate | undefined,
  entityId: string,
  entityType: ScoutCandidate["entityType"]
): ScoutCandidate {
  const category = classifyCandidate(rawItem);
  const { score, scoreBreakdown } = scoreCandidate(rawItem, category);
  const visitPossible = VISIT_POSSIBLE_BY_CATEGORY[category];
  const candidateId = `candidate:${document.documentId}:${entityId}`;
  const entityName = rawItem.entityName;
  const observedFeature = evidence ? observedFeatureFromEvidence(evidence) : undefined;

  const candidate: ScoutCandidate = {
    id: candidateId,
    candidateId,
    originDocumentIds: [document.documentId],
    entityId,
    discoveredDate: nowDate(document),
    status: "new",
    feedbackLabels: [],
    score,
    scoreBreakdown,
    category,
    topicName: entityName ? `${entityName} - ${document.title}` : document.title,
    oneLineSummary: evidence
      ? `${entityName} source evidence: ${evidence.evidenceSnippet}`
      : `${entityName ?? document.title} needs source evidence before writing.`,
    coreWhyGudiQuestion: evidence
      ? `${entityName} is worth watching because the source shows a concrete ${evidence.trigger} moment.`
      : `${entityName ?? document.title} needs a source-backed feature before this becomes a writing idea.`,
    businessObservationAngle: evidence
      ? "Use the cited paragraph as the factual anchor, then analyze the business choice separately."
      : "Research must confirm the concrete business choice before interpretation.",
    consumerBehaviorAngle: evidence
      ? "Look for the consumer behavior implied by the source-backed launch, update, opening, or expansion."
      : "Consumer behavior interpretation is blocked until evidence is found.",
    connectionToExistingPosts: "Connect only after the factual evidence boundary is clear.",
    overlapRisk: overlapRiskFor(rawItem),
    recommendedFormat: FORMAT_BY_CATEGORY[category],
    visitPossible,
    sourceUrl: document.canonicalUrl,
    sourceName: document.siteName,
    sourcePublishedAt: document.publishedAt,
    sourceReliability: document.reliabilityTier,
    nextAction: evidence ? "make-writing-brief" : "make-research-task",
    entityName,
    entityType,
    observedFeature,
    evidenceSnippet: evidence?.evidenceSnippet,
    evidenceType: evidence?.evidenceType ?? "unknown",
    evidenceParagraphIds: evidence ? [evidence.paragraphId] : [],
    verificationStatus: evidence ? "verified" : "needs-research",
    verificationNotes: evidence
      ? undefined
      : "Needs research before writing: no source paragraph contains the entity and an action trigger.",
    briefAllowed: false
  };

  return applyVerificationToCandidate(candidate, verifyCandidate(candidate));
}

export function generateCandidatesFromDocument(document: SourceDocument): ScoutCandidate[] {
  return extractEntitiesFromDocument(document).map((entity) => {
    const [evidence] = extractEvidenceForEntity(document, entity);
    const rawItem = rawItemFromDocument(document, entity.displayName, evidence);
    return buildCandidate(document, rawItem, evidence, entity.entityId, entity.entityType);
  });
}
