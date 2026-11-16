import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Browser security headers on every response. The Content-Security-Policy (with a per-request nonce, no inline scripts)
// is set by src/middleware.ts, because the nonce must change on every request.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },                      // never shown inside another site (clickjacking)
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }])
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // do not advertise the framework
  // Files go straight to storage (see useFormAction); forms themselves are small. 8 MB leaves room without inviting abuse.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  productionBrowserSourceMaps: false, // do not publish the source code to the browser
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Signed-in pages and API answers are personal: never stored by the browser or a shared cache.
      { source: "/((?!_next/static|_next/image|favicon.ico|arkhya-lockup-dark.svg).*)", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] }
    ];
  },
};

export default nextConfig;
