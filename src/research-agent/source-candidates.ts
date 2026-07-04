import { generateCandidatesFromDocument } from "./candidate-from-document.ts";
import { processRawCandidates } from "./scout.ts";
import type { RawSourceItem, ScoutCandidate, SourceDocument } from "./types.ts";

export function candidatesFromDocumentOrFallback(
  document: SourceDocument,
  fallbackRawItem: RawSourceItem
): ScoutCandidate[] {
  const documentCandidates = generateCandidatesFromDocument(document);
  if (documentCandidates.length > 0) {
    return documentCandidates;
  }

  return processRawCandidates([fallbackRawItem], 1);
}
