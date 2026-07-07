import { loadLocalEnv } from "./env.ts";
import { EXPECTED_NOTION_SCHEMA, notionPropertyPayload, type NotionSchemaProperty } from "./notion-schema.ts";

loadLocalEnv();

const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const DEFAULT_NOTION_VERSION = "2022-06-28";

type NotionTarget = {
  kind: "database" | "data_source";
  id: string;
};

type ExistingNotionProperty = {
  type?: string;
  select?: {
    options?: Array<{ name?: string }>;
  };
  multi_select?: {
    options?: Array<{ name?: string }>;
  };
};

type SchemaMissingOption = {
  name: string;
  type: "select" | "multi_select";
  missingOptions: string[];
};

type SchemaTypeMismatch = {
  name: string;
  expected: string;
  actual: string;
};

type SchemaReport = {
  ok: boolean;
  target: NotionTarget;
  totalExpected: number;
  missing: string[];
  typeMismatches: SchemaTypeMismatch[];
  missingOptions: SchemaMissingOption[];
};

function apiKey(): string {
  const token = process.env.NOTION_API_KEY;
  if (!token) {
    throw new Error("NOTION_API_KEY is missing from .env");
  }
  return token;
}

function notionVersion(): string {
  return process.env.NOTION_VERSION ?? DEFAULT_NOTION_VERSION;
}

function readTarget(): NotionTarget {
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID?.trim();
  if (dataSourceId) {
    return { kind: "data_source", id: dataSourceId };
  }

  const databaseId = process.env.NOTION_DATABASE_ID?.trim();
  if (!databaseId) {
    throw new Error("NOTION_DATABASE_ID or NOTION_DATA_SOURCE_ID is missing from .env");
  }

  return { kind: "database", id: databaseId };
}

function targetUrl(target: NotionTarget): string {
  const collection = target.kind === "database" ? "databases" : "data_sources";
  return `${NOTION_API_BASE_URL}/${collection}/${target.id}`;
}

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
    "Notion-Version": notionVersion()
  };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function responseMessage(body: unknown): string {
  return body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);
}

async function notionRequest(method: "GET" | "PATCH", url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(`Notion ${method} failed with ${response.status}: ${responseMessage(responseBody)}`);
  }

  return responseBody;
}

function propertiesFromResponse(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || !("properties" in value)) {
    throw new Error("Notion response did not include properties.");
  }

  const properties = (value as { properties: unknown }).properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    throw new Error("Notion response properties were not an object.");
  }

  return properties as Record<string, unknown>;
}

function existingType(value: unknown): string | undefined {
  return value && typeof value === "object" && "type" in value ? String((value as ExistingNotionProperty).type) : undefined;
}

function optionNames(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const property = value as ExistingNotionProperty;
  const options = property.select?.options ?? property.multi_select?.options ?? [];
  return options.map((option) => option.name ?? "").filter((name) => name.length > 0);
}

function missingOptionsFor(property: NotionSchemaProperty, existingProperty: unknown): string[] {
  if (!property.options || property.options.length === 0) {
    return [];
  }

  const existingOptionNames = new Set(optionNames(existingProperty));
  return property.options.filter((option) => !existingOptionNames.has(option));
}

function analyzeSchema(target: NotionTarget, properties: Record<string, unknown>): SchemaReport {
  const missing: string[] = [];
  const typeMismatches: SchemaTypeMismatch[] = [];
  const missingOptions: SchemaMissingOption[] = [];

  for (const property of EXPECTED_NOTION_SCHEMA) {
    const existing = properties[property.name];
    if (!existing) {
      missing.push(property.name);
      continue;
    }

    const actualType = existingType(existing);
    if (actualType !== property.type) {
      typeMismatches.push({
        name: property.name,
        expected: property.type,
        actual: actualType ?? "unknown"
      });
      continue;
    }

    if (property.type === "select" || property.type === "multi_select") {
      const missingForProperty = missingOptionsFor(property, existing);
      if (missingForProperty.length > 0) {
        missingOptions.push({
          name: property.name,
          type: property.type,
          missingOptions: missingForProperty
        });
      }
    }
  }

  return {
    ok: missing.length === 0 && typeMismatches.length === 0 && missingOptions.length === 0,
    target,
    totalExpected: EXPECTED_NOTION_SCHEMA.length,
    missing,
    typeMismatches,
    missingOptions
  };
}

function mergedOptions(property: NotionSchemaProperty, existing: unknown): string[] | undefined {
  if (!property.options) {
    return undefined;
  }

  return [...new Set([...optionNames(existing), ...property.options])];
}

function buildPatch(properties: Record<string, unknown>, report: SchemaReport): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const missingNames = new Set(report.missing);
  const missingOptionNames = new Set(report.missingOptions.map((item) => item.name));

  for (const property of EXPECTED_NOTION_SCHEMA) {
    const existing = properties[property.name];
    if (missingNames.has(property.name)) {
      patch[property.name] = notionPropertyPayload(property);
    } else if (missingOptionNames.has(property.name)) {
      patch[property.name] = notionPropertyPayload(property, mergedOptions(property, existing));
    }
  }

  return patch;
}

async function fetchSchema(target: NotionTarget): Promise<Record<string, unknown>> {
  return propertiesFromResponse(await notionRequest("GET", targetUrl(target)));
}

async function updateSchema(target: NotionTarget): Promise<SchemaReport> {
  const properties = await fetchSchema(target);
  const report = analyzeSchema(target, properties);
  const patch = buildPatch(properties, report);

  if (Object.keys(patch).length > 0) {
    await notionRequest("PATCH", targetUrl(target), { properties: patch });
  }

  return analyzeSchema(target, await fetchSchema(target));
}

async function main(): Promise<void> {
  const shouldUpdate = process.argv.includes("--update");
  const target = readTarget();
  const report = shouldUpdate
    ? await updateSchema(target)
    : analyzeSchema(target, await fetchSchema(target));

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Notion schema ${process.argv.includes("--update") ? "update" : "check"} failed: ${message}\n`);
  process.exitCode = 1;
});
