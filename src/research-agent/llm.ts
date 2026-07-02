import type { CandidateEnrichment, RawSourceItem, ScoutCandidate } from "./types.ts";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.5";

type LlmConfig = {
  apiKey?: string;
  model: string;
};

const enrichmentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    oneLineSummary: {
      type: "string",
      description: "한국어 한 문장 요약. 단순 기사 요약이 아니라 글감 판단용으로 쓴다."
    },
    coreWhyGudiQuestion: {
      type: "string",
      description: "구체 대상과 이상한 전략 선택이 들어간 '왜 굳이?' 질문."
    },
    businessObservationAngle: {
      type: "string",
      description: "포지셔닝, 유통, 수익모델, 전략, 투자, 고객 접점 관점의 비즈니스 해석."
    },
    consumerBehaviorAngle: {
      type: "string",
      description: "소비자의 구매, 방문, 선택, 신뢰, 선물, 비교, 루틴 관점의 해석."
    },
    connectionToExistingPosts: {
      type: "string",
      description: "Olive Better식 비즈니스 관찰기나 학생 분석가 톤과의 연결."
    },
    recommendedFormat: {
      type: "string",
      enum: ["장문 관찰기", "짧은 포스트", "캐러셀", "비교글", "저장만"]
    },
    nextAction: {
      type: "string",
      enum: ["채택 검토", "추가 조사", "직접 방문", "보류", "폐기", "글쓰기 에이전트로 전달"]
    }
  },
  required: [
    "oneLineSummary",
    "coreWhyGudiQuestion",
    "businessObservationAngle",
    "consumerBehaviorAngle",
    "connectionToExistingPosts",
    "recommendedFormat",
    "nextAction"
  ]
} as const;

export function readLlmConfig(): LlmConfig {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL
  };
}

function systemPrompt(): string {
  return [
    "너는 LinkedIn 글쓰기용 Research Scout Agent다.",
    "최종 글을 쓰지 말고, 글감 판단용 후보 브리프만 만든다.",
    "단순 뉴스 요약이 아니라 구체 사례에서 '왜 굳이?' 질문을 만든다.",
    "사용자는 전문가인 척하는 사람이 아니라 학생 분석가다.",
    "출처에 없는 사실, 숫자, 회사 관계, 성과를 절대 invent하지 않는다.",
    "모든 출력은 한국어로 쓴다."
  ].join("\n");
}

function userPrompt(item: RawSourceItem, fallback: ScoutCandidate): string {
  return JSON.stringify(
    {
      task: "다음 raw item을 LinkedIn 비즈니스 관찰기 후보 브리프로 가공해라.",
      rawItem: item,
      ruleBasedFallback: {
        topicName: fallback.topicName,
        category: fallback.category,
        oneLineSummary: fallback.oneLineSummary,
        coreWhyGudiQuestion: fallback.coreWhyGudiQuestion,
        businessObservationAngle: fallback.businessObservationAngle,
        consumerBehaviorAngle: fallback.consumerBehaviorAngle,
        connectionToExistingPosts: fallback.connectionToExistingPosts,
        recommendedFormat: fallback.recommendedFormat,
        nextAction: fallback.nextAction
      },
      constraints: [
        "구체 브랜드, 매장, 앱, 스타트업, 제품, 투자 사례에서 출발한다.",
        "coreWhyGudiQuestion에는 '왜 굳이'가 들어가야 한다.",
        "학생 분석가가 자연스럽게 쓸 수 있는 톤으로 쓴다.",
        "깊은 리포트가 아니라 빠른 판단용 짧은 브리프로 쓴다.",
        "출처에 없는 사실을 추가하지 않는다."
      ]
    },
    null,
    2
  );
}

function extractText(response: unknown): string | undefined {
  if (!response || typeof response !== "object") {
    return undefined;
  }

  const asRecord = response as Record<string, unknown>;
  if (typeof asRecord.output_text === "string") {
    return asRecord.output_text;
  }

  const output = asRecord.output;
  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const outputItem of output) {
    if (!outputItem || typeof outputItem !== "object") {
      continue;
    }

    const content = (outputItem as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const text = (contentItem as Record<string, unknown>).text;
      if (typeof text === "string") {
        return text;
      }
    }
  }

  return undefined;
}

function assertCandidateEnrichment(value: unknown): asserts value is CandidateEnrichment {
  if (!value || typeof value !== "object") {
    throw new Error("LLM output is not an object.");
  }

  const candidate = value as Partial<CandidateEnrichment>;
  const requiredFields: Array<keyof CandidateEnrichment> = [
    "oneLineSummary",
    "coreWhyGudiQuestion",
    "businessObservationAngle",
    "consumerBehaviorAngle",
    "connectionToExistingPosts",
    "recommendedFormat",
    "nextAction"
  ];

  for (const field of requiredFields) {
    if (typeof candidate[field] !== "string" || candidate[field]?.trim() === "") {
      throw new Error(`LLM output is missing required field: ${field}`);
    }
  }

  if (!candidate.coreWhyGudiQuestion?.includes("왜 굳이")) {
    throw new Error("LLM output coreWhyGudiQuestion must include '왜 굳이'.");
  }
}

export async function enrichCandidateWithLlm(
  item: RawSourceItem,
  fallback: ScoutCandidate,
  config = readLlmConfig()
): Promise<CandidateEnrichment> {
  if (!config.apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: "system",
          content: systemPrompt()
        },
        {
          role: "user",
          content: userPrompt(item, fallback)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "research_candidate_enrichment",
          strict: true,
          schema: enrichmentSchema
        }
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}: ${body.slice(0, 300)}`);
  }

  const responseJson: unknown = await response.json();
  const text = extractText(responseJson);
  if (!text) {
    throw new Error("OpenAI response did not include output text.");
  }

  const parsed: unknown = JSON.parse(text);
  assertCandidateEnrichment(parsed);
  return parsed;
}

export function applyEnrichment(
  candidate: ScoutCandidate,
  enrichment: CandidateEnrichment
): ScoutCandidate {
  return {
    ...candidate,
    oneLineSummary: enrichment.oneLineSummary.trim(),
    coreWhyGudiQuestion: enrichment.coreWhyGudiQuestion.trim(),
    businessObservationAngle: enrichment.businessObservationAngle.trim(),
    consumerBehaviorAngle: enrichment.consumerBehaviorAngle.trim(),
    connectionToExistingPosts: enrichment.connectionToExistingPosts.trim(),
    recommendedFormat: enrichment.recommendedFormat,
    nextAction: enrichment.nextAction
  };
}
