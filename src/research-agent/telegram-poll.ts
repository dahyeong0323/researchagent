import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadLocalEnv } from "./env.ts";
import { writeWritingBriefForCandidateId } from "./export-to-writing.ts";
import { readNotionConfig, updateCandidateStatusByCandidateId } from "./notion.ts";
import { readTelegramConfig, sendTelegramMessage, type TelegramReplyMarkup } from "./telegram.ts";

loadLocalEnv();

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const DEFAULT_OFFSET_PATH = "data/research-agent/telegram-offset.json";

type StatusCallbackAction = "selected" | "shortlisted" | "rejected";
type CallbackAction = StatusCallbackAction | "brief";
type NotionStatus = "Selected" | "Shortlisted" | "Rejected";

type ParsedCallbackData = {
  action: CallbackAction;
  candidateId: string;
  status?: NotionStatus;
};

type TelegramUpdate = {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
  };
};

const STATUS_BY_ACTION: Record<StatusCallbackAction, NotionStatus> = {
  selected: "Selected",
  shortlisted: "Shortlisted",
  rejected: "Rejected"
};

function warn(message: string): void {
  process.stderr.write(`Telegram poll warning: ${message}\n`);
}

function info(message: string): void {
  process.stderr.write(`Telegram poll: ${message}\n`);
}

export function parseTelegramCallbackData(data?: string): ParsedCallbackData | undefined {
  if (!data) {
    return undefined;
  }

  const separatorIndex = data.indexOf(":");
  if (separatorIndex === -1) {
    return undefined;
  }

  const action = data.slice(0, separatorIndex) as CallbackAction;
  const candidateId = data.slice(separatorIndex + 1).trim();
  if (action === "brief" && candidateId) {
    return {
      action,
      candidateId
    };
  }

  const status = STATUS_BY_ACTION[action as StatusCallbackAction];

  if (!status || !candidateId) {
    return undefined;
  }

  return {
    action,
    candidateId,
    status
  };
}

function buildWritingBriefKeyboard(candidateId: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "Writing Brief 만들기",
          callback_data: `brief:${candidateId}`
        }
      ]
    ]
  };
}

async function readOffset(path = DEFAULT_OFFSET_PATH): Promise<number | undefined> {
  try {
    const text = await readFile(resolve(path), "utf8");
    const parsed = JSON.parse(text) as { offset?: unknown };
    return typeof parsed.offset === "number" && Number.isFinite(parsed.offset) ? parsed.offset : undefined;
  } catch {
    return undefined;
  }
}

async function writeOffset(offset: number, path = DEFAULT_OFFSET_PATH): Promise<void> {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ offset }, null, 2)}\n`, "utf8");
}

async function telegramPost<TResponse>(
  method: string,
  body: Record<string, unknown>,
  botToken: string
): Promise<TResponse> {
  const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const responseBody = (await response.json().catch(async () => ({
    ok: false,
    description: await response.text()
  }))) as { ok?: boolean; description?: string; result?: unknown };

  if (!response.ok || responseBody.ok === false) {
    throw new Error(`${method} failed: ${responseBody.description ?? response.status}`);
  }

  return responseBody as TResponse;
}

async function getUpdates(botToken: string, offset?: number): Promise<TelegramUpdate[]> {
  const response = await telegramPost<{ result?: unknown }>(
    "getUpdates",
    {
      ...(offset ? { offset } : {}),
      timeout: 30,
      allowed_updates: ["callback_query"]
    },
    botToken
  );

  return Array.isArray(response.result) ? (response.result as TelegramUpdate[]) : [];
}

async function answerCallbackQuery(botToken: string, callbackQueryId: string, text: string): Promise<void> {
  await telegramPost(
    "answerCallbackQuery",
    {
      callback_query_id: callbackQueryId,
      text
    },
    botToken
  );
}

async function processUpdate(update: TelegramUpdate, botToken: string): Promise<void> {
  const callbackQuery = update.callback_query;
  if (!callbackQuery) {
    return;
  }

  const parsed = parseTelegramCallbackData(callbackQuery.data);
  if (!parsed) {
    await answerCallbackQuery(botToken, callbackQuery.id, "지원하지 않는 버튼입니다.").catch((error) =>
      warn(error instanceof Error ? error.message : String(error))
    );
    return;
  }

  if (parsed.action === "brief") {
    const outputPath = await writeWritingBriefForCandidateId(parsed.candidateId);
    if (!outputPath) {
      const message = `Writing brief 생성 실패: 후보를 찾지 못했습니다 (${parsed.candidateId})`;
      warn(message);
      await answerCallbackQuery(botToken, callbackQuery.id, message.slice(0, 180)).catch((error) =>
        warn(error instanceof Error ? error.message : String(error))
      );
      return;
    }

    const message = `Writing brief 생성 완료: ${outputPath}`;
    await answerCallbackQuery(botToken, callbackQuery.id, "Writing brief 생성 완료");
    await sendTelegramMessage(message);
    info(message);
    return;
  }

  if (!parsed.status) {
    return;
  }

  const result = await updateCandidateStatusByCandidateId(parsed.candidateId, parsed.status, readNotionConfig(false));
  if (!result.ok) {
    const message = result.error ?? "Notion 상태 업데이트 실패";
    warn(message);
    await answerCallbackQuery(botToken, callbackQuery.id, message.slice(0, 180)).catch((error) =>
      warn(error instanceof Error ? error.message : String(error))
    );
    return;
  }

  const topicName = result.topicName ?? parsed.candidateId;
  const confirmation = `${parsed.status} 처리 완료: ${topicName}`;
  await answerCallbackQuery(botToken, callbackQuery.id, confirmation);
  await sendTelegramMessage(
    confirmation,
    parsed.action === "selected" ? buildWritingBriefKeyboard(parsed.candidateId) : undefined
  );
  info(confirmation);
}

async function pollOnce(): Promise<void> {
  const telegramConfig = readTelegramConfig();
  if (!telegramConfig.enabled) {
    warn("TELEGRAM_ENABLED=1 is required to run polling.");
    return;
  }

  if (!telegramConfig.botToken) {
    warn("TELEGRAM_BOT_TOKEN is required to run polling.");
    return;
  }

  const offset = await readOffset();
  const updates = await getUpdates(telegramConfig.botToken, offset);

  for (const update of updates) {
    try {
      await processUpdate(update, telegramConfig.botToken);
    } catch (error) {
      warn(error instanceof Error ? error.message : String(error));
    } finally {
      await writeOffset(update.update_id + 1);
    }
  }

  if (updates.length > 0) {
    info(`processed ${updates.length} update(s).`);
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const telegramConfig = readTelegramConfig();

  if (!telegramConfig.enabled || !telegramConfig.botToken) {
    await pollOnce();
    return;
  }

  if (once) {
    await pollOnce();
    return;
  }

  while (true) {
    await pollOnce().catch((error) => warn(error instanceof Error ? error.message : String(error)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    warn(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
