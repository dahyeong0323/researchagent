import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadLocalEnv } from "./env.ts";
import { registerTelegramCallbackCandidateIds } from "./telegram-callback.ts";
import {
  buildCandidateInlineKeyboard,
  buildDailySummaryInlineKeyboard,
  renderTelegramDailySummary,
  sendTelegramMessage
} from "./telegram.ts";
import type { ScoutCandidate } from "./types.ts";

loadLocalEnv();

const DEFAULT_RUNS_DIR = process.env.RESEARCH_AGENT_RUNS_DIR ?? "data/research-agent/runs";

type TelegramTestOptions = {
  snapshotPath: string;
  candidateId?: string;
  limit: number;
};

type CandidateSnapshot = {
  candidates?: unknown;
};

function readOptions(argv: string[]): TelegramTestOptions {
  const options: TelegramTestOptions = {
    snapshotPath: resolve(DEFAULT_RUNS_DIR, "latest-candidates.json"),
    limit: 1
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--snapshot" && next) {
      options.snapshotPath = next;
      index += 1;
    } else if (arg === "--candidate-id" && next) {
      options.candidateId = next;
      index += 1;
    } else if ((arg === "--limit" || arg === "-l") && next) {
      options.limit = Number.parseInt(next, 10);
      index += 1;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit must be a positive number.");
  }

  return options;
}

function isScoutCandidate(value: unknown): value is ScoutCandidate {
  return Boolean(value) &&
    typeof value === "object" &&
    typeof (value as Partial<ScoutCandidate>).candidateId === "string" &&
    typeof (value as Partial<ScoutCandidate>).topicName === "string" &&
    typeof (value as Partial<ScoutCandidate>).sourceUrl === "string" &&
    typeof (value as Partial<ScoutCandidate>).verificationStatus === "string";
}

async function readCandidates(snapshotPath: string): Promise<ScoutCandidate[]> {
  const snapshot = JSON.parse(await readFile(resolve(snapshotPath), "utf8")) as CandidateSnapshot;
  if (!Array.isArray(snapshot.candidates)) {
    throw new Error(`Snapshot does not contain a candidates array: ${snapshotPath}`);
  }

  return snapshot.candidates.filter(isScoutCandidate);
}

function selectCandidates(candidates: ScoutCandidate[], options: TelegramTestOptions): ScoutCandidate[] {
  if (options.candidateId) {
    const candidate = candidates.find((item) => item.candidateId === options.candidateId || item.id === options.candidateId);
    if (!candidate) {
      throw new Error(`Candidate not found in snapshot: ${options.candidateId}`);
    }
    return [candidate];
  }

  return candidates.slice(0, options.limit);
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  const candidates = selectCandidates(await readCandidates(options.snapshotPath), options);
  if (candidates.length === 0) {
    throw new Error(`No candidates found in snapshot: ${options.snapshotPath}`);
  }

  await registerTelegramCallbackCandidateIds(candidates.map((candidate) => candidate.candidateId));

  const title = `Telegram button test: ${candidates.length} candidate(s). Notion write was not attempted.`;
  const replyMarkup = candidates.length === 1
    ? buildCandidateInlineKeyboard(candidates[0])
    : buildDailySummaryInlineKeyboard(candidates);
  const ok = await sendTelegramMessage(renderTelegramDailySummary(candidates, { title }), replyMarkup);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        mode: "telegram-test",
        snapshotPath: resolve(options.snapshotPath),
        candidateIds: candidates.map((candidate) => candidate.candidateId)
      },
      null,
      2
    )}\n`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Telegram test failed: ${message}\n`);
  process.exitCode = 1;
});
