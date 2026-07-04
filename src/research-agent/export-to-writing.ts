import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_INPUT_PATH } from "./config.ts";
import { loadLocalEnv } from "./env.ts";
import { readFeedbackMemory } from "./feedback.ts";
import { createResearchTaskFromCandidate, renderResearchTaskMarkdown } from "./research-task.ts";
import { processRawCandidates } from "./scout.ts";
import type {
  FeedbackMemory,
  RawSourceItem,
  ScoutCandidate,
  WritingBrief,
  WritingBriefStyleReference
} from "./types.ts";

loadLocalEnv();

export const DEFAULT_WRITING_BRIEF_OUTPUT_DIR = "data/research-agent/writing-briefs";

type CliOptions = {
  inputPath: string;
  feedbackPath?: string;
  outputDir: string;
  date: string;
  useLlm: boolean;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function readCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: DEFAULT_INPUT_PATH,
    feedbackPath: process.env.SCOUT_FEEDBACK_PATH,
    outputDir: DEFAULT_WRITING_BRIEF_OUTPUT_DIR,
    date: todayIsoDate(),
    useLlm: false
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
    } else if (arg === "--llm") {
      options.useLlm = true;
    } else if (arg === "--no-llm") {
      options.useLlm = false;
    }
  }

  return options;
}

