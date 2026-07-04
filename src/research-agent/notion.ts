import type { ResearchTask, ScoutCandidate } from "./types.ts";
import type { CandidateFeedbackRecord, FeedbackLabel } from "./types.ts";

const NOTION_PAGES_URL = "https://api.notion.com/v1/pages";
const NOTION_DATABASE_QUERY_URL = "https://api.notion.com/v1/databases";
const NOTION_DATA_SOURCE_QUERY_URL = "https://api.notion.com/v1/data_sources";
const DEFAULT_NOTION_VERSION = "2022-06-28";
const DRY_RUN_PARENT_ID = "dry-run-parent-id";

type NotionParent =
  | { database_id: string }
  | { data_source: { id: string } };

type NotionConfig = {
  apiKey?: string;
  parent: NotionParent;
  notionVersion: string;
  dryRun: boolean;
};

export type NotionWriteResult = {
  candidateId: string;
  topicName: string;
  ok: boolean;
  dryRun: boolean;
  pageId?: string;
  error?: string;
};

export type NotionStatusUpdateResult = {
  candidateId: string;
  status: "Selected" | "Shortlisted" | "Rejected" | "Needs Research";
  ok: boolean;
  pageId?: string;
  topicName?: string;
  error?: string;
};

type NotionQueryResponse = {
  results?: unknown[];
  has_more?: boolean;
  next_cursor?: string | null;
};

function statusName(status: ScoutCandidate["status"]): string {
  const labels: Record<ScoutCandidate["status"], string> = {
    new: "New",
    shortlisted: "Shortlisted",
    selected: "Selected",
    written: "Written",
    published: "Published",
    rejected: "Rejected"
  };
  return labels[status];
}

function richText(content: string): { rich_text: Array<{ text: { content: string } }> } {
  return {
    rich_text: [
      {
        text: {
          content: content.slice(0, 2000)
        }
      }
    ]
  };
}

function title(content: string): { title: Array<{ text: { content: string } }> } {
  return {
    title: [
      {
        text: {
          content: content.slice(0, 2000)
        }
      }
    ]
  };
}

function select(name: string): { select: { name: string } } {
  return { select: { name } };
}

function date(start: string): { date: { start: string } } {
  return { date: { start } };
}

function number(value: number): { number: number } {
  return { number: value };
}

function checkbox(value: boolean): { checkbox: boolean } {
  return { checkbox: value };
}

function url(value: string): { url: string } {
  return { url: value };
}

function multiSelect(values: string[]): { multi_select: Array<{ name: string }> } {
  return {
    multi_select: values.map((value) => ({ name: value }))
  };
}

function joinedRichText(values: string[] | undefined): ReturnType<typeof richText> {
  return richText((values ?? []).join("\n"));
}

function paragraph(content: string) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: {
            content
          }
        }
      ]
    }
  };
}

function workflowStatus(candidate: ScoutCandidate): string {
  if (candidate.verificationStatus === "rejected") {
    return "Rejected";
  }

  if (candidate.verificationStatus === "needs-research") {
    return "Needs Research";
  }

  return statusName(candidate.status);
}

function workflowNextAction(candidate: ScoutCandidate): string {
  if (candidate.verificationStatus === "verified" && candidate.briefAllowed) {
    return "Make Writing Brief";
  }

  if (candidate.verificationStatus === "needs-research") {
    return "Make Research Task";
  }

  if (candidate.verificationStatus === "rejected") {
    return "Reject";
  }

  return "Wait";
}

function researchTaskStatus(candidate: ScoutCandidate): string {
  return candidate.verificationStatus === "needs-research" ? "open" : "none";
}

function writingBriefStatus(candidate: ScoutCandidate): string {
  if (candidate.verificationStatus === "verified" && candidate.briefAllowed) {
    return "ready";
  }

  if (candidate.verificationStatus === "rejected") {
    return "blocked";
  }

  return "not-ready";
}

function researchTaskReason(candidate: ScoutCandidate): string {
  if (candidate.verificationStatus === "needs-research") {
    return candidate.verificationNotes ?? "Candidate needs source, entity, feature, or evidence verification.";
  }

  if (candidate.verificationStatus === "rejected") {
    return candidate.verificationNotes ?? "Candidate was rejected by verification.";
  }

  return "";
}

