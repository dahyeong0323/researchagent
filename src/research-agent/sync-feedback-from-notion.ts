import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeFeedbackMemory } from "./feedback.ts";
import { readFeedbackRecordsFromNotion, readNotionConfig } from "./notion.ts";

const DEFAULT_OUTPUT_PATH = "data/research-agent/feedback.notion.json";

type CliOptions = {
  outputPath: string;
};

function readCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    outputPath: DEFAULT_OUTPUT_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if ((arg === "--output" || arg === "-o") && next) {
      options.outputPath = next;
      index += 1;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = readCliOptions(process.argv.slice(2));
  const records = await readFeedbackRecordsFromNotion(readNotionConfig(false));
  const memory = normalizeFeedbackMemory({
    candidateFeedback: records
  });

  await writeFile(resolve(options.outputPath), `${JSON.stringify(memory, null, 2)}\n`, "utf8");
  process.stdout.write(`Synced ${records.length} feedback records to ${resolve(options.outputPath)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Notion feedback sync failed: ${message}\n`);
  process.exitCode = 1;
});
