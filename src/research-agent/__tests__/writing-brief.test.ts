import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  chooseStyleReference,
  inferBusinessMechanism,
  inferGenericThesisToAvoid,
  renderWritingBrief,
  toWritingBrief,
  toWritingBriefWithLlm,
  writeResearchTaskForCandidateId,
  writeWritingBriefForCandidate,
  writeWritingBriefForCandidateId
} from "../export-to-writing.ts";
import type { ScoutCandidate } from "../types.ts";

function candidate(overrides: Partial<ScoutCandidate> = {}): ScoutCandidate {
  return {
    id: overrides.id ?? "candidate-writing-1",
    candidateId: overrides.candidateId ?? overrides.id ?? "candidate-writing-1",
    discoveredDate: "2026-07-03",
    status: "new",
    feedbackLabels: [],
    score: overrides.score ?? 88,
    scoreBreakdown: {
      concreteCase: 18,
      whyGudiStrength: 18,
      consumerBehaviorPotential: 15,
      businessInterpretability: 14,
      dahyeongFit: 12,
      novelty: 7,
      sourceReliability: 4,
      visitabilityBonus: 0
    },
    category: overrides.category ?? "앱/프로덕트",
    topicName: overrides.topicName ?? "명상 앱이 혼자 하는 세션보다 친구 체크인을 강조하는 선택",
    oneLineSummary:
      overrides.oneLineSummary ?? "명상 앱이 개인 콘텐츠보다 친구 체크인과 루틴 확인을 전면에 둔다.",
    coreWhyGudiQuestion:
      overrides.coreWhyGudiQuestion ?? "왜 굳이 명상 앱은 조용한 개인 경험에 친구 체크인을 붙였을까?",
    businessObservationAngle:
      overrides.businessObservationAngle ?? "웰니스 앱이 콘텐츠 라이브러리보다 반복 사용 장치를 강화한다.",
    consumerBehaviorAngle:
      overrides.consumerBehaviorAngle ?? "사용자는 혼자 의지를 내는 것보다 누군가가 확인할 때 루틴을 더 쉽게 지킨다.",
    connectionToExistingPosts: overrides.connectionToExistingPosts ?? "습관과 소비자 행동 관찰",
    overlapRisk: overrides.overlapRisk ?? "낮음",
    recommendedFormat: overrides.recommendedFormat ?? "장문 관찰기",
    visitPossible: overrides.visitPossible ?? "중요하지 않음",
    sourceUrl: overrides.sourceUrl ?? "https://example.com/meditation-checkin",
    sourceName: overrides.sourceName ?? "테스트 출처",
    nextAction: overrides.nextAction ?? "채택 검토",
    entityName: overrides.entityName ?? "테스트 명상 앱",
    entityType: overrides.entityType ?? "app",
    observedFeature: overrides.observedFeature ?? "친구 체크인",
    evidenceSnippet: overrides.evidenceSnippet ?? "친구 체크인을 제공한다.",
    evidenceType: overrides.evidenceType ?? "article",
    evidenceParagraphIds: overrides.evidenceParagraphIds,
    verificationStatus: overrides.verificationStatus ?? "verified",
    briefAllowed: overrides.briefAllowed ?? (overrides.verificationStatus !== "needs-research"),
    verificationNotes: overrides.verificationNotes,
    confirmedFacts: overrides.confirmedFacts,
    reasonableInferences: overrides.reasonableInferences,
    needsVerification: overrides.needsVerification,
    missingFields: overrides.missingFields
  };
}

