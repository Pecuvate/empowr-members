// Only this POST consumes the Supabase token. Link scanners may GET the email
// URL and the confirmation page as often as they like without invalidating it.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_CONFIRMATION_COOKIE,
  decodePendingAuthConfirmation,
} from "@/lib/auth-confirmation";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const origin = requestOrigin(request);
  const cookieStore = await cookies();
  const pending = decodePendingAuthConfirmation(
    cookieStore.get(AUTH_CONFIRMATION_COOKIE)?.value
  );

  cookieStore.set(AUTH_CONFIRMATION_COOKIE, "", {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/auth/confirm",
    maxAge: 0,
  });

  if (pending) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: pending.tokenHash,
      type: pending.type,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${pending.next}`, 303);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(
      "That sign-in link is invalid or has expired. Please request a new one."
    )}`,
    303
  );
}
