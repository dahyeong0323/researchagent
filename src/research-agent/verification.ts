import type {
  EntityType,
  EvidenceType,
  RawSourceItem,
  ScoutCandidate,
  VerificationStatus
} from "./types.ts";

export type VerificationResult = {
  entityName?: string;
  entityType: EntityType;
  observedFeature?: string;
  evidenceSnippet?: string;
  evidenceType: EvidenceType;
  verificationStatus: VerificationStatus;
  verificationNotes?: string;
};

const genericEntityPatterns = [
  /명상\s*앱/,
  /어떤\s*브랜드/,
  /어떤\s*앱/,
  /어떤\s*서비스/,
  /한\s*스타트업/,
  /한\s*브랜드/,
  /a\s+startup/i,
  /some\s+brand/i,
  /meditation\s+app/i
];

function hostnameFor(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isExampleSource(sourceUrl: string): boolean {
  return hostnameFor(sourceUrl).endsWith("example.com");
}

function isGenericCandidateText(value: string): boolean {
  return genericEntityPatterns.some((pattern) => pattern.test(value));
}

function inferEvidenceType(item: RawSourceItem): EvidenceType {
  if (item.evidenceType) {
    return item.evidenceType;
  }

  const host = hostnameFor(item.sourceUrl);
  if (host.includes("apps.apple.com") || host.includes("play.google.com")) {
    return "app-store";
  }

  if (host.includes("newsroom") || host.includes("press") || host.includes("prnewswire")) {
    return "official";
  }

  if (item.sourceCategory === "manual") {
    return "manual-observation";
  }

  return host ? "article" : "unknown";
}

function buildVerificationNotes(item: RawSourceItem, status: VerificationStatus): string | undefined {
  if (item.verificationNotes) {
    return item.verificationNotes;
  }

  if (status === "verified") {
    return "Entity name and non-sample source are present.";
  }

  if (isExampleSource(item.sourceUrl)) {
    return "Sample/example.com source requires replacement with a real public source.";
  }

  if (!item.entityName) {
    return "Actual service, brand, company, app, or store name is missing.";
  }

  if (isGenericCandidateText(`${item.title} ${item.rawSummary ?? ""}`)) {
    return "Candidate wording is generic and does not identify a specific real entity.";
  }

  return "Candidate requires source/entity verification before writing.";
}

export function verifySourceItem(item: RawSourceItem): VerificationResult {
  const evidenceType = inferEvidenceType(item);
  const entityName = item.entityName?.trim() || undefined;
  const text = `${item.title} ${item.rawSummary ?? ""}`;

  let verificationStatus: VerificationStatus = item.verificationStatus ?? "verified";

  if (item.verificationStatus === "rejected") {
    verificationStatus = "rejected";
  } else if (isExampleSource(item.sourceUrl)) {
    verificationStatus = "needs-research";
  } else if (!entityName) {
    verificationStatus = "needs-research";
  } else if (isGenericCandidateText(text)) {
    verificationStatus = "needs-research";
  }

  return {
    entityName,
    entityType: item.entityType ?? "unknown",
    observedFeature: item.observedFeature,
    evidenceSnippet: item.evidenceSnippet,
    evidenceType,
    verificationStatus,
    verificationNotes: buildVerificationNotes(item, verificationStatus)
  };
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
    verificationStatus: verification.verificationStatus,
    verificationNotes: verification.verificationNotes
  };
}
