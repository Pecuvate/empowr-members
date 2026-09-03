// PKCE / email-link exchange. Handles both flows Supabase sends:
// ?code= (magic link / OAuth PKCE) and ?token_hash=&type= (email confirm).
//
// The redirect origin MUST come from requestOrigin(), not from
// new URL(request.url).origin. Netlify sits in front of this function, so the
// raw request URL carries the internal deploy host: a sign-in that started at
// members.empowrcic.org was being redirected to main--empowr-members.netlify.app.
// The session cookie verifyOtp/exchangeCodeForSession just set is host-only for
// the custom domain, so the member landed on a different origin with no session
// and was bounced straight back to /login — on the first email a new member
// ever receives. Found 2026-08-28 while e2e-testing the door walk-in flow.
//
// requestOrigin() already existed and is already used by every Stripe redirect;
// its own comment warns that a second copy of this rule would be free to drift.
// This route was the copy that drifted.
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { requestOrigin } from "@/lib/request-origin";
import { safeNext } from "@/lib/auth-confirmation";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = requestOrigin(request);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(
      "That sign-in link is invalid or has expired. Please try again."
    )}`
  );
}
