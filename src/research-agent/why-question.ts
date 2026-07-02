import type { CandidateCategory, RawSourceItem } from "./types.ts";

function topicFromTitle(title: string): string {
  const trimmed = title.trim();
  const replacements: Array<[RegExp, string]> = [
    [/하는 사례$/u, "하는 선택"],
    [/한 사례$/u, "한 선택"],
    [/된 사례$/u, "된 선택"],
    [/는 사례$/u, "는 선택"],
    [/운영하는 사례$/u, "운영하는 선택"],
    [/사례$/u, ""]
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, replacement).trim();
    }
  }

  return trimmed;
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function generateTopicName(item: RawSourceItem): string {
  return topicFromTitle(item.title);
}

export function generateOneLineSummary(item: RawSourceItem): string {
  const summary = item.rawSummary?.trim();
  if (!summary) {
    return `${topicFromTitle(item.title)}에서 LinkedIn 비즈니스 관찰기로 확장할 수 있는 신호가 보인다.`;
  }

  const firstSentence = summary.split(/[.!?。]\s*/u)[0]?.trim();
  return firstSentence && firstSentence.length <= 130
    ? firstSentence
    : `${summary.slice(0, 127).trim()}...`;
}

export function generateWhyGudiQuestion(item: RawSourceItem, category: CandidateCategory): string {
  const topic = topicFromTitle(item.title);
  const text = `${item.title} ${item.rawSummary ?? ""}`;

  if (hasAny(text, ["오프라인", "팝업", "매장", "부스", "카페"])) {
    return `${topic}은 왜 굳이 온라인 설명이 아니라 오프라인 장면으로 소비자를 만나려는 걸까?`;
  }

  if (hasAny(text, ["앱", "플랫폼", "기능", "디지털"])) {
    return `${topic}은 왜 굳이 기능 제공을 넘어 생활 루틴 안으로 들어가려는 걸까?`;
  }

  if (hasAny(text, ["투자", "스타트업", "SaaS"])) {
    return `${topic}은 왜 굳이 지금 이 문제를 별도 스타트업의 기회로 만들고 있을까?`;
  }

  if (category === "소비자 트렌드") {
    return `${topic}은 왜 굳이 단순 소비가 아니라 새로운 생활 방식처럼 나타나고 있을까?`;
  }

  if (category === "핀테크/금융") {
    return `${topic}은 왜 굳이 금융 상품을 생활 관리 경험처럼 바꾸려는 걸까?`;
  }

  return `${topic}은 왜 굳이 기존 방식 대신 이런 선택을 하고 있을까?`;
}

export function generateBusinessObservationAngle(
  item: RawSourceItem,
  category: CandidateCategory
): string {
  const text = `${item.title} ${item.rawSummary ?? ""}`;

  if (category === "리테일/브랜드" || category === "팝업/오프라인") {
    return "이 사례는 오프라인 공간을 단순 판매 채널이 아니라 신뢰, 발견, 반복 방문을 설계하는 장치로 볼 수 있다.";
  }

  if (category === "스타트업/투자") {
    return "이 사례는 투자 소식 자체보다 어떤 생활 문제를 비즈니스 모델로 재정의했는지를 보는 쪽이 더 흥미롭다.";
  }

  if (category === "앱/프로덕트") {
    return "이 사례는 앱이 기능 묶음에서 사용자의 반복 루틴을 잡는 제품으로 이동하는 흐름으로 해석할 수 있다.";
  }

  if (category === "대기업 신사업") {
    return "이 사례는 대기업이 기존 유통망이나 고객 접점을 이용해 새로운 카테고리 실험을 하는 방식으로 볼 수 있다.";
  }

  if (text.includes("선물")) {
    return "이 사례는 기능성 상품이 효능보다 포장, 맥락, 관계를 통해 더 넓은 시장으로 이동하는 흐름으로 볼 수 있다.";
  }

  return "이 사례는 제품 자체보다 포지셔닝, 유통, 수익모델, 고객 접점의 선택을 관찰하는 소재로 쓸 수 있다.";
}

export function generateConsumerBehaviorAngle(item: RawSourceItem): string {
  const text = `${item.title} ${item.rawSummary ?? ""}`;

  if (hasAny(text, ["신뢰", "진단", "검수", "상담"])) {
    return "소비자는 정보가 많을수록 더 빨리 사는 것이 아니라, 믿을 수 있는 확인 장치를 찾는 쪽으로 움직일 수 있다.";
  }

  if (hasAny(text, ["선물", "패키지", "감도"])) {
    return "소비자는 기능만 비교하지 않고, 상대에게 건넬 수 있는 모양과 메시지를 함께 구매한다.";
  }

  if (hasAny(text, ["루틴", "구독", "반복", "체크인"])) {
    return "소비자는 한 번의 구매보다 반복 가능한 습관과 관리받는 느낌에 돈을 쓰기 시작한다.";
  }

  if (hasAny(text, ["혼자", "휴식", "혼밥"])) {
    return "혼자 있는 시간이 결핍이 아니라 직접 설계하고 구매하는 생활 단위가 되고 있다.";
  }

  return "소비자는 가격이나 기능만이 아니라 발견, 비교, 안심, 방문 이유 같은 맥락을 함께 선택한다.";
}

export function generateConnectionToExistingPosts(item: RawSourceItem): string {
  const text = `${item.title} ${item.rawSummary ?? ""}`;

  if (hasAny(text, ["Olive", "올리브", "웰니스", "건강", "진단"])) {
    return "Olive Better 글의 연장선에서 웰니스, 신뢰, 오프라인 존재 이유를 비교하는 후속 소재가 될 수 있다.";
  }

  if (hasAny(text, ["대학", "학생", "청년", "유학생", "커리어"])) {
    return "학생 관찰자 입장에서 생활과 커리어가 서비스로 번역되는 방식을 다루기 좋다.";
  }

  if (hasAny(text, ["앱", "플랫폼", "AI", "디지털"])) {
    return "AI와 앱이 사람의 반복 행동을 어떻게 설계하는지에 대한 기존 문제의식과 연결된다.";
  }

  return "기존 비즈니스 관찰기 톤처럼 구체 사례에서 출발해 더 큰 구조를 조용히 설명하는 소재로 연결할 수 있다.";
}
