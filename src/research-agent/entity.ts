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
  "meditation app",
  "unknown",
  "sample brand",
  "example brand",
  "this service",
  "this company",
  "generic startup",
  "명상 앱",
  "어떤 서비스",
  "어떤 브랜드",
  "한 스타트업",
  "서비스명",
  "브랜드명"
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

function contextFor(document: SourceDocument): string {
  return [
    document.title,
    document.description,
    document.siteName,
    document.contentText.slice(0, 1200)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inferEntityType(displayName: string, document: SourceDocument): EntityType {
  const name = normalizedKey(displayName);
  const context = contextFor(document);

  if (/\b(app|ios|android|mobile app|software|saas)\b/u.test(context)) {
    return "app";
  }

  if (/\b(service|platform|subscription|membership)\b/u.test(context)) {
    return "service";
  }

  if (/\b(store|shop|retail|pop-?up|offline|flagship)\b/u.test(context) || /매장|팝업|스토어/u.test(context)) {
    return "brand";
  }

  if (/\b(brand|beauty|fashion|fnb|restaurant|cafe)\b/u.test(context) || /브랜드|뷰티/u.test(context)) {
    return "brand";
  }

  if (/\b(company|startup|raises|raised|funding|investment|inc\.?|corp\.?|holdings)\b/u.test(context)) {
    return "company";
  }

  if (/\b(founder|ceo|creator|artist|investor)\b/u.test(context)) {
    return "person";
  }

  if (["headspace", "calm", "duolingo"].includes(name)) {
    return "app";
  }

  if (["olive better", "daiso", "다이소"].includes(name)) {
    return "brand";
  }

  return "unknown";
}

function entityIdFor(name: string): string {
  return `entity:${normalizedKey(name).replace(/[^a-z0-9가-힣]+/giu, "-").replace(/^-|-$/g, "")}`;
}

export function isGenericEntityName(name: string | undefined): boolean {
  if (!name) {
    return true;
  }

  const normalized = normalizedKey(name);
  return (
    normalized.length === 0 ||
    genericEntityNames.has(normalized) ||
    /\b(trend report|market report|industry report|weekly report|daily report)\b/u.test(normalized)
  );
}

function createEntity(
  displayName: string,
  resolutionMethod: Entity["resolutionMethod"],
  confidence: number,
  entityType: EntityType = "unknown",
  aliases: string[] = [],
  sourceParagraphIds: string[] = []
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
    sourceParagraphIds,
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
      const displayName = title.slice(0, index);
      return createEntity(displayName, "title", 0.72, inferEntityType(displayName, document));
    }
  }

  const colonPrefix = title.split(/[:|,-]/u)[0]?.trim();
  if (colonPrefix && colonPrefix.length >= 2 && colonPrefix.length <= 60) {
    return createEntity(colonPrefix, "title", 0.55, inferEntityType(colonPrefix, document));
  }

  return undefined;
}

function extractRepeatedBodyEntities(document: SourceDocument): Entity[] {
  const counts = new Map<string, number>();
  const displayByKey = new Map<string, string>();
  const pattern = /\b[A-Z][A-Za-z0-9&'.-]*(?:[ \t]+[A-Z][A-Za-z0-9&'.-]*){0,1}\b/g;
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
    .map(([key, count]) => {
      const displayName = displayByKey.get(key) ?? key;
      const sourceParagraphIds = document.paragraphs
        .filter((paragraph) => normalizedKey(paragraph.text).includes(key))
        .map((paragraph) => paragraph.id);
      return createEntity(
        displayName,
        "body",
        Math.min(0.7, 0.45 + count * 0.08),
        inferEntityType(displayName, document),
        [],
        sourceParagraphIds
      );
    })
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
      hintedDocument.entityType && hintedDocument.entityType !== "unknown"
        ? hintedDocument.entityType
        : inferEntityType(hintedDocument.entityName, document),
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