export function assertRawSourceItems(value: unknown): asserts value is RawSourceItem[] {
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

function candidateText(candidate: ScoutCandidate): string {
  return [
    candidate.category,
    candidate.topicName,
    candidate.oneLineSummary,
    candidate.coreWhyGudiQuestion,
    candidate.businessObservationAngle,
    candidate.consumerBehaviorAngle,
    candidate.connectionToExistingPosts,
    candidate.sourceName
  ]
    .join(" ")
    .toLowerCase();
}

function hasAny(candidate: ScoutCandidate, keywords: string[]): boolean {
  const text = candidateText(candidate);
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function isMeditationAccountabilityCase(candidate: ScoutCandidate): boolean {
  return (
    candidate.category === "앱/프로덕트" &&
    hasAny(candidate, ["명상", "meditation", "mindfulness"]) &&
    hasAny(candidate, ["친구", "체크인", "check-in", "checkin", "accountability"])
  );
}

function isUnverifiedSource(candidate: ScoutCandidate): boolean {
  return candidate.sourceName === "샘플 수동 입력" || candidate.sourceUrl.includes("example.com");
}

function stripGenericQuestionLanguage(value: string): string {
  return value
    .replace(/기능 제공을 넘어/g, "")
    .replace(/생활 루틴 안으로 들어가려는/g, "")
    .replace(/흐름으로 해석할 수 있다/g, "")
    .replace(/소비자는\s+[^?。.!]*하기 시작한다/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactTopicName(candidate: ScoutCandidate): string {
  return candidate.topicName
    .replace(/하는 선택/g, "")
    .replace(/강조하는/g, "강조")
    .replace(/운영하는/g, "운영")
    .replace(/확대하는/g, "확대")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferRefinedCoreQuestion(candidate: ScoutCandidate): string {
  if (isMeditationAccountabilityCase(candidate)) {
    return "명상은 원래 혼자 하는데, 왜 친구 체크인을 앞세울까?";
  }

  if (hasAny(candidate, ["중고거래", "검수", "팝업"])) {
    return "왜 중고거래 플랫폼은 오프라인 검수까지 열까?";
  }

  if (hasAny(candidate, ["다이소", "뷰티"])) {
    return "왜 다이소는 뷰티를 따로 보이게 할까?";
  }

  if (hasAny(candidate, ["olive better", "웰니스", "오프라인 매장"])) {
    return "왜 웰니스는 따로 매장이 필요했을까?";
  }

  if (hasAny(candidate, ["베이커리", "구독", "픽업"])) {
    return "왜 동네 빵집은 구독 픽업 선반을 만들까?";
  }

  const compactTopic = compactTopicName(candidate);

  if (candidate.category === "앱/프로덕트") {
    return `${compactTopic}은 왜 반복 사용을 먼저 설계할까?`;
  }

  if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    return `${compactTopic}은 왜 굳이 오프라인 장면을 만들까?`;
  }

  if (candidate.category === "스타트업/투자") {
    return `${compactTopic}은 어떤 불편에 돈이 몰린 걸까?`;
  }

  if (candidate.category === "소비자 트렌드") {
    return `${compactTopic}은 어떤 마음을 건드린 걸까?`;
  }

  const cleaned = stripGenericQuestionLanguage(candidate.coreWhyGudiQuestion);
  return cleaned.length > 0 ? cleaned : `${compactTopic}은 왜 지금 흥미로운 걸까?`;
}

export function chooseStyleReference(candidate: ScoutCandidate): WritingBriefStyleReference {
  if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    return "retail-observation";
  }

  if (candidate.category === "앱/프로덕트") {
    return "product-observation";
  }

  if (candidate.category === "스타트업/투자") {
    return "startup-observation";
  }

  if (candidate.category === "소비자 트렌드") {
    return "consumer-behavior-observation";
  }

  return "business-observation";
}

export function inferCoreTension(candidate: ScoutCandidate): string {
  if (isMeditationAccountabilityCase(candidate)) {
    return "명상은 본래 혼자 조용히 하는 행위인데, 이 앱은 오히려 친구의 확인을 전면에 둔다.";
  }

  if (candidate.category === "앱/프로덕트") {
    return `사용자는 '${candidate.topicName}'의 기능을 원하지만, 앱은 기능 사용보다 반복 방문과 행동 지속을 더 먼저 설계해야 한다.`;
  }

  if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    return `온라인에서 더 빠르게 살 수 있는 시대에, '${candidate.topicName}'은 굳이 오프라인 경험이나 브랜드 장면을 만들어야 한다.`;
  }

  if (candidate.category === "스타트업/투자") {
    return `스타트업 소식은 성장 서사로 읽히기 쉽지만, '${candidate.topicName}'에서 봐야 할 것은 시장이 실제로 어떤 문제에 돈을 쓰기 시작했는지다.`;
  }

  if (candidate.category === "소비자 트렌드") {
    return `개인의 취향처럼 보이는 '${candidate.topicName}'이 사실은 주변 시선, 비교, 자기관리 압력과 연결될 수 있다.`;
  }

  return `'${candidate.topicName}'은 단순한 새 소식처럼 보이지만, 사용자가 왜 굳이 이 선택을 하는지 설명해야 글감이 된다.`;
}

export function inferBusinessMechanism(candidate: ScoutCandidate): string {
  if (isMeditationAccountabilityCase(candidate)) {
    return "콘텐츠 경쟁이 아니라 habit retention과 accountability를 설계하는 방식이다. 명상을 더 많이 공급하는 대신, 사용자가 다시 돌아오고 약속을 끊지 않게 만드는 장치를 전면에 둔다.";
  }

  if (candidate.category === "앱/프로덕트") {
    return `핵심은 기능 추가보다 사용 빈도를 만드는 루프다. '${candidate.topicName}'이 알림, 기록, 공유, 보상 중 무엇으로 retention을 만들려는지 확인해야 한다.`;
  }

  if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    return `매장의 역할을 판매 채널이 아니라 브랜드 신뢰, 체류 시간, 재방문 이유를 만드는 장치로 바꾸는 실험일 수 있다. 실제 전환이나 객단가 효과는 추가 확인이 필요하다.`;
  }

  if (candidate.category === "스타트업/투자") {
    return `투자 뉴스 자체보다 중요한 것은 어떤 고객군의 예산이 새 카테고리로 이동하는지다. 수익 모델, 반복 구매, 세일즈 사이클이 맞물릴 때 비즈니스 메커니즘이 설명된다.`;
  }

  if (candidate.category === "소비자 트렌드") {
    return `트렌드 확산은 취향의 문제가 아니라 반복 구매, 인증 가능성, 소속감 같은 행동 비용을 낮추는 구조가 있을 때 강해진다.`;
  }

  return `이 사례의 비즈니스 메커니즘은 '${candidate.businessObservationAngle}'이라는 관찰을 실제 고객 행동과 수익 구조로 연결할 때 드러난다.`;
}

export function inferConsumerPsychology(candidate: ScoutCandidate): string {
  if (isMeditationAccountabilityCase(candidate)) {
    return "사람은 의지만으로 루틴을 지속하기 어렵고, 누군가가 확인할 때 행동을 개인 목표가 아니라 작은 약속처럼 느낀다.";
  }

  if (candidate.category === "앱/프로덕트") {
    return "사용자는 좋은 기능을 발견했다고 계속 쓰지 않는다. 다시 켜야 할 이유가 즉시 떠오르거나, 끊으면 손해처럼 느껴질 때 습관이 된다.";
  }

  if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    return "소비자는 물건만 사러 가지 않는다. 직접 보고, 비교하고, 사진으로 남기고, 내가 이 브랜드를 고른 이유를 스스로 납득하려고 공간을 찾는다.";
  }

  if (candidate.category === "스타트업/투자") {
    return "새 서비스가 설득력을 얻는 순간은 사용자가 문제를 멋진 혁신으로 이해할 때가 아니라, 기존 방식의 불편을 더 이상 당연하게 여기지 않을 때다.";
  }

  if (candidate.category === "소비자 트렌드") {
    return "소비자는 합리적 필요만으로 움직이지 않는다. 남들이 알아봐 주는 신호, 나답다는 느낌, 뒤처지지 않는 안도감이 선택을 밀어준다.";
  }

  return candidate.consumerBehaviorAngle;
}

