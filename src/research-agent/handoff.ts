import type { EntityType, ScoutCandidate, WritingBrief } from "./types.ts";

export interface WritingAgentHandoffPayload {
  handoffId: string;
  candidateId: string;
  briefId: string;
  entityName: string;
  entityType: EntityType;
  observedFeature: string;
  sourceUrl: string;
  sourceUrls: string[];
  sourceName: string;
  sourcePublishedAt?: string;
  evidenceSnippet: string;
  confirmedFacts: string[];
  reasonableInferences: string[];
  needsVerification: string[];
  whyGudiQuestion: string;
  businessMechanism: string;
  consumerBehaviorAngle: string;
  styleInstructions?: string[];
  prohibitedClaims: string[];
  humanApprovalRequired: true;
  createdAt: string;
}

function assertHandoffAllowed(candidate: ScoutCandidate): void {
  if (candidate.verificationStatus !== "verified" || !candidate.briefAllowed) {
    throw new Error("Writing handoff blocked: candidate must be verified and briefAllowed.");
  }

  if (!candidate.entityName) {
    throw new Error("Writing handoff blocked: entityName is required.");
  }

  if (!candidate.observedFeature) {
    throw new Error("Writing handoff blocked: observedFeature is required.");
  }

  if (!candidate.evidenceSnippet) {
    throw new Error("Writing handoff blocked: evidenceSnippet is required.");
  }
}

function prohibitedClaimsFor(candidate: ScoutCandidate): string[] {
  return [
    "Do not publish, like, comment, DM, or automate LinkedIn activity.",
    "Do not claim performance, revenue, adoption, or user response unless it is explicitly sourced.",
    "Do not present reasonable inferences as confirmed facts.",
    ...(candidate.needsVerification ?? []).map((item) => `Do not claim until verified: ${item}`)
  ];
}

function sourceUrlsFor(candidate: ScoutCandidate, brief: WritingBrief): string[] {
  return [...new Set([candidate.sourceUrl, ...brief.sourceUrls].filter((url) => url.trim() !== ""))];
}

export function createWritingAgentHandoffPayload(
  candidate: ScoutCandidate,
  brief: WritingBrief,
  options: { briefId?: string; createdAt?: string; styleInstructions?: string[] } = {}
): WritingAgentHandoffPayload {
  assertHandoffAllowed(candidate);

  const createdAt = options.createdAt ?? new Date().toISOString();

  return {
    handoffId: `handoff:${candidate.candidateId}:${createdAt}`,
    candidateId: candidate.candidateId,
    briefId: options.briefId ?? `brief:${candidate.candidateId}`,
    entityName: candidate.entityName as string,
    entityType: candidate.entityType,
    observedFeature: candidate.observedFeature as string,
    sourceUrl: candidate.sourceUrl,
    sourceUrls: sourceUrlsFor(candidate, brief),
    sourceName: candidate.sourceName,
    sourcePublishedAt: candidate.sourcePublishedAt,
    evidenceSnippet: candidate.evidenceSnippet as string,
    confirmedFacts: candidate.confirmedFacts ?? brief.evidenceBoundary.confirmedFacts,
    reasonableInferences: candidate.reasonableInferences ?? brief.evidenceBoundary.reasonableInferences,
    needsVerification: candidate.needsVerification ?? brief.evidenceBoundary.needsVerification,
    whyGudiQuestion: candidate.coreWhyGudiQuestion,
    businessMechanism: brief.businessMechanism,
    consumerBehaviorAngle: candidate.consumerBehaviorAngle,
    styleInstructions: options.styleInstructions,
    prohibitedClaims: prohibitedClaimsFor(candidate),
    humanApprovalRequired: true,
    createdAt
  };
}
