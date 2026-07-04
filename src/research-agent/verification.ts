import type {
  EntityType,
  EvidenceType,
  RawSourceItem,
  ScoutCandidate,
  VerificationResult,
  VerificationStatus
} from "./types.ts";

const PLACEHOLDER_HOSTS = new Set(["example.com", "www.example.com"]);

const genericEntityNames = new Set([
  "명상 앱",
  "어떤 서비스",
  "한 브랜드",
  "어떤 브랜드",
  "이 앱",
  "this app",
  "a startup",
  "some brand",
  "meditation app"
]);

const unsupportedClaimPatterns = [
  /unsupported/i,
  /contradict/i,
  /not supported/i,
  /source does not support/i,
  /출처가\s*뒷받침하지\s*않음/,
  /근거\s*없음/
];

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function hostnameFor(sourceUrl: string | undefined): string {
  if (!sourceUrl) {
    return "";
  }

  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function hasUsableSourceUrl(sourceUrl: string | undefined): boolean {
  if (!sourceUrl || sourceUrl.trim().length === 0) {
    return false;
  }

  const lower = sourceUrl.toLowerCase();
  if (
    lower.includes("placeholder") ||
    lower.includes("sample") ||
    lower === "https://" ||
    lower === "http://"
  ) {
    return false;
  }

  const host = hostnameFor(sourceUrl);
  return Boolean(host) && !PLACEHOLDER_HOSTS.has(host) && !host.endsWith(".example.com");
}

function isGenericEntityName(entityName: string | undefined): boolean {
  const normalized = normalizeText(entityName).toLowerCase();
  return normalized.length === 0 || genericEntityNames.has(normalized);
}

function inferEvidenceType(item: Partial<RawSourceItem | ScoutCandidate>): EvidenceType {
  if (item.evidenceType) {
    return item.evidenceType;
  }

  const host = hostnameFor(item.sourceUrl);
  if (host.includes("apps.apple.com") || host.includes("play.google.com")) {
    return "app-store";
  }

  if (host.includes("newsroom")) {
    return "official";
  }

  if (host.includes("press") || host.includes("prnewswire")) {
    return "press-release";
  }

  if ("sourceCategory" in item && item.sourceCategory === "manual") {
    return "manual-observation";
  }

  return host ? "article" : "unknown";
}

function sourceReliabilityFor(item: Partial<RawSourceItem | ScoutCandidate>, evidenceType: EvidenceType): number {
  if ("sourceReliability" in item && typeof item.sourceReliability === "number") {
    return item.sourceReliability;
  }

  if (evidenceType === "official" || evidenceType === "press-release" || evidenceType === "app-store") {
    return 4;
  }

  if (evidenceType === "manual-observation") {
    return 2;
  }

  if (evidenceType === "article" || evidenceType === "release-note") {
    return 3;
  }

  return 1;
}

function evidenceParagraphIdsFor(item: Partial<RawSourceItem | ScoutCandidate>): string[] {
  return "evidenceParagraphIds" in item && Array.isArray(item.evidenceParagraphIds)
    ? item.evidenceParagraphIds
    : [];
}

function isUnsupportedClaim(item: Partial<RawSourceItem | ScoutCandidate>): boolean {
  const notes = normalizeText(item.verificationNotes);
  return unsupportedClaimPatterns.some((pattern) => pattern.test(notes));
}

function confirmedFactsFor(
  item: Partial<RawSourceItem | ScoutCandidate>,
  entityName: string | undefined,
  observedFeature: string | undefined
): string[] {
  const facts: string[] = [];

  if (entityName) {
    facts.push(`Entity identified: ${entityName}`);
  }

  if (observedFeature) {
    facts.push(`Observed feature/choice: ${observedFeature}`);
  }

  if (item.sourceUrl) {
    facts.push(`Source URL: ${item.sourceUrl}`);
  }

  return facts;
}

function needsVerificationFor(
  sourceUrl: string | undefined,
  entityName: string | undefined,
  observedFeature: string | undefined,
  evidenceSnippet: string | undefined,
  evidenceParagraphIds: string[]
): string[] {
  const missing: string[] = [];

  if (!hasUsableSourceUrl(sourceUrl)) {
    missing.push("real public source URL");
  }

  if (isGenericEntityName(entityName)) {
    missing.push("specific entity name");
  }

  if (!observedFeature) {
    missing.push("observed feature or strategic choice");
  }

  if (!evidenceSnippet && evidenceParagraphIds.length === 0) {
    missing.push("evidence snippet or evidence paragraph reference");
  }

  return missing;
}

function verificationNotesFor(
  status: VerificationStatus,
  missing: string[],
  rejectedReason: string | undefined,
  fallback?: string
): string {
  if (fallback && fallback.trim().length > 0) {
    return fallback.trim();
  }

  if (status === "rejected") {
    return rejectedReason ?? "Source does not support the candidate claim.";
  }

  if (status === "verified") {
    return "Verified source, entity, observed feature, and evidence are present.";
  }

  return `Needs research before writing: ${missing.join(", ")}.`;
}

export function isBriefAllowed(result: VerificationResult): boolean {
  return (
    result.verificationStatus === "verified" &&
    Boolean(result.entityName) &&
    Boolean(result.observedFeature) &&
    (Boolean(result.evidenceSnippet) || result.evidenceParagraphIds.length > 0)
  );
}

export function verifyCandidate(candidate: Partial<ScoutCandidate>): VerificationResult {
  const entityName = normalizeText(candidate.entityName) || undefined;
  const observedFeature = normalizeText(candidate.observedFeature) || undefined;
  const evidenceSnippet = normalizeText(candidate.evidenceSnippet) || undefined;
  const evidenceParagraphIds = evidenceParagraphIdsFor(candidate);
  const evidenceType = inferEvidenceType(candidate);
  const sourceReliability = sourceReliabilityFor(candidate, evidenceType);
  const missing = needsVerificationFor(
    candidate.sourceUrl,
    entityName,
    observedFeature,
    evidenceSnippet,
    evidenceParagraphIds
  );

  let verificationStatus: VerificationStatus = candidate.verificationStatus ?? "verified";
  let rejectedReason: string | undefined;

  if (candidate.verificationStatus === "rejected" || isUnsupportedClaim(candidate)) {
    verificationStatus = "rejected";
    rejectedReason = "Source does not support the candidate claim.";
  } else if (missing.length > 0) {
    verificationStatus = "needs-research";
  }

  return {
    verificationId: `verification:${candidate.id ?? candidate.candidateId ?? candidate.sourceUrl ?? "unknown"}`,
    candidateId: candidate.candidateId ?? candidate.id,
    entityName,
    entityType: candidate.entityType ?? "unknown",
    observedFeature,
    verificationStatus,
    sourceReliability,
    evidenceSnippet,
    evidenceType,
    evidenceParagraphIds,
    confirmedFacts: verificationStatus === "verified" ? confirmedFactsFor(candidate, entityName, observedFeature) : [],
    reasonableInferences: [],
    needsVerification: verificationStatus === "needs-research" ? missing : [],
    verificationNotes: verificationNotesFor(
      verificationStatus,
      missing,
      rejectedReason,
      candidate.verificationNotes
    ),
    rejectedReason,
    reviewedBy: "system",
    reviewedAt: nowIso()
  };
}

export function verifySourceItem(item: RawSourceItem): VerificationResult {
  return verifyCandidate({
    id: item.id ?? item.sourceUrl,
    candidateId: item.id ?? item.sourceUrl,
    sourceUrl: item.sourceUrl,
    sourceName: item.sourceName,
    sourcePublishedAt: item.sourcePublishedAt ?? item.publishedAt,
    entityName: item.entityName,
    entityType: item.entityType ?? "unknown",
    observedFeature: item.observedFeature,
    evidenceSnippet: item.evidenceSnippet,
    evidenceType: item.evidenceType,
    verificationStatus: item.verificationStatus,
    verificationNotes: item.verificationNotes,
    sourceReliability: undefined,
    evidenceParagraphIds: []
  });
}

export function applyVerificationToCandidate(
  candidate: ScoutCandidate,
  verification: VerificationResult
): ScoutCandidate {
  return {
    ...candidate,
    entityName: verification.entityName,
    entityType: verification.entityType,
    observedFeature: verification.observedFeature,
    evidenceSnippet: verification.evidenceSnippet,
    evidenceType: verification.evidenceType,
    evidenceParagraphIds: verification.evidenceParagraphIds,
    verificationStatus: verification.verificationStatus,
    verificationNotes: verification.verificationNotes,
    sourceReliability: verification.sourceReliability,
    confirmedFacts: verification.confirmedFacts,
    reasonableInferences: verification.reasonableInferences,
    needsVerification: verification.needsVerification,
    briefAllowed: isBriefAllowed(verification)
  };
}
