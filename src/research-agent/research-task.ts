import type { ResearchTask, ScoutCandidate, VerificationResult } from "./types.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function hasPlaceholderSource(candidate: ScoutCandidate): boolean {
  const value = candidate.sourceUrl.trim().toLowerCase();
  return (
    value.length === 0 ||
    value.includes("example.com") ||
    value.includes("placeholder") ||
    value.includes("sample")
  );
}

function missingFieldsFor(candidate: ScoutCandidate, verification?: VerificationResult): string[] {
  if (verification) {
    return [...new Set(verification.missingFields.length > 0 ? verification.missingFields : verification.needsVerification)];
  }

  const missing = new Set(candidate.missingFields ?? candidate.needsVerification ?? []);

  if (hasPlaceholderSource(candidate)) {
    missing.add("real public source URL");
  }

  if (!candidate.entityName) {
    missing.add("specific entity name");
  }

  if (candidate.entityType === "unknown") {
    missing.add("known entity type");
  }

  if (!candidate.observedFeature) {
    missing.add("observed feature or strategic choice");
  }

  if (!candidate.evidenceSnippet && (!candidate.evidenceParagraphIds || candidate.evidenceParagraphIds.length === 0)) {
    missing.add("evidence snippet or evidence paragraph reference");
  }

  if (candidate.evidenceType === "unknown") {
    missing.add("known evidence type");
  }

  return [...missing];
}

function requiredSourcesFor(candidate: ScoutCandidate): string[] {
  const sources = [
    "Official website, newsroom, product page, app-store page, or credible article that names the entity.",
    "Source passage that directly supports the observed feature or strategic choice."
  ];

  if (candidate.sourceUrl && !hasPlaceholderSource(candidate)) {
    sources.unshift(candidate.sourceUrl);
  }

  return sources;
}

function verificationQuestionsFor(candidate: ScoutCandidate, missingFields: string[]): string[] {
  const questions = [
    `What exact entity is behind "${candidate.topicName}"?`,
    "What concrete feature, store, campaign, product update, or strategic choice is visible in the source?",
    "Which exact sentence or paragraph supports that observation?",
    "Does the source support the business-observation angle, or only a weaker factual claim?"
  ];

  if (missingFields.includes("real public source URL")) {
    questions.unshift("What real public source should replace the sample or placeholder URL?");
  }

  return questions;
}

function requiredEvidenceFor(candidate: ScoutCandidate, missingFields: string[]): string[] {
  const required = [
    "A public, non-placeholder URL that can be opened without login or paywall bypass.",
    "A source sentence or paragraph that directly names the entity.",
    "A source sentence or paragraph that directly supports the observed feature or strategic choice."
  ];

  if (missingFields.includes("known entity type")) {
    required.push("Evidence that identifies whether the entity is a company, brand, app, service, store, product, or person.");
  }

  if (missingFields.includes("known evidence type")) {
    required.push("Evidence type label such as official, article, press-release, app-store, release-note, or manual-observation.");
  }

  if (candidate.sourceUrl && !hasPlaceholderSource(candidate)) {
    required.unshift(`Current source to verify or replace: ${candidate.sourceUrl}`);
  }

  return [...new Set(required)];
}

function suggestedSearchQueriesFor(candidate: ScoutCandidate): string[] {
  const topic = candidate.topicName.replace(/\s+/g, " ").trim();
  const entity = candidate.entityName?.trim();
  const feature = candidate.observedFeature?.trim();

  return [
    [entity ?? topic, feature, "official"].filter(Boolean).join(" "),
    [entity ?? topic, feature, "newsroom"].filter(Boolean).join(" "),
    [entity ?? topic, feature, "article"].filter(Boolean).join(" ")
  ].filter((query, index, queries) => query.length > 0 && queries.indexOf(query) === index);
}

