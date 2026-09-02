// Session refresh + route guards — Pattern 1 (session guard) per
// _config/guides/auth-middleware.md. Public catalogue stays open;
// (member) routes need a session; (admin) allowlist check lives in the
// admin layout (needs no DB, but keeps middleware thin and testable).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const MEMBER_PREFIXES = ["/account", "/bookings", "/book", "/membership"];
const ADMIN_PREFIX = "/admin";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login") || path.startsWith("/signup");
  const needsSession =
    MEMBER_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ||
    path === ADMIN_PREFIX ||
    path.startsWith(`${ADMIN_PREFIX}/`);

  // Nothing on this route depends on who is asking, so skip the auth
  // round trip entirely rather than building a client to throw the answer
  // away. supabase.auth.getUser() is a real network call to /auth/v1/user
  // whenever a session cookie is present, and this runs on every public
  // page view — the catalogue was paying for a user it never read.
  //
  // The cost of skipping is that a signed-in member browsing only public
  // pages does not get their access token refreshed here. That is safe:
  // the refresh token outlives the access token by weeks, the browser
  // client refreshes on its own, and the first member or auth route they
  // touch runs the full path below.
  if (!needsSession && !isAuthPage) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && needsSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/account";
    // Carry an auth error across rather than dropping it. The auth completion
    // routes report a dead link by redirecting to /login?error=..., and this
    // redirect used to wipe the query string — so a signed-in member who
    // followed an expired or already-used password-reset link landed on
    // their own account with NO message at all. That reads as success: they
    // believe the password changed when it did not. Reported 2026-08-31.
    const error = request.nextUrl.searchParams.get("error");
    url.search = error ? `?error=${encodeURIComponent(error)}` : "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
