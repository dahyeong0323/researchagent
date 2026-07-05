import type { Entity, EvidenceCandidate, SourceDocument, SourceParagraph } from "./types.ts";

const triggers = [
  "announce",
  "announces",
  "announced",
  "launch",
  "launches",
  "launched",
  "raise",
  "raises",
  "raised",
  "partner",
  "partners",
  "partnered",
  "update",
  "updates",
  "updated",
  "expand",
  "expands",
  "expanded",
  "open",
  "opens",
  "opened",
  "introduce",
  "introduces",
  "introduced",
  "roll out",
  "rolls out",
  "rolled out",
  "operate",
  "operates",
  "operated",
  "test",
  "tests",
  "tested",
  "pilot",
  "pilots",
  "piloted",
  "투자 유치",
  "출시",
  "공개",
  "업데이트",
  "투자",
  "유치",
  "오픈",
  "파트너십",
  "제휴",
  "운영",
  "확대",
  "도입",
  "개편",
  "론칭",
  "테스트"
];

const sortedTriggers = [...triggers].sort((left, right) => right.length - left.length);

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function sentencesFor(paragraph: SourceParagraph): string[] {
  const parts = paragraph.text
    .split(/(?<=[.!?。！？])\s+/u)
    .map(normalizeText)
    .filter(Boolean);

  return parts.length > 0 ? parts : [normalizeText(paragraph.text)].filter(Boolean);
}

function includesEntity(sentence: string, entity: Entity): boolean {
  const lowerSentence = sentence.toLowerCase();
  const names = [entity.displayName, ...entity.aliases].filter(Boolean);
  return names.some((name) => lowerSentence.includes(name.toLowerCase()));
}

function findTrigger(sentence: string): string | undefined {
  const lowerSentence = sentence.toLowerCase();
  return sortedTriggers.find((trigger) => {
    const lowerTrigger = trigger.toLowerCase();
    if (/^[a-z ]+$/u.test(lowerTrigger)) {
      return new RegExp(`(?<![a-z0-9])${escapeRegExp(lowerTrigger)}(?![a-z0-9])`, "iu").test(lowerSentence);
    }

    return lowerSentence.includes(lowerTrigger);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function observedFeatureFor(sentence: string, entity: Entity, trigger: string): string {
  const normalized = normalizeText(sentence);
  const withoutEntity = normalizeText(normalized.replace(new RegExp(escapeRegExp(entity.displayName), "iu"), ""));
  return withoutEntity
    .replace(/^(은|는|이|가|을|를|에서|에서는|이번\s*업데이트(?:에서는|에서)?|이번에는|새롭게)\s*/u, "")
    .replace(/[.!?。！？]+$/u, "")
    .trim() || `${entity.displayName} ${trigger}`;
}

function confidenceFor(document: SourceDocument, paragraph: SourceParagraph, sentence: string): number {
  let confidence = 0.78;

  if (document.reliabilityTier >= 4) {
    confidence += 0.08;
  }

  if (paragraph.index <= 2) {
    confidence += 0.04;
  }

  if (sentence.length >= 40 && sentence.length <= 240) {
    confidence += 0.04;
  }

  return Math.min(0.94, confidence);
}

function evidenceTypeFor(document: SourceDocument): EvidenceCandidate["evidenceType"] {
  if (document.documentType === "manual-observation") {
    return "manual-observation";
  }

  if (document.documentType === "app-store") {
    return "app-store";
  }

  if (document.documentType === "official-newsroom" || document.documentType === "official-blog") {
    return "official";
  }

  if (document.documentType === "rss" || document.documentType === "manual-url" || document.documentType === "article") {
    return "article";
  }

  return "unknown";
}

function evidenceIdFor(document: SourceDocument, entity: Entity, paragraph: SourceParagraph, index: number): string {
  return `evidence:${document.documentId}:${entity.entityId}:${paragraph.id}:${index}`;
}

function paragraphLevelEvidence(
  document: SourceDocument,
  entity: Entity,
  paragraph: SourceParagraph,
  sentences: string[]
): EvidenceCandidate | undefined {
  const entityIndexes = sentences
    .map((sentence, index) => (includesEntity(sentence, entity) ? index : -1))
    .filter((index) => index >= 0);

  if (entityIndexes.length === 0) {
    return undefined;
  }

  for (const entityIndex of entityIndexes) {
    for (const triggerIndex of [entityIndex - 1, entityIndex + 1]) {
      const triggerSentence = sentences[triggerIndex];
      if (!triggerSentence) {
        continue;
      }

      const trigger = findTrigger(triggerSentence);
      if (!trigger) {
        continue;
      }

      const start = Math.min(entityIndex, triggerIndex);
      const end = Math.max(entityIndex, triggerIndex);
      const evidenceSnippet = sentences.slice(start, end + 1).join(" ");

      return {
        evidenceId: evidenceIdFor(document, entity, paragraph, triggerIndex),
        entityId: entity.entityId,
        entityName: entity.displayName,
        observedFeature: observedFeatureFor(triggerSentence, entity, trigger),
        evidenceSnippet,
        evidenceType: evidenceTypeFor(document),
        sourceUrl: document.canonicalUrl,
        paragraphId: paragraph.id,
        paragraphIndex: paragraph.index,
        trigger,
        confidence: Math.max(0.7, confidenceFor(document, paragraph, evidenceSnippet) - 0.08)
      };
    }
  }

  return undefined;
}

export function extractEvidenceForEntity(document: SourceDocument, entity: Entity): EvidenceCandidate[] {
  const candidates: EvidenceCandidate[] = [];

  for (const paragraph of document.paragraphs) {
    const sentences = sentencesFor(paragraph);
    let hasDirectEvidenceInParagraph = false;

    sentences.forEach((sentence, sentenceIndex) => {
      if (!includesEntity(sentence, entity)) {
        return;
      }

      const trigger = findTrigger(sentence);
      if (!trigger) {
        return;
      }

      hasDirectEvidenceInParagraph = true;
      candidates.push({
        evidenceId: evidenceIdFor(document, entity, paragraph, sentenceIndex),
        entityId: entity.entityId,
        entityName: entity.displayName,
        observedFeature: observedFeatureFor(sentence, entity, trigger),
        evidenceSnippet: sentence,
        evidenceType: evidenceTypeFor(document),
        sourceUrl: document.canonicalUrl,
        paragraphId: paragraph.id,
        paragraphIndex: paragraph.index,
        trigger,
        confidence: confidenceFor(document, paragraph, sentence)
      });
    });

    if (!hasDirectEvidenceInParagraph) {
      const fallback = paragraphLevelEvidence(document, entity, paragraph, sentences);
      if (fallback) {
        candidates.push(fallback);
      }
    }
  }

  return candidates.sort((left, right) => right.confidence - left.confidence);
}
