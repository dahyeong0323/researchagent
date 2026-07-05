import type { Entity, EntityType, SourceDocument } from "./types.ts";

type SourceDocumentWithEntityHints = SourceDocument & {
  entityName?: string;
  entityType?: EntityType;
  aliases?: string[];
};

const genericEntityNames = new Set([
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
  "한 브랜드",
  "한 스타트업",
  "스타트업",
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
  "제휴",
  "운영",
  "투자 유치",
  "투자",
  "유치",
  "개편",
  "공개",
  "업데이트",
  "론칭",
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

const koreanActionTriggerPattern = /출시|도입|확대|오픈|제휴|운영|투자\s*유치|투자|유치|개편|공개|업데이트|론칭/u;
const koreanEntitySuffixPattern =
  /([가-힣A-Za-z0-9]+(?:랩스|페이|뱅크|스토어|프렌즈|커머스|마켓|테크|뷰티|AI|앱))(?:은|는|이|가|을|를|와|과|에서|으로|로)?/gu;
const englishProperNamePattern = /\b[A-Z][A-Za-z0-9&'.-]*(?:[ \t]+[A-Z][A-Za-z0-9&'.-]*){0,3}\b/gu;

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

  if (["headspace", "calm", "duolingo"].includes(name)) {
    return "app";
  }

  if (["olive better", "daiso", "다이소"].includes(name)) {
    return "brand";
  }

  if (/(랩스|테크|뱅크|페이)$/u.test(displayName) || /(스타트업|투자|유치|프리a|시드)/iu.test(context)) {
    return "company";
  }

  if (/(프렌즈|앱)$/u.test(displayName) || /(루틴\s*관리\s*앱|모바일\s*앱|앱\s|기능)/u.test(context)) {
    return "app";
  }

  if (/(스토어|커머스|마켓|뷰티)$/u.test(displayName) || /(매장|브랜드|리테일|오픈|올리브영|웰니스)/u.test(context)) {
    return "brand";
  }

  if (/\b(inc|inc\.|corp|corp\.|ltd|llc|holdings|labs)\b/u.test(name)) {
    return "company";
  }

  if (/\b(founder|ceo|creator|artist|investor)\b/u.test(context)) {
    return "person";
  }

  if (/\b(brand|beauty|fashion|fnb|restaurant|cafe)\b/u.test(context) || /브랜드|뷰티/u.test(context)) {
    return "brand";
  }

  if (/\b(company|startup|raises|raised|funding|investment|inc\.?|corp\.?|holdings)\b/u.test(context)) {
    return "company";
  }

  if (/\b(app|ios|android|mobile app|software|saas)\b/u.test(context)) {
    return "app";
  }

  if (/\b(service|platform|subscription|membership)\b/u.test(context)) {
    return "service";
  }

  if (/\b(store|shop|retail|pop-?up|offline|flagship)\b/u.test(context) || /매장|팝업|스토어/u.test(context)) {
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
  const source = `${document.rawHtml ?? ""}\n${document.contentMarkdown ?? ""}\n${document.contentText}`;
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

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names.map(normalizeName).filter((name) => name.length >= 2 && !isGenericEntityName(name))) {
    const key = normalizedKey(name);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(name);
  }

  return result;
}

function koreanEntityNames(value: string): string[] {
  return uniqueNames([...value.matchAll(koreanEntitySuffixPattern)].map((match) => match[1]));
}

function englishProperNames(value: string): string[] {
  return uniqueNames(
    [...value.matchAll(englishProperNamePattern)]
      .map((match) => match[0])
      .filter((name) => name.length > 2 && !bodyStopPhrases.has(name))
  );
}

function titleEntityNameBeforeTrigger(value: string): string {
  const koreanNames = koreanEntityNames(value);
  if (koreanNames.length > 0) {
    return koreanNames[koreanNames.length - 1];
  }

  const englishNames = englishProperNames(value);
  if (englishNames.length > 0) {
    return englishNames[englishNames.length - 1];
  }

  const segments = value.split(/[,，:|]/u).map(normalizeName).filter(Boolean);
  return segments[segments.length - 1] ?? value;
}

function extractTitleEntity(document: SourceDocument): Entity | undefined {
  const title = normalizeName(document.title);
  const lowerTitle = title.toLowerCase();

  for (const trigger of titleTriggers) {
    const index = lowerTitle.indexOf(trigger.toLowerCase());
    if (index > 1) {
      const displayName = titleEntityNameBeforeTrigger(title.slice(0, index));
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
        .filter((paragraph) => new RegExp(`(?<![a-z0-9])${escapeRegExp(key)}(?![a-z0-9])`, "iu").test(normalizedKey(paragraph.text)))
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

function extractKoreanBodyEntities(document: SourceDocument): Entity[] {
  const byName = new Map<string, { displayName: string; paragraphIds: string[]; count: number }>();

  for (const paragraph of document.paragraphs) {
    if (!koreanActionTriggerPattern.test(paragraph.text) && !koreanActionTriggerPattern.test(document.title)) {
      continue;
    }

    for (const displayName of koreanEntityNames(paragraph.text)) {
      const key = normalizedKey(displayName);
      const current = byName.get(key) ?? { displayName, paragraphIds: [], count: 0 };
      current.count += 1;
      if (!current.paragraphIds.includes(paragraph.id)) {
        current.paragraphIds.push(paragraph.id);
      }
      byName.set(key, current);
    }
  }

  return [...byName.values()]
    .map(({ displayName, paragraphIds, count }) =>
      createEntity(
        displayName,
        "body",
        Math.min(0.74, 0.58 + count * 0.08),
        inferEntityType(displayName, document),
        [],
        paragraphIds
      )
    )
    .filter((entity): entity is Entity => Boolean(entity));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  entities.push(...extractKoreanBodyEntities(document));

  return uniqueEntities(entities);
}