export function inferNonObviousInsight(candidate: ScoutCandidate): string {
  if (isMeditationAccountabilityCase(candidate)) {
    return "웰니스 앱의 다음 경쟁은 더 깊은 명상 콘텐츠가 아니라, 혼자 해야 하는 행동을 사회적 책임감으로 바꾸는 설계일 수 있다.";
  }

  if (candidate.category === "앱/프로덕트") {
    return `이 사례에서 봐야 할 것은 '${candidate.topicName}'의 새 기능이 아니라, 사용자가 앱 밖의 생활 맥락에서 다시 앱을 떠올리게 만드는 순간이다.`;
  }

  if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    return "오프라인은 온라인의 반대가 아니라, 브랜드가 소비자의 확신을 빌리는 증거 장치가 되고 있다.";
  }

  if (candidate.category === "스타트업/투자") {
    return "투자 유치보다 중요한 신호는 투자자가 본 시장의 크기가 아니라, 고객이 이미 감수하고 있는 비효율의 강도다.";
  }

  if (candidate.category === "소비자 트렌드") {
    return "트렌드는 새로움 때문에 퍼지는 것이 아니라, 사람들이 이미 느끼던 불편이나 욕망에 이름을 붙일 때 빠르게 설명 가능해진다.";
  }

  return `겉으로는 ${candidate.oneLineSummary}처럼 보이지만, 글에서는 '${candidate.coreWhyGudiQuestion}'에 답하는 행동 구조를 찾아야 한다.`;
}

export function inferSharpThesis(candidate: ScoutCandidate): string {
  if (isMeditationAccountabilityCase(candidate)) {
    return "이 기능의 핵심은 명상을 더 잘하게 하는 것이 아니라, 명상을 계속하게 만드는 것일 수 있다.";
  }

  if (candidate.category === "앱/프로덕트") {
    return `좋은 앱은 문제를 해결하는 데서 끝나지 않고, 사용자가 그 문제를 다시 방치하지 못하게 만드는 구조를 만든다.`;
  }

  if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    return "요즘 오프라인의 가치는 판매 면적이 아니라, 소비자가 브랜드를 믿어도 된다고 느끼는 장면을 만드는 데 있다.";
  }

  if (candidate.category === "스타트업/투자") {
    return "이 스타트업 사례는 기술보다 먼저, 어떤 비효율이 이제 돈을 내고 해결할 만큼 불편해졌는지를 보여준다.";
  }

  if (candidate.category === "소비자 트렌드") {
    return "소비자 트렌드는 취향의 변화처럼 보이지만, 실제로는 사람들이 자신을 설명하는 방식을 바꾸는 사건에 가깝다.";
  }

  return `이 글의 주장은 '${candidate.topicName}'이 흥미롭다는 말이 아니라, 그 선택 뒤에 있는 소비자와 비즈니스의 압력을 드러내는 것이다.`;
}

export function inferGenericThesisToAvoid(candidate: ScoutCandidate): string[] {
  const avoid = [
    "소비자는 경험을 산다",
    "커뮤니티가 중요하다",
    "브랜드는 진정성이 필요하다"
  ];

  if (candidate.category === "앱/프로덕트") {
    avoid.unshift("앱이 생활 루틴으로 들어간다", "소비자는 습관에 돈을 쓴다");
  }

  if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    avoid.unshift("오프라인 경험이 중요하다", "팝업은 MZ세대를 겨냥한다");
  }

  if (candidate.category === "스타트업/투자") {
    avoid.unshift("AI가 산업을 바꾼다", "시장이 빠르게 성장하고 있다");
  }

  if (candidate.category === "소비자 트렌드") {
    avoid.unshift("요즘 소비자는 다르다", "개인화가 중요하다");
  }

  return [...new Set(avoid)];
}

