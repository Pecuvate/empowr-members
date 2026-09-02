// Email scanners routinely prefetch links. This GET deliberately does not
// verify the one-time token: it stages it in an HttpOnly cookie, removes it
// from the address bar, and sends the member to a page requiring a real POST.
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_CONFIRMATION_COOKIE,
  AUTH_CONFIRMATION_MAX_AGE,
  encodePendingAuthConfirmation,
  parseEmailOtpType,
  safeNext,
} from "@/lib/auth-confirmation";
import { requestOrigin } from "@/lib/request-origin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = parseEmailOtpType(searchParams.get("type"));
  const origin = requestOrigin(request);

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "That sign-in link is incomplete. Please request a new one."
      )}`,
      303
    );
  }

  // The harmless query marker is load-bearing on Netlify: when a redirect
  // destination has no query string, its edge layer preserves the source
  // query parameters. Supplying our own query makes it discard token_hash
  // instead of carrying that secret into the member's address bar.
  const response = NextResponse.redirect(`${origin}/auth/confirm?staged=1`, 303);
  response.cookies.set({
    name: AUTH_CONFIRMATION_COOKIE,
    value: encodePendingAuthConfirmation({
      tokenHash,
      type,
      next: safeNext(searchParams.get("next")),
    }),
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/auth/confirm",
    maxAge: AUTH_CONFIRMATION_MAX_AGE,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