describe("Writing Brief v2", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it("turns a meditation app friend check-in candidate into a product retention brief", () => {
    const meditationCandidate = candidate();
    const mechanism = inferBusinessMechanism(meditationCandidate).toLowerCase();
    const brief = toWritingBrief(meditationCandidate);

    expect(["retention", "habit", "accountability"].some((keyword) => mechanism.includes(keyword))).toBe(true);
    expect(inferGenericThesisToAvoid(meditationCandidate)).toContain("앱이 생활 루틴으로 들어간다");
    expect(chooseStyleReference(meditationCandidate)).toBe("product-observation");
    expect(brief.refinedCoreQuestion.length).toBeLessThan(brief.coreWhyGudiQuestion.length);
    expect(brief.refinedCoreQuestion).not.toContain("기능 제공을 넘어");
    expect(brief.refinedCoreQuestion).toMatch(/명상/);
    expect(brief.refinedCoreQuestion).toMatch(/친구|체크인/);
    expect(brief.postOutline.length).toBeGreaterThanOrEqual(7);
    expect(brief.evidenceBoundary.needsVerification.some((item) => item.includes("앱 화면"))).toBe(true);
  });

  it("preserves candidate source-backed evidence in the evidence boundary", () => {
    const brief = toWritingBrief(
      candidate({
        sourceUrl: "https://www.headspace.com/articles/friend-check-in",
        entityName: "Headspace",
        entityType: "app",
        observedFeature: "friend check-in reminder",
        evidenceSnippet: "Headspace says friends can check in on meditation progress.",
        evidenceParagraphIds: ["p7"],
        confirmedFacts: ["Headspace names friend check-ins in the source."],
        reasonableInferences: ["Friend accountability may support retention."],
        needsVerification: ["Do not claim retention lift without metrics."]
      })
    );

    expect(brief.evidenceBoundary.confirmedFacts).toContain(
      "Headspace names friend check-ins in the source."
    );
    expect(brief.evidenceBoundary.confirmedFacts).toContain(
      "출처 증거 문장: Headspace says friends can check in on meditation progress."
    );
    expect(brief.evidenceBoundary.confirmedFacts).toContain("증거 paragraph id: p7");
    expect(brief.evidenceBoundary.confirmedFacts).toContain("검증된 관찰 기능/선택: friend check-in reminder");
    expect(brief.evidenceBoundary.reasonableInferences).toContain(
      "Friend accountability may support retention."
    );
    expect(brief.evidenceBoundary.needsVerification).toContain(
      "Do not claim retention lift without metrics."
    );
    expect(brief.evidenceNeeded).toContain("Do not claim retention lift without metrics.");
  });

  it("does not let LLM brief output erase candidate evidence boundaries", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  refinedCoreQuestion: "왜 친구 체크인이 필요할까?",
                  coreTension: "LLM tension",
                  nonObviousInsight: "LLM insight",
                  businessMechanism: "LLM mechanism",
                  consumerPsychology: "LLM psychology",
                  sharpThesis: "LLM thesis",
                  genericThesisToAvoid: ["LLM generic"],
                  betterOpeningScene: "LLM opening",
                  postOutline: ["1", "2", "3", "4", "5", "6", "7"],
                  evidenceNeeded: ["LLM 추가 조사"],
                  evidenceBoundary: {
                    confirmedFacts: ["LLM confirmed fact"],
                    reasonableInferences: ["LLM inference"],
                    needsVerification: ["LLM caution"]
                  },
                  styleReference: "product-observation"
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const brief = await toWritingBriefWithLlm(
      candidate({
        sourceUrl: "https://www.headspace.com/articles/friend-check-in",
        evidenceSnippet: "Headspace says friends can check in on meditation progress.",
        evidenceParagraphIds: ["p7"],
        confirmedFacts: ["Headspace names friend check-ins in the source."],
        needsVerification: ["Do not claim retention lift without metrics."]
      })
    );

    expect(brief.evidenceBoundary.confirmedFacts).toContain(
      "Headspace names friend check-ins in the source."
    );
    expect(brief.evidenceBoundary.confirmedFacts).toContain("LLM confirmed fact");
    expect(brief.evidenceBoundary.confirmedFacts).toContain(
      "출처 증거 문장: Headspace says friends can check in on meditation progress."
    );
    expect(brief.evidenceBoundary.confirmedFacts).toContain("증거 paragraph id: p7");
    expect(brief.evidenceBoundary.needsVerification).toContain(
      "Do not claim retention lift without metrics."
    );
    expect(brief.evidenceBoundary.needsVerification).toContain("LLM caution");
    expect(brief.evidenceNeeded).toContain("Do not claim retention lift without metrics.");
    expect(brief.evidenceNeeded).toContain("LLM 추가 조사");
  });

  it("uses a retail style reference for retail candidates", () => {
    const retailCandidate = candidate({
      category: "리테일/브랜드",
      topicName: "브랜드가 굳이 작은 오프라인 매장을 여는 선택",
      oneLineSummary: "브랜드가 판매보다 체험과 신뢰 형성을 위해 매장을 연다.",
      coreWhyGudiQuestion: "왜 굳이 온라인 판매가 가능한 브랜드가 작은 매장을 열까?"
    });

    expect(chooseStyleReference(retailCandidate)).toBe("retail-observation");
  });

  it("keeps Apple Invites app briefs in a product coordination frame", () => {
    const brief = toWritingBrief(
      candidate({
        id: "candidate:manual-url:e29802befa6d52bd:entity:apple-invites",
        candidateId: "candidate:manual-url:e29802befa6d52bd:entity:apple-invites",
        topicName: "Apple Invites - Introducing Apple Invites, a new app that brings people together",
        oneLineSummary:
          "Apple Invites source evidence: Apple today introduced Apple Invites, a new app for iPhone that helps users create custom invitations.",
        coreWhyGudiQuestion: "Why did Apple make an invitations app?",
        businessObservationAngle: "Apple is turning invitations into a coordination surface.",
        consumerBehaviorAngle: "Hosts need help making plans feel organized and intentional.",
        sourceUrl:
          "https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/",
        sourceName: "Apple Newsroom",
        entityName: "Apple Invites",
        entityType: "app",
        observedFeature:
          "Apple today introduced Apple Invites, a new app for iPhone that helps users create custom invitations.",
        evidenceSnippet:
          "Apple today introduced Apple Invites, a new app for iPhone that helps users create custom invitations.",
        evidenceParagraphIds: ["p2"],
        verificationStatus: "verified",
        briefAllowed: true
      })
    );
    const markdown = renderWritingBrief(brief);

    expect(brief.styleReference).toBe("product-observation");
    expect(markdown).toContain("coordination");
    expect(markdown).toContain("RSVPs");
    expect(markdown).not.toContain("offline");
    expect(markdown).not.toContain("store");
  });

  it("renders the v2 strategy sections", () => {
    const markdown = renderWritingBrief(toWritingBrief(candidate()));

    expect(markdown).toContain("## Core Tension");
    expect(markdown).toContain("## Sharp Thesis");
    expect(markdown).toContain("## Business Mechanism");
    expect(markdown).toContain("## 확인된 사실 / 추론 / 확인 필요");
    expect(markdown).toContain("## 필요한 추가 조사");
  });

  it("blocks direct writing brief creation for unsafe candidates", () => {
    expect(() =>
      toWritingBrief(
        candidate({
          verificationStatus: "needs-research",
          briefAllowed: false
        })
      )
    ).toThrow("verified and briefAllowed");
  });

  it("exports a research task instead of a normal writing brief for needs-research candidates", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "writing-brief-gate-"));

    try {
      const outputPath = await writeWritingBriefForCandidate(
        candidate({
          entityName: undefined,
          verificationStatus: "needs-research",
          verificationNotes: "Actual service name is missing."
        }),
        { outputDir, date: "2026-07-03" }
      );
      const markdown = await readFile(outputPath, "utf8");

      expect(markdown).toContain("# Research Task:");
      expect(markdown).not.toContain("# Writing Brief:");
      expect(markdown).toContain("실제 서비스/브랜드명");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("exports a normal writing brief only when the candidate is verified and briefAllowed", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "writing-brief-allowed-"));

    try {
      const outputPath = await writeWritingBriefForCandidate(
        candidate({
          sourceUrl: "https://www.headspace.com/articles/friend-check-in",
          verificationStatus: "verified",
          briefAllowed: true
        }),
        { outputDir, date: "2026-07-03" }
      );
      const markdown = await readFile(outputPath, "utf8");

      expect(markdown).toContain("# Writing Brief:");
      expect(markdown).not.toContain("# Research Task:");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("loads candidate IDs from the latest daily snapshot before falling back to raw input", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "writing-brief-snapshot-"));

    try {
      const snapshotPath = join(outputDir, "latest-candidates.json");
      const snapshotCandidate = candidate({
        id: "candidate:snapshot:verified",
        candidateId: "candidate:snapshot:verified",
        sourceUrl: "https://www.headspace.com/articles/friend-check-in",
        verificationStatus: "verified",
        briefAllowed: true
      });
      await writeFile(
        snapshotPath,
        `${JSON.stringify(
          {
            version: 1,
            runId: "research-agent:2026-07-04",
            updatedAt: "2026-07-04T00:00:00.000Z",
            candidates: [snapshotCandidate]
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      const outputPath = await writeWritingBriefForCandidateId("candidate:snapshot:verified", {
        candidateSnapshotPath: snapshotPath,
        inputPath: join(outputDir, "missing-input.json"),
        outputDir,
        date: "2026-07-04"
      });
      const markdown = await readFile(outputPath ?? "", "utf8");

      expect(markdown).toContain("# Writing Brief:");
      expect(markdown).not.toContain("# Research Task:");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("loads research task candidate IDs from the latest daily snapshot", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "research-task-snapshot-"));

    try {
      const snapshotPath = join(outputDir, "latest-candidates.json");
      const snapshotCandidate = candidate({
        id: "candidate:snapshot:needs-research",
        candidateId: "candidate:snapshot:needs-research",
        verificationStatus: "needs-research",
        briefAllowed: false,
        missingFields: ["source-backed evidence provenance"]
      });
      await writeFile(
        snapshotPath,
        `${JSON.stringify({ version: 1, runId: "research-agent:2026-07-04", candidates: [snapshotCandidate] }, null, 2)}\n`,
        "utf8"
      );

      const outputPath = await writeResearchTaskForCandidateId("candidate:snapshot:needs-research", {
        candidateSnapshotPath: snapshotPath,
        inputPath: join(outputDir, "missing-input.json"),
        outputDir,
        date: "2026-07-04"
      });
      const markdown = await readFile(outputPath ?? "", "utf8");

      expect(markdown).toContain("# Research Task:");
      expect(markdown).toContain("source-backed evidence provenance");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
