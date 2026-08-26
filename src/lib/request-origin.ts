// Origin for Stripe redirect URLs — proxy-aware (Netlify sits in front, so
// the raw request URL is the internal one), http for local dev hosts.
//
// Lives here rather than in a route because Phase 2's subscribe flow needs
// exactly the same rule as the booking flow, and a second copy would be free
// to drift — the failure mode that has already bitten this codebase twice
// with near-identical header components.
import "server-only";

export function requestOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
