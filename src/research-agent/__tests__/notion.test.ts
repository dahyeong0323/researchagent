import { describe, expect, it } from "vitest";
import {
  buildCandidatePagePayload,
  buildResearchTaskNotionProperties,
  validateCandidatePagePayload
} from "../notion.ts";
import type { ResearchTask, ScoutCandidate } from "../types.ts";

const candidate: ScoutCandidate = {
  id: "candidate-telegram-1",
  candidateId: "candidate-telegram-1",
  discoveredDate: "2026-07-02",
  status: "new",
  feedbackLabels: [],
  score: 91,
  scoreBreakdown: {
    concreteCase: 20,
    whyGudiStrength: 18,
    consumerBehaviorPotential: 14,
    businessInterpretability: 14,
    dahyeongFit: 12,
    novelty: 8,
    sourceReliability: 5,
    visitabilityBonus: 0
  },
  category: "리테일/브랜드",
  topicName: "테스트 리테일 후보",
  oneLineSummary: "한 줄 요약",
  coreWhyGudiQuestion: "왜 굳이 이 브랜드는 별도 매장을 만들었을까?",
  businessObservationAngle: "비즈니스 관찰기 각도",
  consumerBehaviorAngle: "소비자 행동 관점",
  connectionToExistingPosts: "기존 글과의 연결",
  overlapRisk: "낮음",
  recommendedFormat: "장문 관찰기",
  visitPossible: "확인 필요",
  sourceUrl: "https://example.com/source",
  sourceName: "테스트 출처",
  nextAction: "채택 검토",
  entityName: "테스트 브랜드",
  entityType: "brand",
  observedFeature: "별도 매장",
  evidenceSnippet: "테스트 근거",
  evidenceType: "article",
  verificationStatus: "verified",
  briefAllowed: true,
  sourcePublishedAt: "2026-07-01",
  sourceReliability: 4,
  confirmedFacts: ["Entity identified: test brand"],
  reasonableInferences: ["The offline store may be a trust signal."],
  needsVerification: ["Check official launch page"],
  verificationNotes: "테스트 검증"
};

describe("Notion payload mapping", () => {
  it("includes Candidate ID as a required rich text property", () => {
    const payload = buildCandidatePagePayload(candidate, {
      database_id: "test-database-id"
    });

    expect(() => validateCandidatePagePayload(payload)).not.toThrow();
    expect(payload.properties["Candidate ID"]).toEqual({
      rich_text: [
        {
          text: {
            content: "candidate-telegram-1"
          }
        }
      ]
    });
    expect(payload.properties["서비스/브랜드명"]).toEqual({
      rich_text: [
        {
          text: {
            content: "테스트 브랜드"
          }
        }
      ]
    });
    expect(payload.properties["검증 상태"]).toEqual({
      select: {
        name: "verified"
      }
    });
  });

  it("maps verified candidates to brief-ready workflow properties", () => {
    const payload = buildCandidatePagePayload(candidate, {
      database_id: "test-database-id"
    });

    expect(payload.properties["Brief Allowed"]).toEqual({ checkbox: true });
    expect(payload.properties["Writing Brief Status"]).toEqual({ select: { name: "ready" } });
    expect(payload.properties["Next Action"]).toEqual({ select: { name: "Make Writing Brief" } });
  });

  it("maps needs-research candidates to an open research task workflow", () => {
    const payload = buildCandidatePagePayload(
      {
        ...candidate,
        verificationStatus: "needs-research",
        briefAllowed: false,
        verificationNotes: "Evidence is missing."
      },
      {
        database_id: "test-database-id"
      }
    );

    expect(payload.properties["Workflow Status"]).toEqual({ select: { name: "Needs Research" } });
    expect(payload.properties["Brief Allowed"]).toEqual({ checkbox: false });
    expect(payload.properties["Research Task Status"]).toEqual({ select: { name: "open" } });
    expect(payload.properties["Next Action"]).toEqual({ select: { name: "Make Research Task" } });
  });

  it("maps rejected candidates to rejected workflow properties", () => {
    const payload = buildCandidatePagePayload(
      {
        ...candidate,
        verificationStatus: "rejected",
        briefAllowed: false,
        verificationNotes: "Source does not support claim."
      },
      {
        database_id: "test-database-id"
      }
    );

    expect(payload.properties["Workflow Status"]).toEqual({ select: { name: "Rejected" } });
    expect(payload.properties["Brief Allowed"]).toEqual({ checkbox: false });
    expect(payload.properties["Writing Brief Status"]).toEqual({ select: { name: "blocked" } });
    expect(payload.properties["Next Action"]).toEqual({ select: { name: "Reject" } });
  });

  it("includes evidence boundary fields", () => {
    const payload = buildCandidatePagePayload(candidate, {
      database_id: "test-database-id"
    });

    expect(payload.properties["Confirmed Facts"]).toEqual({
      rich_text: [{ text: { content: "Entity identified: test brand" } }]
    });
    expect(payload.properties["Reasonable Inferences"]).toEqual({
      rich_text: [{ text: { content: "The offline store may be a trust signal." } }]
    });
    expect(payload.properties["Needs Verification"]).toEqual({
      rich_text: [{ text: { content: "Check official launch page" } }]
    });
  });

  it("builds research task Notion properties", () => {
    const task: ResearchTask = {
      taskId: "research-task:candidate-telegram-1",
      candidateId: "candidate-telegram-1",
      taskTitle: "Research needed",
      taskReason: "Evidence is missing.",
      missingFields: ["evidence snippet or evidence paragraph reference"],
      requiredSources: ["Official source"],
      verificationQuestions: ["Which source supports the feature?"],
      suggestedSearchQueries: ["test brand official feature"],
      priority: "medium",
      completionCriteria: ["Attach evidence."],
      status: "open",
      createdAt: "2026-07-03T00:00:00.000Z"
    };

    expect(buildResearchTaskNotionProperties(task, candidate)).toMatchObject({
      "Candidate ID": {
        rich_text: [{ text: { content: "candidate-telegram-1" } }]
      },
      "Research Task Status": { select: { name: "open" } },
      "Brief Allowed": { checkbox: false },
      "Next Action": { select: { name: "Make Research Task" } }
    });
  });
});
