import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.0/16", "10.0.0.0/8"],

  // Netlify's [[headers]] block covers CDN-served files, but not HTML emitted
  // by the Next.js runtime. Keep the baseline on both paths so pages and
  // static assets receive the same browser protections.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // "Beginners Foundation" is singular — Empowr's own wording: it is the
      // foundation of a skater's skills. The slug stayed plural until
      // 2026-08-31. The page had been publicly reachable since launch on
      // 08-27, so the old URL is kept alive rather than left to 404: it costs
      // three lines, and /sessions/[slug] sets dynamicParams = false, which
      // means a retired slug returns a hard 404 with nothing to follow.
      //
      // Permanent (308) because the rename is not going to be reversed.
      {
        source: "/sessions/beginners-foundations",
        destination: "/sessions/beginners-foundation",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
