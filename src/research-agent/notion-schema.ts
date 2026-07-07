import { CATEGORY_BY_SOURCE, FORMAT_BY_CATEGORY, VISIT_POSSIBLE_BY_CATEGORY } from "./config.ts";

export type NotionSchemaPropertyType =
  | "title"
  | "rich_text"
  | "date"
  | "select"
  | "multi_select"
  | "number"
  | "checkbox"
  | "url";

export type NotionSchemaProperty = {
  name: string;
  type: NotionSchemaPropertyType;
  options?: string[];
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

const EVIDENCE_TYPE_OPTIONS = ["official", "app-store", "article", "manual-observation", "release-note", "press-release", "unknown"];
const ENTITY_TYPE_OPTIONS = ["company", "brand", "service", "app", "store", "product", "person", "unknown"];
const VERIFICATION_STATUS_OPTIONS = ["verified", "needs-research", "rejected"];
const PRIMARY_STATUS_OPTIONS = ["New", "Shortlisted", "Selected", "Written", "Published", "Rejected"];
const WORKFLOW_STATUS_OPTIONS = ["New", "Needs Research", "Rejected", "Selected", "Shortlisted", "Written", "Published"];
const WRITING_BRIEF_STATUS_OPTIONS = ["ready", "not-ready", "blocked"];
const RESEARCH_TASK_STATUS_OPTIONS = ["none", "open", "in-progress", "resolved", "cancelled"];
const WORKFLOW_NEXT_ACTION_OPTIONS = ["Make Writing Brief", "Make Research Task", "Reject", "Wait"];
const TASK_PRIORITY_OPTIONS = ["low", "medium", "high"];

export const EXPECTED_NOTION_SCHEMA: NotionSchemaProperty[] = [
  { name: "Candidate ID", type: "rich_text" },
  { name: "소재명", type: "title" },
  { name: "발견 날짜", type: "date" },
  { name: "상태", type: "select", options: PRIMARY_STATUS_OPTIONS },
  { name: "피드백 라벨", type: "multi_select" },
  { name: "점수", type: "number" },
  { name: "카테고리", type: "select", options: unique(Object.values(CATEGORY_BY_SOURCE)) },
  { name: "서비스/브랜드명", type: "rich_text" },
  { name: "관찰된 기능/변화", type: "rich_text" },
  { name: "검증 상태", type: "select", options: VERIFICATION_STATUS_OPTIONS },
  { name: "근거 스니펫", type: "rich_text" },
  { name: "근거 유형", type: "select", options: EVIDENCE_TYPE_OPTIONS },
  { name: "검증 메모", type: "rich_text" },
  { name: "한 줄 요약", type: "rich_text" },
  { name: "핵심 왜 굳이 질문", type: "rich_text" },
  { name: "비즈니스 관찰기 각도", type: "rich_text" },
  { name: "소비자 행동 관점", type: "rich_text" },
  { name: "기존 글과의 연결", type: "rich_text" },
  { name: "겹침 위험", type: "select", options: ["낮음", "중간", "높음"] },
  { name: "추천 포맷", type: "select", options: unique(Object.values(FORMAT_BY_CATEGORY)) },
  { name: "직접 방문 가능 여부", type: "select", options: unique(Object.values(VISIT_POSSIBLE_BY_CATEGORY)) },
  { name: "출처 URL", type: "url" },
  { name: "출처명", type: "rich_text" },
  { name: "다음 액션", type: "select" },
  { name: "출처 발행일", type: "date" },
  { name: "출처 유형", type: "select", options: EVIDENCE_TYPE_OPTIONS },
  { name: "엔티티 유형", type: "select", options: ENTITY_TYPE_OPTIONS },
  { name: "Source Reliability", type: "number" },
  { name: "Confirmed Facts", type: "rich_text" },
  { name: "Reasonable Inferences", type: "rich_text" },
  { name: "Needs Verification", type: "rich_text" },
  { name: "Workflow Status", type: "select", options: WORKFLOW_STATUS_OPTIONS },
  { name: "Brief Allowed", type: "checkbox" },
  { name: "Writing Brief Status", type: "select", options: WRITING_BRIEF_STATUS_OPTIONS },
  { name: "Research Task Status", type: "select", options: RESEARCH_TASK_STATUS_OPTIONS },
  { name: "Research Task Reason", type: "rich_text" },
  { name: "Next Action", type: "select", options: WORKFLOW_NEXT_ACTION_OPTIONS },
  { name: "Dedupe Cluster", type: "rich_text" },
  { name: "Human Note", type: "rich_text" },
  { name: "Missing Fields", type: "rich_text" },
  { name: "Required Sources", type: "rich_text" },
  { name: "Verification Questions", type: "rich_text" },
  { name: "Suggested Search Queries", type: "rich_text" },
  { name: "Task Priority", type: "select", options: TASK_PRIORITY_OPTIONS },
  { name: "Completion Criteria", type: "rich_text" }
];

export type NotionDatabasePropertyPayload = Record<string, unknown>;

export function notionPropertyPayload(property: NotionSchemaProperty, options = property.options): NotionDatabasePropertyPayload {
  switch (property.type) {
    case "title":
      return { title: {} };
    case "rich_text":
      return { rich_text: {} };
    case "date":
      return { date: {} };
    case "select":
      return { select: { options: (options ?? []).map((name) => ({ name })) } };
    case "multi_select":
      return { multi_select: { options: (options ?? []).map((name) => ({ name })) } };
    case "number":
      return { number: { format: "number" } };
    case "checkbox":
      return { checkbox: {} };
    case "url":
      return { url: {} };
  }
}
