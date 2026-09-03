import type { EmailOtpType } from "@supabase/supabase-js";

export const AUTH_CONFIRMATION_COOKIE = "empowr-auth-confirmation";
export const AUTH_CONFIRMATION_MAX_AGE = 60 * 60;

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export type PendingAuthConfirmation = {
  tokenHash: string;
  type: EmailOtpType;
  next: string;
};

export function parseEmailOtpType(value: string | null): EmailOtpType | null {
  return value && EMAIL_OTP_TYPES.has(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

// Only ever redirect within this app.
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/account";
  }
  return next;
}

export function encodePendingAuthConfirmation(
  value: PendingAuthConfirmation
): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodePendingAuthConfirmation(
  value: string | undefined
): PendingAuthConfirmation | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    );
    if (!parsed || typeof parsed !== "object") return null;

    const candidate = parsed as Record<string, unknown>;
    const type = parseEmailOtpType(
      typeof candidate.type === "string" ? candidate.type : null
    );
    if (
      typeof candidate.tokenHash !== "string" ||
      candidate.tokenHash.length === 0 ||
      !type
    ) {
      return null;
    }

    return {
      tokenHash: candidate.tokenHash,
      type,
      next: safeNext(
        typeof candidate.next === "string" ? candidate.next : null
      ),
    };
  } catch {
    return null;
  }
}
