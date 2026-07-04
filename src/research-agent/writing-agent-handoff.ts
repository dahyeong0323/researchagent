import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createWritingAgentHandoffPayload,
  type WritingAgentHandoffPayload
} from "./handoff.ts";
import type { ScoutCandidate, WritingBrief } from "./types.ts";

export function assertWritingAgentHandoffAllowed(candidate: ScoutCandidate): void {
  if (candidate.verificationStatus !== "verified") {
    throw new Error("Writing handoff blocked: candidate must be verified.");
  }

  if (candidate.briefAllowed !== true) {
    throw new Error("Writing handoff blocked: candidate must be briefAllowed.");
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

  if (!candidate.sourceUrl) {
    throw new Error("Writing handoff blocked: sourceUrl is required.");
  }
}

export function buildWritingAgentHandoffPayload(
  candidate: ScoutCandidate,
  brief: WritingBrief,
  options: { briefId?: string; createdAt?: string; styleInstructions?: string[] } = {}
): WritingAgentHandoffPayload {
  assertWritingAgentHandoffAllowed(candidate);
  return createWritingAgentHandoffPayload(candidate, brief, options);
}

export async function writeWritingAgentHandoffPayload(
  candidate: ScoutCandidate,
  brief: WritingBrief,
  options: {
    briefId?: string;
    createdAt?: string;
    styleInstructions?: string[];
    outputDir?: string;
  } = {}
): Promise<string> {
  const payload = buildWritingAgentHandoffPayload(candidate, brief, options);
  const outputDir = options.outputDir ?? "data/research-agent/handoffs";
  const outputPath = resolve(outputDir, `${candidate.candidateId.replace(/[^\w.-]+/gu, "_")}.json`);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return outputPath;
}

export type { WritingAgentHandoffPayload };
