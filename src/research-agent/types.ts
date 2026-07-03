export type Country = "KR" | "GLOBAL" | "US" | "JP" | "EU" | "UNKNOWN";

export type RawSourceCategory =
  | "startup_news"
  | "investment_news"
  | "retail_brand"
  | "popup_offline"
  | "big_company_experiment"
  | "app_product_update"
  | "consumer_trend"
  | "global_case"
  | "manual";

export type RawSourceItem = {
  id?: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt?: string;
  rawSummary?: string;
  country?: Country;
  sourceCategory: RawSourceCategory;
  collectedAt: string;
};

export type CandidateStatus =
  | "new"
  | "shortlisted"
  | "selected"
  | "written"
  | "published"
  | "rejected";

export type FeedbackLabel =
  | "바로 글 가능"
  | "좋은데 추가조사 필요"
  | "직접 방문하면 좋음"
  | "너무 뉴스 같음"
  | "너무 어려움"
  | "내 톤 아님"
  | "너무 겹침"
  | "구체성이 약함"
  | "왜 굳이 약함"
  | "소비자 행동 관점 약함"
  | "비즈니스 각도 약함";

export type ScoreBreakdown = {
  concreteCase: number;
  whyGudiStrength: number;
  consumerBehaviorPotential: number;
  businessInterpretability: number;
  dahyeongFit: number;
  novelty: number;
  sourceReliability: number;
  visitabilityBonus: number;
};

export type CandidateCategory =
  | "리테일/브랜드"
  | "팝업/오프라인"
  | "스타트업/투자"
  | "대기업 신사업"
  | "앱/프로덕트"
  | "소비자 트렌드"
  | "핀테크/금융"
  | "글로벌 비교"
  | "커리어/네트워크";

export type OverlapRisk = "낮음" | "중간" | "높음";

export type RecommendedFormat =
  | "장문 관찰기"
  | "짧은 포스트"
  | "캐러셀"
  | "비교글"
  | "저장만";

export type VisitPossible = "가능" | "불가능" | "확인 필요" | "중요하지 않음";

export type NextAction =
  | "채택 검토"
  | "추가 조사"
  | "직접 방문"
  | "보류"
  | "폐기"
  | "글쓰기 에이전트로 전달";

export type ScoutCandidate = {
  id: string;
  discoveredDate: string;
  status: CandidateStatus;
  feedbackLabels: FeedbackLabel[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
  category: CandidateCategory;
  topicName: string;
  oneLineSummary: string;
  coreWhyGudiQuestion: string;
  businessObservationAngle: string;
  consumerBehaviorAngle: string;
  connectionToExistingPosts: string;
  overlapRisk: OverlapRisk;
  recommendedFormat: RecommendedFormat;
  visitPossible: VisitPossible;
  sourceUrl: string;
  sourceName: string;
  nextAction: NextAction;
};

export type CandidateEnrichment = {
  oneLineSummary: string;
  coreWhyGudiQuestion: string;
  businessObservationAngle: string;
  consumerBehaviorAngle: string;
  connectionToExistingPosts: string;
  recommendedFormat: RecommendedFormat;
  nextAction: NextAction;
};

export type CandidateFeedbackRecord = {
  candidateId?: string;
  topicName: string;
  category: CandidateCategory;
  sourceCategory?: RawSourceCategory;
  status: "Selected" | "Shortlisted" | "Rejected";
  feedbackLabels: FeedbackLabel[];
  angleKeywords?: string[];
  decidedAt: string;
};

export type FeedbackMemory = {
  categoryWeights: Partial<Record<CandidateCategory, number>>;
  sourceCategoryWeights: Partial<Record<RawSourceCategory, number>>;
  rejectedPatterns: string[];
  preferredAngles: string[];
  recentTopics: string[];
  candidateFeedback: CandidateFeedbackRecord[];
};

export type WritingBriefStyleReference =
  | "business-observation"
  | "product-observation"
  | "retail-observation"
  | "startup-observation"
  | "consumer-behavior-observation";

export type WritingBrief = {
  topicName: string;
  coreWhyGudiQuestion: string;
  refinedCoreQuestion: string;
  oneLineSummary: string;
  businessObservationAngle: string;
  consumerBehaviorAngle: string;
  coreTension: string;
  nonObviousInsight: string;
  businessMechanism: string;
  consumerPsychology: string;
  sharpThesis: string;
  genericThesisToAvoid: string[];
  betterOpeningScene: string;
  postOutline: string[];
  evidenceNeeded: string[];
  evidenceBoundary: {
    confirmedFacts: string[];
    reasonableInferences: string[];
    needsVerification: string[];
  };
  possibleStructure: string[];
  counterArguments: string[];
  sourceUrls: string[];
  recommendedFormat: RecommendedFormat;
  styleReference: WritingBriefStyleReference;
};