export function inferBetterOpeningScene(candidate: ScoutCandidate): string {
  if (isMeditationAccountabilityCase(candidate)) {
    return "실제 화면에서 친구 체크인이 개인 세션보다 더 잘 보이는 위치에 있다면, 그 장면에서 시작한다.";
  }

  if (candidate.category === "앱/프로덕트") {
    return `앱 화면에서 반복 사용을 유도하는 장치가 확인되면, 사용자가 며칠 뒤 다시 '${candidate.topicName}'을 켜는 장면에서 시작한다.`;
  }

  if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    if (isUnverifiedSource(candidate)) {
      return `실제 매장 사진이나 방문 동선이 확인되면, 사람들이 굳이 '${candidate.topicName}' 앞에 서 있는 장면에서 시작한다.`;
    }

    return `사람들이 굳이 시간을 내서 '${candidate.topicName}' 앞에 서 있는 장면에서 시작하고, 그들이 무엇을 확인하러 왔는지 묻는다.`;
  }

  if (candidate.category === "스타트업/투자") {
    return `투자 금액보다 먼저, 이 회사가 해결한다는 문제가 실제 현장에서 어떤 귀찮음으로 반복되는지 한 장면을 잡는다.`;
  }

  return `기사 제목을 요약하지 말고, '${candidate.coreWhyGudiQuestion}'이 떠오르는 사용자 행동 한 컷에서 시작한다.`;
}

export function inferEvidenceNeeded(candidate: ScoutCandidate): string[] {
  const evidence = [
    `원문 출처에서 '${candidate.topicName}'이 실제로 제공하거나 발표한 기능/실험의 정확한 범위 확인`,
    "공식 페이지, 앱 화면, 보도자료 중 하나로 사실관계 재확인"
  ];

  if (isMeditationAccountabilityCase(candidate)) {
    evidence.push(
      "친구 체크인이 단순 공유인지, 실제 reminder/accountability 루프인지 확인",
      "앱 화면이나 공식 설명에서 체크인 알림, streak, 친구 피드백 구조 확인"
    );
  } else if (candidate.category === "앱/프로덕트") {
    evidence.push("retention, 알림, 기록, 공유 기능 중 어떤 장치가 있는지 앱 화면 기준으로 확인");
  } else if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    evidence.push("오프라인 공간의 위치, 운영 기간, 방문 동선, 구매 전환 장치 확인");
  } else if (candidate.category === "스타트업/투자") {
    evidence.push("고객군, 수익 모델, 투자금 사용처, 실제 traction 관련 공개 근거 확인");
  }

  return evidence;
}

export function inferEvidenceBoundary(candidate: ScoutCandidate): WritingBrief["evidenceBoundary"] {
  const confirmedFacts = [
    `입력 출처는 '${candidate.topicName}'을 소재 후보로 제시한다.`,
    `출처 요약: ${candidate.oneLineSummary}`
  ];

  const reasonableInferences = [
    inferCoreTension(candidate),
    inferBusinessMechanism(candidate),
    inferConsumerPsychology(candidate)
  ];

  const needsVerification = inferEvidenceNeeded(candidate);

  if (candidate.category === "앱/프로덕트") {
    needsVerification.push("실제 앱 화면에서 기능 위치와 노출 우선순위 확인");
  }

  if (isUnverifiedSource(candidate)) {
    needsVerification.push("현재 후보가 샘플/수동 입력 기반이면 실제 공개 출처로 교체");
  }

  return {
    confirmedFacts: [...new Set(confirmedFacts)],
    reasonableInferences: [...new Set(reasonableInferences)],
    needsVerification: [...new Set(needsVerification)]
  };
}

