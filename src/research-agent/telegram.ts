import type { ScoutCandidate } from "./types.ts";

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TOP_CANDIDATE_LIMIT = 5;

type TelegramConfig = {
  enabled: boolean;
  botToken?: string;
  chatId?: string;
};

type TelegramInlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

export function readTelegramConfig(): TelegramConfig {
  return {
    enabled: process.env.TELEGRAM_ENABLED === "1",
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID
  };
}

function warn(message: string): void {
  process.stderr.write(`Telegram warning: ${message}\n`);
}

export async function sendTelegramMessage(
  text: string,
  replyMarkup?: TelegramReplyMarkup,
  config = readTelegramConfig()
): Promise<boolean> {
  if (!config.enabled) {
    return false;
  }

  if (!config.botToken || !config.chatId) {
    warn("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required when TELEGRAM_ENABLED=1.");
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        reply_markup: replyMarkup
      })
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      warn(`sendMessage failed with ${response.status}${responseBody ? `: ${responseBody}` : ""}`);
      return false;
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warn(`sendMessage failed: ${message}`);
    return false;
  }
}

export function renderTelegramDailySummary(candidates: ScoutCandidate[]): string {
  const topCandidates = candidates.slice(0, TOP_CANDIDATE_LIMIT);
  const lines = [`오늘 LinkedIn 소재 후보 ${candidates.length}개를 Notion에 저장했습니다.`, "", "Top 5 후보"];

  topCandidates.forEach((candidate, index) => {
    lines.push(
      "",
      `${index + 1}. [${candidate.score}점] ${candidate.topicName}`,
      `카테고리: ${candidate.category}`,
      `왜 굳이?: ${candidate.coreWhyGudiQuestion}`
    );
  });

  return lines.join("\n");
}

export function buildCandidateInlineKeyboard(candidate: ScoutCandidate): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      buildCandidateStatusButtonRow(candidate),
      [
        {
          text: "Writing Brief 만들기",
          callback_data: `brief:${candidate.id}`
        }
      ]
    ]
  };
}

function buildCandidateStatusButtonRow(candidate: ScoutCandidate): TelegramInlineKeyboardButton[] {
  return [
    {
      text: "Selected",
      callback_data: `selected:${candidate.id}`
    },
    {
      text: "Shortlisted",
      callback_data: `shortlisted:${candidate.id}`
    },
    {
      text: "Rejected",
      callback_data: `rejected:${candidate.id}`
    }
  ];
}

export function buildDailySummaryInlineKeyboard(candidates: ScoutCandidate[]): TelegramReplyMarkup {
  return {
    inline_keyboard: candidates
      .slice(0, TOP_CANDIDATE_LIMIT)
      .map((candidate, index) =>
        buildCandidateStatusButtonRow(candidate).map((button) => ({
          ...button,
          text: `${index + 1}. ${button.text}`
        }))
      )
  };
}

export async function sendTelegramDailySummary(candidates: ScoutCandidate[]): Promise<boolean> {
  const config = readTelegramConfig();

  if (!config.enabled) {
    return false;
  }

  return sendTelegramMessage(renderTelegramDailySummary(candidates), buildDailySummaryInlineKeyboard(candidates), config);
}
