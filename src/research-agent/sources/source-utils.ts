import { createHash } from "node:crypto";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function checksum(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertSafeManualUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("--url must be a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Manual URL collector only accepts http/https URLs.");
  }

  const host = url.hostname.toLowerCase();
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    throw new Error("LinkedIn URLs are not allowed.");
  }

  return url;
}

export function isSafeManualUrl(value: string): boolean {
  try {
    assertSafeManualUrl(value);
    return true;
  } catch {
    return false;
  }
}

export function looksLoginOrPaywalled(html: string): boolean {
  const lower = html.toLowerCase();
  return [
    "login required",
    "sign in to continue",
    "subscribe to continue",
    "paywall",
    "members-only",
    "로그인",
    "구독"
  ].some((marker) => lower.includes(marker));
}