function postOutlineFor(candidate: ScoutCandidate): string[] {
  if (isMeditationAccountabilityCase(candidate)) {
    return [
      "명상 앱은 혼자 조용히 쓰는 앱이라고 생각했다.",
      "그런데 이 후보는 개인 세션보다 친구 체크인을 더 앞세우는 선택을 보여준다.",
      "처음엔 이상하다. 명상에 왜 친구가 필요하지?",
      "생각해보면 명상 앱의 진짜 문제는 콘텐츠 부족이 아니라 이탈일 수 있다.",
      "혼자 하는 명상은 쉽게 미뤄지지만, 친구가 확인하면 작은 약속이 된다.",
      "그래서 이 기능은 명상을 더 잘하게 하는 기능이라기보다 명상을 계속하게 만드는 retention 장치일 수 있다.",
      "다만 너무 소셜해지면 명상의 본질인 개인적 고요함과 충돌할 수도 있다.",
      "결국 이 실험은 웰니스 앱이 콘텐츠 앱에서 습관 설계 제품으로 이동하는 장면일 수 있다."
    ];
  }

  if (candidate.category === "앱/프로덕트") {
    return [
      `처음에는 '${candidate.topicName}'을 단순한 새 기능 소식처럼 본다.`,
      "그런데 앱에서 중요한 것은 기능이 있다는 사실보다 사용자가 다시 돌아오는 이유다.",
      `여기서 질문은 '${inferRefinedCoreQuestion(candidate)}'로 좁혀진다.`,
      "사용자는 좋은 기능을 발견해도 바쁘면 금방 잊는다.",
      "그래서 앱은 알림, 기록, 공유, 보상 같은 장치로 행동을 다시 불러와야 한다.",
      inferBusinessMechanism(candidate),
      inferConsumerPsychology(candidate),
      "다만 실제 화면과 사용 흐름을 확인하기 전까지는 전략을 단정하지 않는다.",
      inferSharpThesis(candidate)
    ];
  }

  if (candidate.category === "리테일/브랜드" || candidate.category === "팝업/오프라인") {
    return [
      `처음에는 '${candidate.topicName}'을 또 하나의 오프라인 이벤트처럼 볼 수 있다.`,
      "그런데 굳이 공간을 만들었다면, 그 공간은 판매 이상의 역할을 해야 한다.",
      `질문은 '${inferRefinedCoreQuestion(candidate)}'로 좁혀진다.`,
      "온라인에서는 가격과 정보가 빠르지만, 신뢰와 확신은 여전히 장면을 필요로 한다.",
      "사람들은 제품을 보러 가는 동시에 내가 왜 이 브랜드를 믿어도 되는지 확인한다.",
      inferBusinessMechanism(candidate),
      "다만 방문 동선, 운영 기간, 실제 구매 전환은 아직 확인해야 한다.",
      inferSharpThesis(candidate)
    ];
  }

  return [
    `먼저 '${candidate.topicName}'을 뉴스가 아니라 한 사람의 선택 장면으로 바꿔 본다.`,
    `질문은 '${inferRefinedCoreQuestion(candidate)}'로 좁힌다.`,
    inferCoreTension(candidate),
    "그 다음 이 선택이 쉬운 선택인지, 불편을 감수하는 선택인지 따져 본다.",
    inferBusinessMechanism(candidate),
    inferConsumerPsychology(candidate),
    "출처에 없는 성과나 내부 전략은 확인 필요로 남긴다.",
    "반론이 되는 지점을 먼저 적어 과한 해석을 줄인다.",
    inferSharpThesis(candidate)
  ];
}