function buildCandidateWorkflowProperties(candidate: ScoutCandidate) {
  return {
    "출처 발행일": date(candidate.sourcePublishedAt ?? candidate.discoveredDate),
    "출처 유형": select(candidate.evidenceType),
    "엔티티 유형": select(candidate.entityType),
    "Source Reliability": number(candidate.sourceReliability ?? candidate.scoreBreakdown.sourceReliability),
    "Confirmed Facts": joinedRichText(candidate.confirmedFacts),
    "Reasonable Inferences": joinedRichText(candidate.reasonableInferences),
    "Needs Verification": joinedRichText(candidate.needsVerification),
    "Workflow Status": select(workflowStatus(candidate)),
    "Brief Allowed": checkbox(candidate.briefAllowed),
    "Writing Brief Status": select(writingBriefStatus(candidate)),
    "Research Task Status": select(researchTaskStatus(candidate)),
    "Research Task Reason": richText(researchTaskReason(candidate)),
    "Next Action": select(workflowNextAction(candidate)),
    "Dedupe Cluster": richText(candidate.originDocumentIds?.join(", ") ?? ""),
    "Human Note": richText("")
  };
}

export function buildResearchTaskNotionProperties(task: ResearchTask, candidate: ScoutCandidate) {
  return {
    "Candidate ID": richText(candidate.candidateId),
    "Research Task Status": select(task.status),
    "Research Task Reason": richText(task.taskReason),
    "Missing Fields": joinedRichText(task.missingFields),
    "Required Sources": joinedRichText(task.requiredSources),
    "Verification Questions": joinedRichText(task.verificationQuestions),
    "Suggested Search Queries": joinedRichText(task.suggestedSearchQueries),
    "Task Priority": select(task.priority),
    "Completion Criteria": joinedRichText(task.completionCriteria),
    "Next Action": select("Make Research Task"),
    "Brief Allowed": checkbox(false)
  };
}

function heading(content: string) {
  return {
    object: "block",
    type: "heading_3",
    heading_3: {
      rich_text: [
        {
          type: "text",
          text: {
            content
          }
        }
      ]
    }
  };
}

export function readNotionConfig(dryRun = false): NotionConfig {
  const databaseId = process.env.NOTION_DATABASE_ID;
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID;
  const parent: NotionParent = dataSourceId
    ? { data_source: { id: dataSourceId } }
    : { database_id: databaseId ?? DRY_RUN_PARENT_ID };

  return {
    apiKey: process.env.NOTION_API_KEY,
    parent,
    notionVersion: process.env.NOTION_VERSION ?? DEFAULT_NOTION_VERSION,
    dryRun
  };
}

export function validateNotionConfig(config: NotionConfig): void {
  if (config.dryRun) {
    return;
  }

  if (!config.apiKey) {
    throw new Error("NOTION_API_KEY is required for live Notion writes.");
  }

  if ("database_id" in config.parent && config.parent.database_id === DRY_RUN_PARENT_ID) {
    throw new Error("NOTION_DATABASE_ID or NOTION_DATA_SOURCE_ID is required for live Notion writes.");
  }
}

export function validateNotionReadConfig(config: NotionConfig): void {
  if (!config.apiKey) {
    throw new Error("NOTION_API_KEY is required for Notion reads.");
  }

  if ("database_id" in config.parent && config.parent.database_id === DRY_RUN_PARENT_ID) {
    throw new Error("NOTION_DATABASE_ID or NOTION_DATA_SOURCE_ID is required for Notion reads.");
  }
}

