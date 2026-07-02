import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DEFAULT_INPUT_PATH } from "./config.ts";
import { readFeedbackMemory } from "./feedback.ts";
import { processRawCandidates } from "./scout.ts";
import type { FeedbackMemory, RawSourceItem, ScoutCandidate, WritingBrief } from "./types.ts";

const DEFAULT_OUTPUT_DIR = "data/research-agent/writing-briefs";

type CliOptions = {
  inputPath: string;
  feedbackPath?: string;
  outputDir: string;
  date: string;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function readCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: DEFAULT_INPUT_PATH,
    feedbackPath: process.env.SCOUT_FEEDBACK_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
    date: todayIsoDate()
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if ((arg === "--input" || arg === "-i") && next) {
      options.inputPath = next;
      index += 1;
    } else if (arg === "--feedback" && next) {
      options.feedbackPath = next;
      index += 1;
    } else if (arg === "--output-dir" && next) {
      options.outputDir = next;
      index += 1;
    } else if (arg === "--date" && next) {
      options.date = next;
      index += 1;
    }
  }

  return options;
}

function assertRawSourceItems(value: unknown): asserts value is RawSourceItem[] {
  if (!Array.isArray(value)) {
    throw new Error("Input JSON must be an array of raw source items.");
  }
}

function selectedIds(memory: FeedbackMemory): Set<string> {
  return new Set(
    memory.candidateFeedback
      .filter((record) => record.status === "Selected" && record.candidateId)
      .map((record) => record.candidateId as string)
  );
}

function selectedTopicNames(memory: FeedbackMemory): string[] {
  return memory.candidateFeedback
    .filter((record) => record.status === "Selected")
    .map((record) => record.topicName);
}

function isSelectedCandidate(candidate: ScoutCandidate, memory: FeedbackMemory): boolean {
  const ids = selectedIds(memory);
  if (ids.has(candidate.id)) {
    return true;
  }

  const topics = selectedTopicNames(memory);
  return topics.some(
    (topic) =>
      candidate.topicName.includes(topic) ||
      candidate.oneLineSummary.includes(topic) ||
      candidate.coreWhyGudiQuestion.includes(topic)
  );
}

function possibleStructureFor(candidate: ScoutCandidate): string[] {
  return [
    `구체 장면은 '${candidate.topicName}'에서 시작한다.`,
    `핵심 질문을 먼저 둔다: ${candidate.coreWhyGudiQuestion}`,
    candidate.businessObservationAngle,
    candidate.consumerBehaviorAngle,
    "마지막에는 이 사례가 단순 트렌드가 아니라 어떤 소비/비즈니스 구조를 보여주는지 조용히 정리한다."
  ];
}

function counterArgumentsFor(candidate: ScoutCandidate): string[] {
  const argumentsList = [
    "출처에 없는 매출, 성과, 내부 전략을 단정하지 않는다.",
    "전문가처럼 결론을 내리기보다 학생 관찰자의 질문으로 남긴다."
  ];

  if (candidate.overlapRisk === "높음") {
    argumentsList.push("기존 Olive Better/웰니스 글과 너무 비슷해지지 않도록 비교 대상이나 관찰 장면을 새로 잡는다.");
  }

  if (candidate.sourceName === "샘플 수동 입력") {
    argumentsList.push("실제 글로 쓰기 전에는 공개 기사나 공식 페이지로 출처를 교체해야 한다.");
  }

  return argumentsList;
}

function toWritingBrief(candidate: ScoutCandidate): WritingBrief {
  return {
    topicName: candidate.topicName,
    coreWhyGudiQuestion: candidate.coreWhyGudiQuestion,
    oneLineSummary: candidate.oneLineSummary,
    businessObservationAngle: candidate.businessObservationAngle,
    consumerBehaviorAngle: candidate.consumerBehaviorAngle,
    possibleStructure: possibleStructureFor(candidate),
    counterArguments: counterArgumentsFor(candidate),
    sourceUrls: [candidate.sourceUrl],
    recommendedFormat: candidate.recommendedFormat,
    styleReference: "olive-better"
  };
}

function renderList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function renderWritingBrief(brief: WritingBrief): string {
  return [
    `# Writing Brief: ${brief.topicName}`,
    "",
    "## 핵심 질문",
    "",
    brief.coreWhyGudiQuestion,
    "",
    "## 한 줄 요약",
    "",
    brief.oneLineSummary,
    "",
    "## 비즈니스 관찰기 각도",
    "",
    brief.businessObservationAngle,
    "",
    "## 소비자 행동 관점",
    "",
    brief.consumerBehaviorAngle,
    "",
    "## 가능한 구조",
    "",
    renderList(brief.possibleStructure),
    "",
    "## 반론 / 조심할 점",
    "",
    renderList(brief.counterArguments),
    "",
    "## 추천 포맷",
    "",
    brief.recommendedFormat,
    "",
    "## 스타일 레퍼런스",
    "",
    brief.styleReference,
    "",
    "## 출처",
    "",
    renderList(brief.sourceUrls),
    ""
  ].join("\n");
}

function slugifyFilePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

async function main(): Promise<void> {
  const options = readCliOptions(process.argv.slice(2));
  if (!options.feedbackPath) {
    throw new Error("--feedback is required to find Selected candidates.");
  }

  const input = await readFile(resolve(options.inputPath), "utf8");
  const parsed: unknown = JSON.parse(input);
  assertRawSourceItems(parsed);

  const memory = await readFeedbackMemory(options.feedbackPath);
  if (!memory) {
    throw new Error(`Could not read feedback memory: ${options.feedbackPath}`);
  }

  const candidates = processRawCandidates(parsed, parsed.length, memory);
  const selectedCandidates = candidates.filter((candidate) => isSelectedCandidate(candidate, memory));

  if (selectedCandidates.length === 0) {
    process.stderr.write("No Selected candidates found. Nothing exported.\n");
    return;
  }

  await mkdir(resolve(options.outputDir), { recursive: true });

  for (const candidate of selectedCandidates) {
    const brief = toWritingBrief(candidate);
    const filename = `${options.date}-${slugifyFilePart(candidate.topicName)}.md`;
    const outputPath = resolve(join(options.outputDir, filename));
    await writeFile(outputPath, renderWritingBrief(brief), "utf8");
    process.stdout.write(`Exported writing brief: ${outputPath}\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Writing brief export failed: ${message}\n`);
  process.exitCode = 1;
});
