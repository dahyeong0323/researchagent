import type { Country, RawSourceCategory } from "../types.ts";

export type FeedConfig = {
  feedName: string;
  feedUrl: string;
  sourceCategory: RawSourceCategory;
  country?: Country;
  language?: string;
  reliabilityTier: 1 | 2 | 3 | 4 | 5;
};

export function assertFeedConfigs(value: unknown): asserts value is FeedConfig[] {
  if (!Array.isArray(value)) {
    throw new Error("Feed config must be an array.");
  }

  value.forEach((feed, index) => {
    if (!feed || typeof feed !== "object") {
      throw new Error(`Feed config ${index + 1} must be an object.`);
    }

    const candidate = feed as Partial<FeedConfig>;
    for (const field of ["feedName", "feedUrl", "sourceCategory"] as const) {
      if (typeof candidate[field] !== "string" || candidate[field]?.trim() === "") {
        throw new Error(`Feed config ${index + 1} is missing ${field}.`);
      }
    }

    if (
      typeof candidate.reliabilityTier !== "number" ||
      candidate.reliabilityTier < 1 ||
      candidate.reliabilityTier > 5
    ) {
      throw new Error(`Feed config ${index + 1} must include reliabilityTier 1-5.`);
    }
  });
}