function possibleStructureFor(candidate: ScoutCandidate): string[] {
  return postOutlineFor(candidate);
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

export function toWritingBrief(candidate: ScoutCandidate): WritingBrief {
  return {
    topicName: candidate.topicName,
    coreWhyGudiQuestion: candidate.coreWhyGudiQuestion,
    refinedCoreQuestion: inferRefinedCoreQuestion(candidate),
    oneLineSummary: candidate.oneLineSummary,
    businessObservationAngle: candidate.businessObservationAngle,
    consumerBehaviorAngle: candidate.consumerBehaviorAngle,
    coreTension: inferCoreTension(candidate),
    nonObviousInsight: inferNonObviousInsight(candidate),
    businessMechanism: inferBusinessMechanism(candidate),
    consumerPsychology: inferConsumerPsychology(candidate),
    sharpThesis: inferSharpThesis(candidate),
    genericThesisToAvoid: inferGenericThesisToAvoid(candidate),
    betterOpeningScene: inferBetterOpeningScene(candidate),
    postOutline: postOutlineFor(candidate),
    evidenceNeeded: inferEvidenceNeeded(candidate),
    evidenceBoundary: inferEvidenceBoundary(candidate),
    possibleStructure: possibleStructureFor(candidate),
    counterArguments: counterArgumentsFor(candidate),
    sourceUrls: [candidate.sourceUrl],
    recommendedFormat: candidate.recommendedFormat,
    styleReference: chooseStyleReference(candidate)
  };
}

type DeepBriefFields = Pick<
  WritingBrief,
  | "coreTension"
  | "refinedCoreQuestion"
  | "nonObviousInsight"
  | "businessMechanism"
  | "consumerPsychology"
  | "sharpThesis"
  | "genericThesisToAvoid"
  | "betterOpeningScene"
  | "postOutline"
  | "evidenceNeeded"
  | "evidenceBoundary"
  | "styleReference"
>;

const styleReferences = new Set<WritingBriefStyleReference>([
  "business-observation",
  "product-observation",
  "retail-observation",
  "startup-observation",
  "consumer-behavior-observation"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFromRecord(record: Record<string, unknown>, key: keyof DeepBriefFields): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayFromRecord(record: Record<string, unknown>, key: keyof DeepBriefFields): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items.map((item) => item.trim()) : undefined;
}

function stringArrayFromKey(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items.map((item) => item.trim()) : undefined;
}

function styleReferenceFromRecord(
  record: Record<string, unknown>,
  fallback: WritingBriefStyleReference
): WritingBriefStyleReference {
  const value = record.styleReference;
  if (typeof value === "string" && styleReferences.has(value as WritingBriefStyleReference)) {
    return value as WritingBriefStyleReference;
  }

  return fallback;
}

function evidenceBoundaryFromRecord(
  record: Record<string, unknown>,
  fallback: WritingBrief["evidenceBoundary"]
): WritingBrief["evidenceBoundary"] {
  const value = record.evidenceBoundary;
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    confirmedFacts: stringArrayFromKey(value, "confirmedFacts") ?? fallback.confirmedFacts,
    reasonableInferences: stringArrayFromKey(value, "reasonableInferences") ?? fallback.reasonableInferences,
    needsVerification: stringArrayFromKey(value, "needsVerification") ?? fallback.needsVerification
  };
}

function normalizeBriefQuality(brief: WritingBrief): WritingBrief {
  const refinedCoreQuestion = stripGenericQuestionLanguage(brief.refinedCoreQuestion);
  const postOutline = brief.postOutline.length >= 7 ? brief.postOutline : brief.possibleStructure;

  return {
    ...brief,
    refinedCoreQuestion: refinedCoreQuestion.length > 0 ? refinedCoreQuestion : brief.coreWhyGudiQuestion,
    postOutline: postOutline.length >= 7 ? postOutline : brief.postOutline,
    possibleStructure: postOutline.length >= 7 ? postOutline : brief.possibleStructure
  };
}

function mergeDeepBriefFields(base: WritingBrief, value: unknown): WritingBrief {
  if (!isRecord(value)) {
    return base;
  }

  return normalizeBriefQuality({
    ...base,
    refinedCoreQuestion: stringFromRecord(value, "refinedCoreQuestion") ?? base.refinedCoreQuestion,
    coreTension: stringFromRecord(value, "coreTension") ?? base.coreTension,
    nonObviousInsight: stringFromRecord(value, "nonObviousInsight") ?? base.nonObviousInsight,
    businessMechanism: stringFromRecord(value, "businessMechanism") ?? base.businessMechanism,
    consumerPsychology: stringFromRecord(value, "consumerPsychology") ?? base.consumerPsychology,
    sharpThesis: stringFromRecord(value, "sharpThesis") ?? base.sharpThesis,
    genericThesisToAvoid: stringArrayFromRecord(value, "genericThesisToAvoid") ?? base.genericThesisToAvoid,
    betterOpeningScene: stringFromRecord(value, "betterOpeningScene") ?? base.betterOpeningScene,
    postOutline: stringArrayFromRecord(value, "postOutline") ?? base.postOutline,
    evidenceNeeded: stringArrayFromRecord(value, "evidenceNeeded") ?? base.evidenceNeeded,
    evidenceBoundary: evidenceBoundaryFromRecord(value, base.evidenceBoundary),
    possibleStructure: stringArrayFromRecord(value, "postOutline") ?? base.possibleStructure,
    styleReference: styleReferenceFromRecord(value, base.styleReference)
  });
}

function buildDeepBriefPrompt(candidate: ScoutCandidate): string {
  return [
    "너는 LinkedIn 글쓰기용 전략 편집자다.",
    "최종 글을 쓰지 않는다. 선택된 소재를 더 날카로운 writing brief로 만든다.",
    "뻔한 일반론을 금지한다. 모든 앱/브랜드에 붙을 수 있는 문장은 실패다.",
    "반드시 이 사례에서만 나올 수 있는 tension, non-obvious insight, business mechanism, consumer psychology를 찾아라.",
    "출처에 없는 사실은 invent하지 말고 evidenceNeeded로 분리해라.",
    "학생 분석가가 쓸 수 있는 수준으로 표현하되, 인사이트는 얕으면 안 된다.",
    "핵심 질문은 refinedCoreQuestion에 20~35자 내외의 자연스러운 한국어 질문으로 다시 써라.",
    "postOutline은 모든 섹션을 반복하지 말고 실제 LinkedIn 글의 전개처럼 7~9개 bullet로 써라.",
    "확인된 사실과 추론을 evidenceBoundary.confirmedFacts, evidenceBoundary.reasonableInferences, evidenceBoundary.needsVerification로 분리해라.",
    "출처에 없는 화면, 성과, 내부 전략, 유저 반응을 단정하지 마라.",
    "'기능 제공을 넘어', '생활 루틴', '흐름으로 해석', '소비자는 ~하기 시작한다' 같은 일반론 문장을 피하라.",
    "",
    "아래 JSON key만 반환해라. Markdown 금지.",
    "refinedCoreQuestion, coreTension, nonObviousInsight, businessMechanism, consumerPsychology, sharpThesis, genericThesisToAvoid, betterOpeningScene, postOutline, evidenceNeeded, evidenceBoundary, styleReference",
    "evidenceBoundary는 confirmedFacts, reasonableInferences, needsVerification 배열을 가진 객체다.",
    "styleReference는 business-observation, product-observation, retail-observation, startup-observation, consumer-behavior-observation 중 하나만 쓴다.",
    "",
    JSON.stringify(
      {
        id: candidate.id,
        category: candidate.category,
        topicName: candidate.topicName,
        oneLineSummary: candidate.oneLineSummary,
        coreWhyGudiQuestion: candidate.coreWhyGudiQuestion,
        businessObservationAngle: candidate.businessObservationAngle,
        consumerBehaviorAngle: candidate.consumerBehaviorAngle,
        sourceName: candidate.sourceName,
        sourceUrl: candidate.sourceUrl,
        recommendedFormat: candidate.recommendedFormat
      },
      null,
      2
    )
  ].join("\n");
}

async function requestDeepBriefFromLlm(candidate: ScoutCandidate): Promise<unknown | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content:
            "You create strategic writing briefs as strict JSON. You do not write final posts and you do not invent unsupported facts."
        },
        {
          role: "user",
          content: buildDeepBriefPrompt(candidate)
        }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI deep brief request failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as unknown;
  if (!isRecord(body)) {
    return undefined;
  }

  const choices = body.choices;
  if (!Array.isArray(choices) || !isRecord(choices[0])) {
    return undefined;
  }

  const message = choices[0].message;
  if (!isRecord(message) || typeof message.content !== "string") {
    return undefined;
  }

  return JSON.parse(message.content) as unknown;
}

