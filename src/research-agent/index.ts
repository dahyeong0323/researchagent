import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_INPUT_PATH, DEFAULT_TOP_LIMIT } from "./config.ts";
import { readFeedbackMemory } from "./feedback.ts";
import { readNotionConfig, writeCandidatesToNotion } from "./notion.ts";
import { scoutToMarkdown, scoutToMarkdownWithLlm } from "./scout.ts";
import { processRawCandidates, processRawCandidatesWithLlm } from "./scout.ts";
import type { RawSourceItem } from "./types.ts";

type CliOptions = {
  inputPath: string;
  limit: number;
  date: string;
  useLlm: boolean;
  useNotion: boolean;
  dryRun: boolean;
  feedbackPath?: string;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function readCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: DEFAULT_INPUT_PATH,
    limit: DEFAULT_TOP_LIMIT,
    date: todayIsoDate(),
    useLlm: process.env.SCOUT_USE_LLM === "1",
    useNotion: false,
    dryRun: false,
    feedbackPath: process.env.SCOUT_FEEDBACK_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if ((arg === "--input" || arg === "-i") && next) {
      options.inputPath = next;
      index += 1;
    } else if ((arg === "--limit" || arg === "-l") && next) {
      options.limit = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--date" && next) {
      options.date = next;
      index += 1;
    } else if (arg === "--llm") {
      options.useLlm = true;
    } else if (arg === "--no-llm") {
      options.useLlm = false;
    } else if (arg === "--notion") {
      options.useNotion = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--feedback" && next) {
      options.feedbackPath = next;
      index += 1;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit must be a positive number.");
  }

  return options;
}

function assertRawSourceItems(value: unknown): asserts value is RawSourceItem[] {
  if (!Array.isArray(value)) {
    throw new Error("Input JSON must be an array of raw source items.");
  }

  value.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Item ${index + 1} must be an object.`);
    }

    const candidate = item as Partial<RawSourceItem>;
    const requiredFields: Array<keyof RawSourceItem> = [
      "title",
      "sourceUrl",
      "sourceName",
      "sourceCategory",
      "collectedAt"
    ];

    for (const field of requiredFields) {
      if (typeof candidate[field] !== "string" || candidate[field]?.trim() === "") {
        throw new Error(`Item ${index + 1} is missing required string field: ${field}`);
      }
    }
  });
}

async function main(): Promise<void> {
  const options = readCliOptions(process.argv.slice(2));
  const input = await readFile(resolve(options.inputPath), "utf8");
  const parsed: unknown = JSON.parse(input);
  assertRawSourceItems(parsed);
  const feedbackMemory = await readFeedbackMemory(options.feedbackPath);

  if (options.useNotion) {
    const candidates = options.useLlm
      ? await processRawCandidatesWithLlm(parsed, options.limit, feedbackMemory)
      : processRawCandidates(parsed, options.limit, feedbackMemory);
    const results = await writeCandidatesToNotion(candidates, readNotionConfig(options.dryRun));
    const successCount = results.filter((result) => result.ok).length;
    const failureCount = results.length - successCount;
    process.stderr.write(
      `Notion write summary: ${successCount} ok, ${failureCount} failed, dryRun=${options.dryRun}\n`
    );
    return;
  }

  const markdown = options.useLlm
    ? await scoutToMarkdownWithLlm(parsed, options.date, options.limit, feedbackMemory)
    : scoutToMarkdown(parsed, options.date, options.limit, feedbackMemory);

  process.stdout.write(markdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Research scout failed: ${message}\n`);
  process.exitCode = 1;
});
