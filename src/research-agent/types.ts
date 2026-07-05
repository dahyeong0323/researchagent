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

export type CollectorType =
  | "manual-json"
  | "manual-url"
  | "manual-observation"
  | "rss"
  | "official-blog"
  | "official-newsroom"
  | "article"
  | "app-store";

export type RawSourceItem = {
  id?: string;
  collectorType?: CollectorType;
  title: string;
  sourceUrl: string;
  sourceName: string;
  sourcePublishedAt?: string;
  sourceReliability?: number;
  publishedAt?: string;
  rawSummary?: string;
  rawText?: string;
  rawHtml?: string;
  author?: string;
  rssGuid?: string;
  canonicalUrl?: string;
  fetchStatus?: "not-fetched" | "success" | "failed";
  parseStatus?: "not-parsed" | "success" | "failed";
  language?: string;
  country?: Country;
  sourceCategory: RawSourceCategory;
  collectedAt: string;
  entityName?: string;
  entityType?: EntityType;
  observedFeature?: string;
  evidenceSnippet?: string;
  evidenceType?: EvidenceType;
  verificationStatus?: VerificationStatus;
  verificationNotes?: string;
};

export type EntityType =
  | "service"
  | "brand"
  | "company"
  | "app"
  | "store"
  | "product"
  | "person"
  | "unknown";

export type EvidenceType =
  | "official"
  | "app-store"
  | "article"
  | "manual-observation"
  | "release-note"
  | "press-release"
  | "unknown";

export type VerificationStatus = "verified" | "needs-research" | "rejected";

export type SourceParagraph = {
  id: string;
  index: number;
  text: string;
};

export type SourceDocument = {
  id?: string;
  documentId: string;
  sourceItemId?: string;
  collectorType?: CollectorType;
  sourceUrl?: string;
  canonicalUrl: string;
  documentType: CollectorType;
  title: string;
  description?: string;
  publishedAt?: string;
  siteName: string;
  siteType?: string;
  contentText: string;
  contentMarkdown?: string;
  rawHtml?: string;
  paragraphs: SourceParagraph[];
  sourceCategory?: RawSourceCategory;
  collectedAt?: string;
  language?: "ko" | "en" | "unknown";
  country?: Country;
  reliabilityTier: 1 | 2 | 3 | 4 | 5;
  fetchStatus?: "success" | "failed";
  fetchError?: string;
  licenseNotes?: string;
  fetchChecksum?: string;
  fetchedAt: string;
};

export type Entity = {
  entityId: string;
  normalizedName: string;
  displayName: string;
  entityType: EntityType;
  aliases: string[];
  sourceParagraphIds?: string[];
  homepageUrl?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  country?: string;
  industry?: string;
  confidence: number;
  resolutionMethod: "provided" | "metadata" | "jsonld" | "title" | "body" | "manual" | "unknown";
};

export type EvidenceCandidate = {
  evidenceId: string;
  entityId: string;
  entityName: string;
  observedFeature: string;
  evidenceSnippet: string;
  evidenceType: EvidenceType;
  sourceUrl?: string;
  paragraphId: string;
  paragraphIndex: number;
  trigger: string;
  confidence: number;
};

export type VerificationResult = {
  verificationId: string;
  candidateId?: string;
  entityName?: string;
  entityType: EntityType;
  observedFeature?: string;
  verificationStatus: VerificationStatus;
  sourceReliability: number;
  evidenceSnippet?: string;
  evidenceType: EvidenceType;
  evidenceParagraphIds: string[];
  confirmedFacts: string[];
  reasonableInferences: string[];
  needsVerification: string[];
  missingFields: string[];
  briefAllowed: boolean;
  verificationNotes: string;
  rejectedReason?: string;
  reviewedBy?: "system" | "human";
  reviewedAt: string;
};

export type ResearchTask = {
  taskId: string;
  candidateId: string;
  topicName: string;
  taskTitle: string;
  taskReason: string;
  reason: string;
  missingFields: string[];
  currentSourceUrl?: string;
  currentEntityName?: string;
  currentObservedFeature?: string;
  requiredSources: string[];
  verificationQuestions: string[];
  questionsToAnswer: string[];
  suggestedSearchQueries: string[];
  requiredEvidence: string[];
  priority: "low" | "medium" | "high";
  completionCriteria: string[];
  status: "open" | "in-progress" | "resolved" | "cancelled";
  createdAt: string;
  resolvedAt?: string;
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
  entityConcreteScore?: number;
  evidenceQualityScore?: number;
  sourceReliabilityScore?: number;
  sourceFreshnessScore?: number;
  verificationStatusScore?: number;
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

export type ResearchNextAction =
  | "select-candidate"
  | "make-research-task"
  | "make-writing-brief"
  | "reject"
  | "wait";

export type ScoutCandidate = {
  id: string;
  candidateId: string;
  originDocumentIds?: string[];
  entityId?: string;
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
  sourcePublishedAt?: string;
  sourceReliability?: number;
  nextAction: NextAction | ResearchNextAction;
  entityName?: string;
  entityType: EntityType;
  observedFeature?: string;
  evidenceSnippet?: string;
  evidenceType: EvidenceType;
  evidenceParagraphIds?: string[];
  verificationStatus: VerificationStatus;
  verificationNotes?: string;
  confirmedFacts?: string[];
  reasonableInferences?: string[];
  needsVerification?: string[];
  missingFields?: string[];
  briefAllowed: boolean;
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