export async function toWritingBriefWithLlm(candidate: ScoutCandidate): Promise<WritingBrief> {
  const fallback = toWritingBrief(candidate);

  try {
    const deepBrief = await requestDeepBriefFromLlm(candidate);
    return mergeDeepBriefFields(fallback, deepBrief);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Deep brief LLM fallback for ${candidate.id}: ${message}\n`);
    return fallback;
  }
}

function renderList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

export function renderWritingBrief(brief: WritingBrief): string {
  return [
    `# Writing Brief: ${brief.topicName}`,
    "",
    "## 핵심 질문",
    "",
    brief.refinedCoreQuestion || brief.coreWhyGudiQuestion,
    "",
    "## Core Tension",
    "",
    brief.coreTension,
    "",
    "## Sharp Thesis",
    "",
    brief.sharpThesis,
    "",
    "## Non-obvious Insight",
    "",
    brief.nonObviousInsight,
    "",
    "## Business Mechanism",
    "",
    brief.businessMechanism,
    "",
    "## Consumer Psychology",
    "",
    brief.consumerPsychology,
    "",
    "## Better Opening Scene",
    "",
    brief.betterOpeningScene,
    "",
    "## 확인된 사실 / 추론 / 확인 필요",
    "",
    "### 확인된 사실",
    "",
    renderList(brief.evidenceBoundary.confirmedFacts),
    "",
    "### 합리적 추론",
    "",
    renderList(brief.evidenceBoundary.reasonableInferences),
    "",
    "### 확인 필요",
    "",
    renderList(brief.evidenceBoundary.needsVerification),
    "",
    "## 글 구조",
    "",
    renderList(brief.postOutline),
    "",
    "## 피해야 할 뻔한 결론",
    "",
    renderList(brief.genericThesisToAvoid),
    "",
    "## 반론 / 조심할 점",
    "",
    renderList(brief.counterArguments),
    "",
    "## 필요한 추가 조사",
    "",
    renderList(brief.evidenceNeeded),
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

export function renderResearchTask(candidate: ScoutCandidate): string {
  return [
    `# Research Task: ${candidate.topicName}`,
    "",
    "## 필요한 확인",
    "",
    "- 실제 서비스/브랜드명",
    "- 공식 페이지 또는 기사 URL",
    "- 기능이 실제로 존재하는지",
    "- 앱 화면/제품 화면에서 어디에 노출되는지",
    "",
    "## 현재 후보",
    "",
    `- topicName: ${candidate.topicName}`,
    `- sourceUrl: ${candidate.sourceUrl}`,
    `- sourceName: ${candidate.sourceName}`,
    `- oneLineSummary: ${candidate.oneLineSummary}`,
    `- verificationStatus: ${candidate.verificationStatus}`,
    `- verificationNotes: ${candidate.verificationNotes ?? ""}`,
    ""
  ].join("\n");
}

export async function writeWritingBriefForCandidate(
  candidate: ScoutCandidate,
  options: { date?: string; outputDir?: string; useLlm?: boolean } = {}
): Promise<string> {
  const date = options.date ?? todayIsoDate();
  const outputDir = options.outputDir ?? DEFAULT_WRITING_BRIEF_OUTPUT_DIR;
  await mkdir(resolve(outputDir), { recursive: true });

  if (candidate.verificationStatus !== "verified" || !candidate.briefAllowed) {
    process.stderr.write("Skipped writing brief: candidate requires real service/source verification.\n");
    const filename = `${date}-research-task-${slugifyFilePart(candidate.topicName)}.md`;
    const outputPath = resolve(join(outputDir, filename));
    const task = createResearchTaskFromCandidate(candidate);
    await writeFile(outputPath, renderResearchTaskMarkdown(task, candidate), "utf8");
    return outputPath;
  }

  const brief = options.useLlm ? await toWritingBriefWithLlm(candidate) : toWritingBrief(candidate);
  const filename = `${date}-${slugifyFilePart(candidate.topicName)}.md`;
  const outputPath = resolve(join(outputDir, filename));
  await writeFile(outputPath, renderWritingBrief(brief), "utf8");
  return outputPath;
}

export async function writeWritingBriefForCandidateId(
  candidateId: string,
  options: { inputPath?: string; feedbackPath?: string; outputDir?: string; date?: string; useLlm?: boolean } = {}
): Promise<string | undefined> {
  const input = await readFile(resolve(options.inputPath ?? DEFAULT_INPUT_PATH), "utf8");
  const parsed: unknown = JSON.parse(input);
  assertRawSourceItems(parsed);

  const memory = await readFeedbackMemory(options.feedbackPath);
  const candidates = processRawCandidates(parsed, parsed.length, memory);
  const candidate = candidates.find((item) => item.id === candidateId || item.candidateId === candidateId);

  if (!candidate) {
    return undefined;
  }

  return writeWritingBriefForCandidate(candidate, {
    date: options.date,
    outputDir: options.outputDir,
    useLlm: options.useLlm
  });
}

export async function writeResearchTaskForCandidateId(
  candidateId: string,
  options: { inputPath?: string; feedbackPath?: string; outputDir?: string; date?: string } = {}
): Promise<string | undefined> {
  const input = await readFile(resolve(options.inputPath ?? DEFAULT_INPUT_PATH), "utf8");
  const parsed: unknown = JSON.parse(input);
  assertRawSourceItems(parsed);

  const memory = await readFeedbackMemory(options.feedbackPath);
  const candidates = processRawCandidates(parsed, parsed.length, memory);
  const candidate = candidates.find((item) => item.id === candidateId || item.candidateId === candidateId);

  if (!candidate) {
    return undefined;
  }

  const date = options.date ?? todayIsoDate();
  const outputDir = options.outputDir ?? DEFAULT_WRITING_BRIEF_OUTPUT_DIR;
  await mkdir(resolve(outputDir), { recursive: true });
  const filename = `${date}-research-task-${slugifyFilePart(candidate.topicName)}.md`;
  const outputPath = resolve(join(outputDir, filename));
  const task = createResearchTaskFromCandidate(candidate);
  await writeFile(outputPath, renderResearchTaskMarkdown(task, candidate), "utf8");
  return outputPath;
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
    const outputPath = await writeWritingBriefForCandidate(candidate, {
      date: options.date,
      outputDir: options.outputDir,
      useLlm: options.useLlm
    });
    const label = outputPath.includes("research-task-") ? "Exported research task" : "Exported writing brief";
    process.stdout.write(`${label}: ${outputPath}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Writing brief export failed: ${message}\n`);
    process.exitCode = 1;
  });
}
