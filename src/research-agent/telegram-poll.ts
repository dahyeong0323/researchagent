import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadLocalEnv } from "./env.ts";
import { writeResearchTaskForCandidateId, writeWritingBriefForCandidateId } from "./export-to-writing.ts";
import { readNotionConfig, updateCandidateStatusByCandidateId } from "./notion.ts";
import {
  buildTelegramCallbackData,
  parseTelegramCallbackData,
  registerTelegramCallbackCandidateIds
} from "./telegram-callback.ts";
import { readTelegramConfig, sendTelegramMessage, type TelegramReplyMarkup } from "./telegram.ts";

loadLocalEnv();

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const DEFAULT_OFFSET_PATH = "data/research-agent/telegram-offset.json";

type TelegramUpdate = {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
  };
};

function warn(message: string): void {
  process.stderr.write(`Telegram poll warning: ${message}\n`);
}

function info(message: string): void {
  process.stderr.write(`Telegram poll: ${message}\n`);
}

export { parseTelegramCallbackData } from "./telegram-callback.ts";

export async function handleTelegramCallbackDataLocally(data: string | undefined): Promise<
  | { ok: true; action: "research-task:create" | "brief:create"; outputPath: string; message: string }
  | { ok: false; message: string }
> {
  const parsed = parseTelegramCallbackData(data);
  if (!parsed) {
    return { ok: false, message: "Unsupported callback data." };
  }

  if (parsed.action === "research-task:create") {
    const outputPath = await writeResearchTaskForCandidateId(parsed.candidateId);
    if (!outputPath) {
      return { ok: false, message: `Research task creation failed: candidate not found (${parsed.candidateId})` };
    }

    return { ok: true, action: parsed.action, outputPath, message: `Research task created: ${outputPath}` };
  }

  if (parsed.action === "brief:create") {
    const outputPath = await writeWritingBriefForCandidateId(parsed.candidateId);
    if (!outputPath) {
      return { ok: false, message: `Writing brief creation failed: candidate not found (${parsed.candidateId})` };
    }

    const message = outputPath.includes("research-task-")
      ? `Writing brief blocked because this candidate is not verified. Research task created: ${outputPath}`
      : `Writing brief created: ${outputPath}`;
    return { ok: true, action: parsed.action, outputPath, message };
  }

  return { ok: false, message: "Callback action requires Notion status handling." };
}

function buildWritingBriefKeyboard(candidateId: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "Writing Brief 만들기",
          callback_data: buildTelegramCallbackData("brief:create", candidateId)
        }
      ]
    ]
  };
}

function buildPostSelectionKeyboard(candidateId: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "Make Writing Brief",
          callback_data: buildTelegramCallbackData("brief:create", candidateId)
        },
        {
          text: "Make Research Task",
          callback_data: buildTelegramCallbackData("research-task:create", candidateId)
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

  if (parsed.action === "research-task:create") {
    const result = await handleTelegramCallbackDataLocally(callbackQuery.data);
    if (!result.ok) {
      warn(result.message);
      await answerCallbackQuery(botToken, callbackQuery.id, result.message.slice(0, 180)).catch((error) =>
        warn(error instanceof Error ? error.message : String(error))
      );
      return;
    }

    const message = result.message;
    await answerCallbackQuery(botToken, callbackQuery.id, "Research task created");
    await sendTelegramMessage(message);
    info(message);
    return;
  }

  if (parsed.action === "brief:create") {
    const outputPath = await writeWritingBriefForCandidateId(parsed.candidateId);
    if (!outputPath) {
      const message = `Writing brief 생성 실패: 후보를 찾지 못했습니다 (${parsed.candidateId})`;
      warn(message);
      await answerCallbackQuery(botToken, callbackQuery.id, message.slice(0, 180)).catch((error) =>
        warn(error instanceof Error ? error.message : String(error))
      );
      return;
    }

    const isResearchTask = outputPath.includes("research-task-");
    const label = isResearchTask ? "Research task 생성 완료" : "Writing brief 생성 완료";
    const message = isResearchTask
      ? `Writing brief blocked because this candidate is not verified. Research task created: ${outputPath}`
      : `${label}: ${outputPath}`;
    await answerCallbackQuery(botToken, callbackQuery.id, label);
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
  await registerTelegramCallbackCandidateIds([parsed.candidateId]).catch((error) =>
    warn(error instanceof Error ? error.message : String(error))
  );
  await sendTelegramMessage(
    confirmation,
    parsed.action === "selected" ? buildPostSelectionKeyboard(parsed.candidateId) : undefined
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
      await writeOffset(update.update_id + 1);
    } catch (error) {
      warn(error instanceof Error ? error.message : String(error));
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