export function buildCandidatePagePayload(candidate: ScoutCandidate, parent: NotionParent) {
  return {
    parent,
    properties: {
      ...buildCandidateWorkflowProperties(candidate),
      "Candidate ID": richText(candidate.id),
      "소재명": title(candidate.topicName),
      "발견 날짜": date(candidate.discoveredDate),
      "상태": select(workflowStatus(candidate)),
      "피드백 라벨": multiSelect(candidate.feedbackLabels),
      "점수": number(candidate.score),
      "카테고리": select(candidate.category),
      "서비스/브랜드명": richText(candidate.entityName ?? ""),
      "관찰된 기능/변화": richText(candidate.observedFeature ?? ""),
      "검증 상태": select(candidate.verificationStatus),
      "근거 스니펫": richText(candidate.evidenceSnippet ?? ""),
      "근거 유형": select(candidate.evidenceType),
      "검증 메모": richText(candidate.verificationNotes ?? ""),
      "한 줄 요약": richText(candidate.oneLineSummary),
      "핵심 왜 굳이 질문": richText(candidate.coreWhyGudiQuestion),
      "비즈니스 관찰기 각도": richText(candidate.businessObservationAngle),
      "소비자 행동 관점": richText(candidate.consumerBehaviorAngle),
      "기존 글과의 연결": richText(candidate.connectionToExistingPosts),
      "겹침 위험": select(candidate.overlapRisk),
      "추천 포맷": select(candidate.recommendedFormat),
      "직접 방문 가능 여부": select(candidate.visitPossible),
      "출처 URL": url(candidate.sourceUrl),
      "출처명": richText(candidate.sourceName),
      "다음 액션": select(candidate.nextAction)
    },
    children: [
      heading("핵심 왜 굳이 질문"),
      paragraph(candidate.coreWhyGudiQuestion),
      heading("비즈니스 관찰기 각도"),
      paragraph(candidate.businessObservationAngle),
      heading("소비자 행동 관점"),
      paragraph(candidate.consumerBehaviorAngle),
      heading("기존 글과의 연결"),
      paragraph(candidate.connectionToExistingPosts),
      heading("출처"),
      paragraph(`${candidate.sourceName}\n${candidate.sourceUrl}`)
    ]
  };
}

export function validateCandidatePagePayload(payload: ReturnType<typeof buildCandidatePagePayload>): void {
  const properties = payload.properties;
  const requiredProperties = [
    "Candidate ID",
    "출처 발행일",
    "출처 유형",
    "엔티티 유형",
    "Source Reliability",
    "Confirmed Facts",
    "Reasonable Inferences",
    "Needs Verification",
    "Workflow Status",
    "Brief Allowed",
    "Writing Brief Status",
    "Research Task Status",
    "Research Task Reason",
    "Next Action",
    "Dedupe Cluster",
    "Human Note",
    "소재명",
    "발견 날짜",
    "상태",
    "점수",
    "카테고리",
    "서비스/브랜드명",
    "관찰된 기능/변화",
    "검증 상태",
    "근거 스니펫",
    "근거 유형",
    "검증 메모",
    "한 줄 요약",
    "핵심 왜 굳이 질문",
    "비즈니스 관찰기 각도",
    "소비자 행동 관점",
    "기존 글과의 연결",
    "겹침 위험",
    "추천 포맷",
    "직접 방문 가능 여부",
    "출처 URL",
    "출처명",
    "다음 액션"
  ];

  for (const property of requiredProperties) {
    if (!(property in properties)) {
      throw new Error(`Missing Notion property payload: ${property}`);
    }
  }
}

export async function createCandidatePage(
  candidate: ScoutCandidate,
  config = readNotionConfig()
): Promise<NotionWriteResult> {
  validateNotionConfig(config);

  const payload = buildCandidatePagePayload(candidate, config.parent);
  validateCandidatePagePayload(payload);

  if (config.dryRun) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return {
      candidateId: candidate.id,
      topicName: candidate.topicName,
      ok: true,
      dryRun: true
    };
  }

  const response = await fetch(NOTION_PAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": config.notionVersion
    },
    body: JSON.stringify(payload)
  });

  const responseBody: unknown = await response.json().catch(async () => ({
    message: await response.text()
  }));

  if (!response.ok) {
    const message =
      responseBody && typeof responseBody === "object" && "message" in responseBody
        ? String((responseBody as { message: unknown }).message)
        : JSON.stringify(responseBody);

    return {
      candidateId: candidate.id,
      topicName: candidate.topicName,
      ok: false,
      dryRun: false,
      error: `Notion request failed with ${response.status}: ${message}`
    };
  }

  const pageId =
    responseBody && typeof responseBody === "object" && "id" in responseBody
      ? String((responseBody as { id: unknown }).id)
      : undefined;

  return {
    candidateId: candidate.id,
    topicName: candidate.topicName,
    ok: true,
    dryRun: false,
    pageId
  };
}

