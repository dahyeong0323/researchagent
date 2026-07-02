import type { ScoutCandidate } from "./types.ts";
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

function url(value: string): { url: string } {
  return { url: value };
}

function multiSelect(values: string[]): { multi_select: Array<{ name: string }> } {
  return {
    multi_select: values.map((value) => ({ name: value }))
  };
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
      "소재명": title(candidate.topicName),
      "발견 날짜": date(candidate.discoveredDate),
      "상태": select(statusName(candidate.status)),
      "피드백 라벨": multiSelect(candidate.feedbackLabels),
      "점수": number(candidate.score),
      "카테고리": select(candidate.category),
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
    "소재명",
    "발견 날짜",
    "상태",
    "점수",
    "카테고리",
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
      candidateId: pageId(page),
      topicName,
      category: category as CandidateFeedbackRecord["category"],
      status,
      feedbackLabels: multiSelectProperty(properties["피드백 라벨"]) as FeedbackLabel[],
      decidedAt: dateProperty(properties["발견 날짜"]) ?? new Date().toISOString().slice(0, 10)
    });
  }

  return records;
}
