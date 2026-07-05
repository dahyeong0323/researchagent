import type { ScoutCandidate } from "./types.ts";
import { buildTelegramCallbackData, registerTelegramCallbackCandidateIds } from "./telegram-callback.ts";

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

function nextActionForTelegram(candidate: ScoutCandidate): string {
  if (candidate.verificationStatus === "verified" && candidate.briefAllowed) {
    return "Make Writing Brief";
  }

  if (candidate.verificationStatus === "rejected") {
    return "Reject";
  }

  return "Make Research Task";
}

function missingFieldsLine(candidate: ScoutCandidate): string | undefined {
  if (candidate.verificationStatus === "verified" && candidate.briefAllowed) {
    return undefined;
  }

  const missingFields = candidate.missingFields ?? candidate.needsVerification ?? [];
  return `Missing Fields: ${missingFields.length > 0 ? missingFields.join(", ") : "needs-research"}`;
}

function evidenceLine(candidate: ScoutCandidate): string | undefined {
  if (candidate.verificationStatus !== "verified" || !candidate.briefAllowed) {
    return undefined;
  }

  return `Evidence: ${candidate.evidenceSnippet ?? "verified evidence present"}`;
}

export function renderTelegramDailySummary(candidates: ScoutCandidate[]): string {
  const topCandidates = candidates.slice(0, TOP_CANDIDATE_LIMIT);
  const lines = [`오늘 LinkedIn 소재 후보 ${candidates.length}개를 Notion에 저장했습니다.`, "", "Top 5 후보"];

  topCandidates.forEach((candidate, index) => {
    const displayName = candidate.entityName ?? candidate.topicName;
    const evidence = evidenceLine(candidate);
    const missingFields = missingFieldsLine(candidate);

    lines.push(
      "",
      `${index + 1}. [${candidate.score}점] ${displayName}`,
      `Score: ${candidate.score}`,
      `Entity/Topic: ${displayName}`,
      `Observed Feature: ${candidate.observedFeature ?? "needs-research"}`,
      `Verification Status: ${candidate.verificationStatus}`,
      `Source: ${candidate.sourceName}`,
      `Evidence Type: ${candidate.evidenceType}`,
      ...(evidence ? [evidence] : []),
      ...(missingFields ? [missingFields] : []),
      `Why Gudi Question: ${candidate.coreWhyGudiQuestion}`,
      `Brief Allowed: ${candidate.briefAllowed ? "yes" : "no"}`,
      `Next Action: ${nextActionForTelegram(candidate)}`
    );
  });

  return lines.join("\n");
}

export function buildCandidateInlineKeyboard(candidate: ScoutCandidate): TelegramReplyMarkup {
  const workflowButton =
    candidate.verificationStatus === "verified" && candidate.briefAllowed
      ? {
          text: "Make Writing Brief",
          callback_data: buildTelegramCallbackData("brief:create", candidate.candidateId)
        }
      : {
          text: "Make Research Task",
          callback_data: buildTelegramCallbackData("research-task:create", candidate.candidateId)
        };

  return {
    inline_keyboard: [buildCandidateStatusButtonRow(candidate), [workflowButton]]
  };
}

function buildCandidateStatusButtonRow(candidate: ScoutCandidate): TelegramInlineKeyboardButton[] {
  return [
    {
      text: "Selected",
      callback_data: buildTelegramCallbackData("selected", candidate.candidateId)
    },
    {
      text: "Shortlisted",
      callback_data: buildTelegramCallbackData("shortlisted", candidate.candidateId)
    },
    {
      text: "Rejected",
      callback_data: buildTelegramCallbackData("rejected", candidate.candidateId)
    },
    {
      text: "Needs Research",
      callback_data: buildTelegramCallbackData("needs-research", candidate.candidateId)
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
  if (candidates.length === 0) {
    return false;
  }

  const config = readTelegramConfig();

  if (!config.enabled) {
    return false;
  }

  await registerTelegramCallbackCandidateIds(candidates.map((candidate) => candidate.candidateId));
  return sendTelegramMessage(renderTelegramDailySummary(candidates), buildDailySummaryInlineKeyboard(candidates), config);
}

export async function sendTelegramDailySummaryIfEnabled(
  candidates: ScoutCandidate[],
  sender: (candidates: ScoutCandidate[]) => Promise<boolean> = sendTelegramDailySummary
): Promise<boolean> {
  if (candidates.length === 0 || !readTelegramConfig().enabled) {
    return false;
  }

  try {
    return await sender(candidates);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warn(`daily summary failed: ${message}`);
    return false;
  }
}
