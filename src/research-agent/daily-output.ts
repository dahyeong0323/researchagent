import type { ScoutCandidate } from "./types.ts";

export function renderDailyScoutMarkdown(candidates: ScoutCandidate[], date: string): string {
  const lines: string[] = [
    "# Daily LinkedIn Signal Scout",
    `날짜: ${date}`,
    `총 후보: ${candidates.length}개`,
    "",
    "---",
    ""
  ];

  candidates.forEach((candidate, index) => {
    lines.push(
      `## ${index + 1}. [${candidate.score}점] ${candidate.topicName} / ${candidate.category}`,
      "",
      "**한 줄 요약**  ",
      candidate.oneLineSummary,
      "",
      "**왜 굳이?**  ",
      candidate.coreWhyGudiQuestion,
      "",
      "**비즈니스 관찰기 각도**  ",
      candidate.businessObservationAngle,
      "",
      "**소비자 행동 관점**  ",
      candidate.consumerBehaviorAngle,
      "",
      "**기존 글과의 연결**  ",
      candidate.connectionToExistingPosts,
      "",
      "**겹침 위험**  ",
      candidate.overlapRisk,
      "",
      "**추천 포맷**  ",
      candidate.recommendedFormat,
      "",
      "**직접 방문 가능 여부**  ",
      candidate.visitPossible,
      "",
      "**출처**  ",
      `${candidate.sourceName}  `,
      candidate.sourceUrl,
      "",
      "**다음 액션**  ",
      candidate.nextAction,
      "",
      "---",
      ""
    );
  });

  return lines.join("\n").trimEnd() + "\n";
}