function priorityFor(candidate: ScoutCandidate, missingFields: string[]): ResearchTask["priority"] {
  if (candidate.score >= 85 && missingFields.length <= 2) {
    return "high";
  }

  if (candidate.score >= 70) {
    return "medium";
  }

  return "low";
}

function completionCriteriaFor(): string[] {
  return [
    "실제 서비스/브랜드명이 확인된다.",
    "A real, non-placeholder source URL is attached.",
    "A specific entity name and entity type are identified.",
    "An observed feature or strategic choice is stated concretely.",
    "An evidence snippet or evidence paragraph id directly supports the observation.",
    "The candidate can pass strict verification and set briefAllowed to true, or it is rejected."
  ];
}

function reasonFor(candidate: ScoutCandidate, verification?: VerificationResult): string {
  return (
    verification?.verificationNotes ??
    candidate.verificationNotes ??
    "Candidate is not eligible for a Writing Brief until source, entity, feature, and evidence are verified."
  );
}

export function createResearchTask(
  candidate: ScoutCandidate,
  verification?: VerificationResult
): ResearchTask {
  const missingFields = missingFieldsFor(candidate, verification);
  const reason = reasonFor(candidate, verification);
  const questionsToAnswer = verificationQuestionsFor(candidate, missingFields);
  const requiredEvidence = requiredEvidenceFor(candidate, missingFields);

  return {
    taskId: `research-task:${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    topicName: candidate.topicName,
    taskTitle: `Research needed: ${candidate.topicName}`,
    taskReason: reason,
    reason,
    missingFields,
    currentSourceUrl: candidate.sourceUrl,
    currentEntityName: candidate.entityName,
    currentObservedFeature: candidate.observedFeature,
    requiredSources: requiredSourcesFor(candidate),
    verificationQuestions: questionsToAnswer,
    questionsToAnswer,
    suggestedSearchQueries: suggestedSearchQueriesFor(candidate),
    requiredEvidence,
    priority: priorityFor(candidate, missingFields),
    completionCriteria: completionCriteriaFor(),
    status: "open",
    createdAt: nowIso()
  };
}

export function createResearchTaskFromCandidate(candidate: ScoutCandidate): ResearchTask {
  return createResearchTask(candidate);
}

function renderList(items: string[]): string {
  if (items.length === 0) {
    return "- None";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

export function renderResearchTaskMarkdown(task: ResearchTask, candidate: ScoutCandidate): string {
  return [
    `# Research Task: ${candidate.topicName}`,
    "",
    "## Candidate",
    "",
    `- candidateId: ${candidate.candidateId}`,
    `- topicName: ${candidate.topicName}`,
    `- sourceName: ${candidate.sourceName}`,
    `- sourceUrl: ${candidate.sourceUrl}`,
    `- verificationStatus: ${candidate.verificationStatus}`,
    `- briefAllowed: ${candidate.briefAllowed ? "true" : "false"}`,
    "",
    "## Why this needs research",
    "",
    task.reason,
    "",
    "## Current verified facts",
    "",
    renderList([
      task.currentSourceUrl ? `Current source URL: ${task.currentSourceUrl}` : undefined,
      task.currentEntityName ? `Current entity name: ${task.currentEntityName}` : undefined,
      task.currentObservedFeature ? `Current observed feature: ${task.currentObservedFeature}` : undefined,
      candidate.evidenceSnippet ? `Current evidence snippet: ${candidate.evidenceSnippet}` : undefined
    ].filter((item): item is string => Boolean(item))),
    "",
    "## Missing fields",
    "",
    renderList(task.missingFields),
    "",
    "## Required sources",
    "",
    renderList(task.requiredSources),
    "",
    "## Research questions",
    "",
    renderList(task.questionsToAnswer),
    "",
    "## Required evidence",
    "",
    renderList(task.requiredEvidence),
    "",
    "## Suggested search queries",
    "",
    renderList(task.suggestedSearchQueries),
    "",
    "## Completion criteria",
    "",
    renderList(task.completionCriteria),
    ""
  ].join("\n");
}
