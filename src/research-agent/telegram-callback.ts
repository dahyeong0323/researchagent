import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

const DEFAULT_CALLBACK_REF_PATH =
  process.env.RESEARCH_AGENT_TELEGRAM_CALLBACKS_PATH ?? "data/research-agent/telegram-callbacks.json";

export type StatusCallbackAction = "selected" | "shortlisted" | "rejected" | "needs-research";
export type CallbackAction = StatusCallbackAction | "research-task:create" | "brief:create";
export type NotionStatus = "Selected" | "Shortlisted" | "Rejected" | "Needs Research";

export type ParsedCallbackData = {
  action: CallbackAction;
  candidateId: string;
  status?: NotionStatus;
};

type CallbackMode = "i" | "r";
type CallbackRegistryEntry = {
  candidateId: string;
  updatedAt: string;
};

type CallbackRegistry = {
  version: 1;
  updatedAt: string;
  refs: Record<string, CallbackRegistryEntry>;
};

const STATUS_BY_ACTION: Record<StatusCallbackAction, NotionStatus> = {
  selected: "Selected",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  "needs-research": "Needs Research"
};

const STATUS_CODE_BY_ACTION: Record<StatusCallbackAction, string> = {
  selected: "s",
  shortlisted: "h",
  rejected: "r",
  "needs-research": "n"
};

const STATUS_ACTION_BY_CODE: Record<string, StatusCallbackAction> = {
  s: "selected",
  h: "shortlisted",
  r: "rejected",
  n: "needs-research"
};

function callbackByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function callbackToken(candidateId: string): string {
  return createHash("sha256").update(candidateId).digest("base64url").slice(0, 16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRegistry(value: unknown): CallbackRegistry {
  if (!isRecord(value) || !isRecord(value.refs)) {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      refs: {}
    };
  }

  const refs: Record<string, CallbackRegistryEntry> = {};
  for (const [token, entry] of Object.entries(value.refs)) {
    if (!isRecord(entry) || typeof entry.candidateId !== "string") {
      continue;
    }

    refs[token] = {
      candidateId: entry.candidateId,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString()
    };
  }

  return {
    version: 1,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
    refs
  };
}

async function readCallbackRegistry(path: string): Promise<CallbackRegistry> {
  try {
    return normalizeRegistry(JSON.parse(await readFile(resolve(path), "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return normalizeRegistry(undefined);
    }
    throw error;
  }
}

function readCallbackRegistrySync(path: string): CallbackRegistry {
  try {
    return normalizeRegistry(JSON.parse(readFileSync(resolve(path), "utf8")));
  } catch {
    return normalizeRegistry(undefined);
  }
}

function callbackDataFor(action: CallbackAction, mode: CallbackMode, candidateRef: string): string {
  if (action === "brief:create") {
    return `b:${mode}:${candidateRef}`;
  }

  if (action === "research-task:create") {
    return `t:${mode}:${candidateRef}`;
  }

  return `s:${STATUS_CODE_BY_ACTION[action]}:${mode}:${candidateRef}`;
}

function resolveCandidateRef(mode: CallbackMode, candidateRef: string, registryPath: string): string | undefined {
  const trimmedRef = candidateRef.trim();
  if (!trimmedRef) {
    return undefined;
  }

  if (mode === "i") {
    return trimmedRef;
  }

  return readCallbackRegistrySync(registryPath).refs[trimmedRef]?.candidateId;
}

function parseShortCallbackData(data: string, registryPath: string): ParsedCallbackData | undefined {
  const workflowMatch = /^(b|t):([ir]):(.+)$/su.exec(data);
  if (workflowMatch) {
    const [, actionCode, mode, candidateRef] = workflowMatch;
    const candidateId = resolveCandidateRef(mode as CallbackMode, candidateRef, registryPath);
    if (!candidateId) {
      return undefined;
    }

    return {
      action: actionCode === "b" ? "brief:create" : "research-task:create",
      candidateId
    };
  }

  const statusMatch = /^s:([shrn]):([ir]):(.+)$/su.exec(data);
  if (!statusMatch) {
    return undefined;
  }

  const [, statusCode, mode, candidateRef] = statusMatch;
  const action = STATUS_ACTION_BY_CODE[statusCode];
  const candidateId = resolveCandidateRef(mode as CallbackMode, candidateRef, registryPath);
  if (!action || !candidateId) {
    return undefined;
  }

  return {
    action,
    candidateId,
    status: STATUS_BY_ACTION[action]
  };
}

function parseLegacyCallbackData(data: string): ParsedCallbackData | undefined {
  if (data.startsWith("brief:create:")) {
    const candidateId = data.slice("brief:create:".length).trim();
    return candidateId ? { action: "brief:create", candidateId } : undefined;
  }

  if (data.startsWith("brief:")) {
    const candidateId = data.slice("brief:".length).trim();
    return candidateId ? { action: "brief:create", candidateId } : undefined;
  }

  if (data.startsWith("research-task:create:")) {
    const candidateId = data.slice("research-task:create:".length).trim();
    return candidateId ? { action: "research-task:create", candidateId } : undefined;
  }

  if (data.startsWith("task:create:")) {
    const candidateId = data.slice("task:create:".length).trim();
    return candidateId ? { action: "research-task:create", candidateId } : undefined;
  }

  if (!data.startsWith("status:")) {
    return undefined;
  }

  const statusStart = "status:".length;
  const statusEnd = data.indexOf(":", statusStart);
  if (statusEnd < 0) {
    return undefined;
  }

  const action = data.slice(statusStart, statusEnd) as StatusCallbackAction;
  const candidateId = data.slice(statusEnd + 1).trim();
  const status = STATUS_BY_ACTION[action];

  if (!status || !candidateId) {
    return undefined;
  }

  return {
    action,
    candidateId,
    status
  };
}

export function buildTelegramCallbackData(action: CallbackAction, candidateId: string): string {
  const trimmedCandidateId = candidateId.trim();
  const inlineData = callbackDataFor(action, "i", trimmedCandidateId);
  if (trimmedCandidateId && callbackByteLength(inlineData) <= TELEGRAM_CALLBACK_DATA_MAX_BYTES) {
    return inlineData;
  }

  return callbackDataFor(action, "r", callbackToken(trimmedCandidateId));
}

export async function registerTelegramCallbackCandidateIds(
  candidateIds: string[],
  path = DEFAULT_CALLBACK_REF_PATH,
  now = new Date()
): Promise<void> {
  const uniqueIds = [...new Set(candidateIds.map((candidateId) => candidateId.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return;
  }

  const updatedAt = now.toISOString();
  const registry = await readCallbackRegistry(path);
  for (const candidateId of uniqueIds) {
    registry.refs[callbackToken(candidateId)] = {
      candidateId,
      updatedAt
    };
  }
  registry.updatedAt = updatedAt;

  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

export function parseTelegramCallbackData(
  data?: string,
  options: { registryPath?: string } = {}
): ParsedCallbackData | undefined {
  if (!data) {
    return undefined;
  }

  const registryPath = options.registryPath ?? DEFAULT_CALLBACK_REF_PATH;
  return parseShortCallbackData(data, registryPath) ?? parseLegacyCallbackData(data);
}
