import type { Entity, EvidenceCandidate, SourceDocument, SourceParagraph } from "./types.ts";

const triggers = [
  "launch",
  "launches",
  "launched",
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
  "출시",
  "도입",
  "확대",
  "오픈",
  "개편"
];

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
  return triggers.find((trigger) => lowerSentence.includes(trigger.toLowerCase()));
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
        evidenceSnippet: sentence,
        evidenceType: document.documentType === "manual-observation" ? "manual-observation" : "article",
        paragraphId: paragraph.id,
        paragraphIndex: paragraph.index,
        trigger,
        confidence: 0.82
      });
    });
  }

  return candidates;
}