export async function writeCandidatesToNotion(
  candidates: ScoutCandidate[],
  config = readNotionConfig()
): Promise<NotionWriteResult[]> {
  validateNotionConfig(config);

  const results: NotionWriteResult[] = [];
  for (const candidate of candidates) {
    try {
      const result = await createCandidatePage(candidate, config);
      results.push(result);

      if (result.ok && result.dryRun) {
        process.stderr.write(`Notion dry-run payload ok: ${candidate.topicName}\n`);
      } else if (result.ok) {
        process.stderr.write(`Notion page created: ${candidate.topicName} (${result.pageId ?? "unknown id"})\n`);
      } else {
        process.stderr.write(`Notion page failed: ${candidate.topicName} - ${result.error}\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        candidateId: candidate.id,
        topicName: candidate.topicName,
        ok: false,
        dryRun: config.dryRun,
        error: message
      });
      process.stderr.write(`Notion page failed: ${candidate.topicName} - ${message}\n`);
    }
  }

  return results;
}

function notionQueryUrl(config: NotionConfig): string {
  if ("data_source" in config.parent) {
    return `${NOTION_DATA_SOURCE_QUERY_URL}/${config.parent.data_source.id}/query`;
  }
  return `${NOTION_DATABASE_QUERY_URL}/${config.parent.database_id}/query`;
}

async function queryNotionPages(config: NotionConfig): Promise<unknown[]> {
  validateNotionReadConfig(config);

  const pages: unknown[] = [];
  let startCursor: string | undefined;

  do {
    const response = await fetch(notionQueryUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Notion-Version": config.notionVersion
      },
      body: JSON.stringify({
        page_size: 100,
        ...(startCursor ? { start_cursor: startCursor } : {})
      })
    });

    const responseBody = (await response.json().catch(async () => ({
      message: await response.text()
    }))) as NotionQueryResponse & { message?: string };

    if (!response.ok) {
      throw new Error(
        `Notion query failed with ${response.status}: ${responseBody.message ?? JSON.stringify(responseBody)}`
      );
    }

    pages.push(...(Array.isArray(responseBody.results) ? responseBody.results : []));
    startCursor = responseBody.has_more && responseBody.next_cursor ? responseBody.next_cursor : undefined;
  } while (startCursor);

  return pages;
}

async function queryNotionPagesWithBody(config: NotionConfig, body: Record<string, unknown>): Promise<unknown[]> {
  validateNotionReadConfig(config);

  const response = await fetch(notionQueryUrl(config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": config.notionVersion
    },
    body: JSON.stringify(body)
  });

  const responseBody = (await response.json().catch(async () => ({
    message: await response.text()
  }))) as NotionQueryResponse & { message?: string };

  if (!response.ok) {
    throw new Error(`Notion query failed with ${response.status}: ${responseBody.message ?? JSON.stringify(responseBody)}`);
  }

  return Array.isArray(responseBody.results) ? responseBody.results : [];
}

function pageId(page: unknown): string | undefined {
  return page && typeof page === "object" && "id" in page ? String((page as { id: unknown }).id) : undefined;
}

function pageProperties(page: unknown): Record<string, unknown> {
  if (!page || typeof page !== "object" || !("properties" in page)) {
    return {};
  }

  const properties = (page as { properties: unknown }).properties;
  return properties && typeof properties === "object" ? (properties as Record<string, unknown>) : {};
}

function titleProperty(property: unknown): string | undefined {
  if (!property || typeof property !== "object" || !("title" in property)) {
    return undefined;
  }

  const titleItems = (property as { title: unknown }).title;
  if (!Array.isArray(titleItems)) {
    return undefined;
  }

  return titleItems
    .map((item) => {
      if (item && typeof item === "object" && "plain_text" in item) {
        return String((item as { plain_text: unknown }).plain_text);
      }
      return "";
    })
    .join("")
    .trim();
}

function richTextProperty(property: unknown): string | undefined {
  if (!property || typeof property !== "object" || !("rich_text" in property)) {
    return undefined;
  }

  const richTextItems = (property as { rich_text: unknown }).rich_text;
  if (!Array.isArray(richTextItems)) {
    return undefined;
  }

  return richTextItems
    .map((item) => {
      if (item && typeof item === "object" && "plain_text" in item) {
        return String((item as { plain_text: unknown }).plain_text);
      }
      return "";
    })
    .join("")
    .trim();
}

function selectProperty(property: unknown): string | undefined {
  if (!property || typeof property !== "object" || !("select" in property)) {
    return undefined;
  }

  const selectValue = (property as { select: unknown }).select;
  return selectValue && typeof selectValue === "object" && "name" in selectValue
    ? String((selectValue as { name: unknown }).name)
    : undefined;
}

function multiSelectProperty(property: unknown): string[] {
  if (!property || typeof property !== "object" || !("multi_select" in property)) {
    return [];
  }

  const values = (property as { multi_select: unknown }).multi_select;
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) =>
      value && typeof value === "object" && "name" in value ? String((value as { name: unknown }).name) : ""
    )
    .filter(Boolean);
}

function dateProperty(property: unknown): string | undefined {
  if (!property || typeof property !== "object" || !("date" in property)) {
    return undefined;
  }

  const dateValue = (property as { date: unknown }).date;
  return dateValue && typeof dateValue === "object" && "start" in dateValue
    ? String((dateValue as { start: unknown }).start)
    : undefined;
}

function statusForFeedback(value?: string): CandidateFeedbackRecord["status"] | undefined {
  if (value === "Selected" || value === "Shortlisted" || value === "Rejected") {
    return value;
  }
  return undefined;
}

async function updateNotionPageStatus(
  pageIdValue: string,
  status: NotionStatusUpdateResult["status"],
  config: NotionConfig
): Promise<void> {
  validateNotionReadConfig(config);

  const response = await fetch(`${NOTION_PAGES_URL}/${pageIdValue}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": config.notionVersion
    },
    body: JSON.stringify({
      properties: {
        "상태": select(status)
      }
    })
  });

  if (!response.ok) {
    const responseBody = await response.json().catch(async () => ({ message: await response.text() }));
    const message =
      responseBody && typeof responseBody === "object" && "message" in responseBody
        ? String((responseBody as { message: unknown }).message)
        : JSON.stringify(responseBody);
    throw new Error(`Notion status update failed with ${response.status}: ${message}`);
  }
}

export async function updateCandidateStatusByCandidateId(
  candidateId: string,
  status: NotionStatusUpdateResult["status"],
  config = readNotionConfig(false)
): Promise<NotionStatusUpdateResult> {
  try {
    const pages = await queryNotionPagesWithBody(config, {
      page_size: 1,
      filter: {
        property: "Candidate ID",
        rich_text: {
          equals: candidateId
        }
      }
    });

    const page = pages[0];
    const targetPageId = pageId(page);
    if (!page || !targetPageId) {
      return {
        candidateId,
        status,
        ok: false,
        error: `Candidate not found for Candidate ID: ${candidateId}`
      };
    }

    await updateNotionPageStatus(targetPageId, status, config);
    const properties = pageProperties(page);

    return {
      candidateId,
      status,
      ok: true,
      pageId: targetPageId,
      topicName: titleProperty(properties["소재명"])
    };
  } catch (error) {
    return {
      candidateId,
      status,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function readFeedbackRecordsFromNotion(
  config = readNotionConfig(false)
): Promise<CandidateFeedbackRecord[]> {
  const pages = await queryNotionPages(config);
  const records: CandidateFeedbackRecord[] = [];

  for (const page of pages) {
    const properties = pageProperties(page);
    const status = statusForFeedback(selectProperty(properties["상태"]));
    if (!status) {
      continue;
    }

    const topicName = titleProperty(properties["소재명"]);
    const category = selectProperty(properties["카테고리"]);
    if (!topicName || !category) {
      continue;
    }

    records.push({
      candidateId: richTextProperty(properties["Candidate ID"]) ?? pageId(page),
      topicName,
      category: category as CandidateFeedbackRecord["category"],
      status,
      feedbackLabels: multiSelectProperty(properties["피드백 라벨"]) as FeedbackLabel[],
      decidedAt: dateProperty(properties["발견 날짜"]) ?? new Date().toISOString().slice(0, 10)
    });
  }

  return records;
}
