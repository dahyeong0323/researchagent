import type { Entity, EntityType, SourceDocument } from "./types.ts";

type SourceDocumentWithEntityHints = SourceDocument & {
  entityName?: string;
  entityType?: EntityType;
  aliases?: string[];
};

const genericEntityNames = new Set([
  "명상 앱",
  "어떤 서비스",
  "한 브랜드",
  "this app",
  "a startup",
  "a company",
  "some brand",
  "meditation app"
]);

const jsonLdEntityTypes = new Set(["Organization", "Product", "SoftwareApplication"]);

const titleTriggers = [
  "launches",
  "launched",
  "opens",
  "opened",
  "updates",
  "updated",
  "expands",
  "expanded",
  "introduces",
  "introduced",
  "rolls out",
  "rolled out",
  "출시",
  "도입",
  "확대",
  "오픈",
  "개편"
];

const bodyStopPhrases = new Set([
  "The Company",
  "The Brand",
  "The App",
  "Seoul",
  "Korea",
  "LinkedIn"
]);

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizedKey(value: string): string {
  return normalizeName(value).toLowerCase();
}

function entityIdFor(name: string): string {
  return `entity:${normalizedKey(name).replace(/[^a-z0-9가-힣]+/giu, "-").replace(/^-|-$/g, "")}`;
}

export function isGenericEntityName(name: string | undefined): boolean {
  if (!name) {
    return true;
  }

  const normalized = normalizedKey(name);
  return normalized.length === 0 || genericEntityNames.has(normalized);
}

function createEntity(
  displayName: string,
  resolutionMethod: Entity["resolutionMethod"],
  confidence: number,
  entityType: EntityType = "unknown",
  aliases: string[] = []
): Entity | undefined {
  const normalized = normalizeName(displayName);
  if (isGenericEntityName(normalized)) {
    return undefined;
  }

  return {
    entityId: entityIdFor(normalized),
    normalizedName: normalizedKey(normalized),
    displayName: normalized,
    entityType,
    aliases: aliases.map(normalizeName).filter((alias) => !isGenericEntityName(alias)),
    confidence,
    resolutionMethod
  };
}

function uniqueEntities(entities: Entity[]): Entity[] {
  const byName = new Map<string, Entity>();

  for (const entity of entities) {
    const existing = byName.get(entity.normalizedName);
    if (!existing || entity.confidence > existing.confidence) {
      byName.set(entity.normalizedName, entity);
    }
  }

  return [...byName.values()].sort((left, right) => right.confidence - left.confidence);
}

function parseJsonSafely(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function jsonLdBlocks(document: SourceDocument): unknown[] {
  const source = `${document.contentMarkdown ?? ""}\n${document.contentText}`;
  const blocks: unknown[] = [];
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(source)) !== null) {
    const parsed = parseJsonSafely(match[1].trim());
    if (parsed !== undefined) {
      blocks.push(parsed);
    }
  }

  const trimmed = source.trim();
  if (blocks.length === 0 && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
    const parsed = parseJsonSafely(trimmed);
    if (parsed !== undefined) {
      blocks.push(parsed);
    }
  }

  return blocks;
}

function typeFromJsonLd(value: unknown): EntityType {
  if (value === "Product") {
    return "product";
  }
  if (value === "SoftwareApplication") {
    return "app";
  }
  if (value === "Organization") {
    return "company";
  }
  return "unknown";
}

function collectJsonLdEntities(value: unknown): Entity[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectJsonLdEntities);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const graph = record["@graph"];
  const nested = Array.isArray(graph) ? graph.flatMap(collectJsonLdEntities) : [];
  const rawTypes = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
  const matchingType = rawTypes.find((type) => typeof type === "string" && jsonLdEntityTypes.has(type));

  if (typeof matchingType !== "string" || typeof record.name !== "string") {
    return nested;
  }

  const entity = createEntity(record.name, "jsonld", 0.95, typeFromJsonLd(matchingType));
  return entity ? [entity, ...nested] : nested;
}

function extractTitleEntity(document: SourceDocument): Entity | undefined {
  const title = normalizeName(document.title);
  const lowerTitle = title.toLowerCase();

  for (const trigger of titleTriggers) {
    const index = lowerTitle.indexOf(trigger.toLowerCase());
    if (index > 1) {
      return createEntity(title.slice(0, index), "title", 0.72);
    }
  }

  const colonPrefix = title.split(/[:|,-]/u)[0]?.trim();
  if (colonPrefix && colonPrefix.length >= 2 && colonPrefix.length <= 60) {
    return createEntity(colonPrefix, "title", 0.55);
  }

  return undefined;
}

function extractRepeatedBodyEntities(document: SourceDocument): Entity[] {
  const counts = new Map<string, number>();
  const displayByKey = new Map<string, string>();
  const pattern = /\b[A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,3}\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(document.contentText)) !== null) {
    const display = normalizeName(match[0]);
    if (display.length < 3 || bodyStopPhrases.has(display) || isGenericEntityName(display)) {
      continue;
    }

    const key = normalizedKey(display);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    displayByKey.set(key, display);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([key, count]) => createEntity(displayByKey.get(key) ?? key, "body", Math.min(0.7, 0.45 + count * 0.08)))
    .filter((entity): entity is Entity => Boolean(entity));
}

export function extractEntitiesFromDocument(document: SourceDocument): Entity[] {
  const hintedDocument = document as SourceDocumentWithEntityHints;
  const entities: Entity[] = [];

  if (hintedDocument.entityName) {
    const provided = createEntity(
      hintedDocument.entityName,
      "provided",
      1,
      hintedDocument.entityType ?? "unknown",
      hintedDocument.aliases ?? []
    );
    if (provided) {
      entities.push(provided);
    }
  }

  entities.push(...jsonLdBlocks(document).flatMap(collectJsonLdEntities));

  const titleEntity = extractTitleEntity(document);
  if (titleEntity) {
    entities.push(titleEntity);
  }

  entities.push(...extractRepeatedBodyEntities(document));

  return uniqueEntities(entities);
}
