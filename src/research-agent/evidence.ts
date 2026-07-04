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
  "테스트"
];

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function sentencesFor(paragraph: SourceParagraph): string[] {
  const parts = paragraph.text
    .split(/(?<=[.!?。])\s+/u)
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
  return triggers.find((trigger) => lowerSentence.includes(trigger.toLowerCase()));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function observedFeatureFor(sentence: string, entity: Entity, trigger: string): string {
  const normalized = normalizeText(sentence);
  const withoutEntity = normalizeText(normalized.replace(new RegExp(escapeRegExp(entity.displayName), "i"), ""));
  return withoutEntity.replace(/^[은는이가을를]\s*/u, "").replace(/[.!?。]+$/u, "").trim() || `${entity.displayName} ${trigger}`;
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

export function extractEvidenceForEntity(document: SourceDocument, entity: Entity): EvidenceCandidate[] {
  const candidates: EvidenceCandidate[] = [];

  for (const paragraph of document.paragraphs) {
    const sentences = sentencesFor(paragraph);

    sentences.forEach((sentence, sentenceIndex) => {
      if (!includesEntity(sentence, entity)) {
        return;
      }

      const trigger = findTrigger(sentence);
      if (!trigger) {
        return;
      }

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
  }

  return candidates.sort((left, right) => right.confidence - left.confidence);
}
