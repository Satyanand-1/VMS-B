import type { NextConfig } from "next";

// Supabase origin (API, storage uploads from the browser, signed file links).
const supabase = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin; } catch { return ""; }
})();
const dev = process.env.NODE_ENV !== "production";

// Browser security headers on every page.
const csp = [
  "default-src 'self'",
  // Next.js needs inline scripts for hydration ('unsafe-eval' only in development for fast refresh).
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${supabase}`,
  // Invoice Management shows PDFs inside the page (from the app's file links, which redirect to private storage).
  `frame-src 'self' ${supabase}`,
  `connect-src 'self' ${supabase}${dev ? " ws: http://127.0.0.1:* http://localhost:*" : ""}`,
  "frame-ancestors 'none'",   // the app cannot be embedded in another site (clickjacking)
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // Production on HTTPS (Vercel + hosted Supabase): any http:// request is upgraded. Skipped for a local http Supabase.
  ...(!dev && supabase.startsWith("https://") ? ["upgrade-insecure-requests"] : [])
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }])
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // do not advertise the framework
  // Files go straight to storage (see useFormAction); forms themselves are small. 8 MB leaves room without inviting abuse.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
