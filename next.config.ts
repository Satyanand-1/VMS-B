import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Forms send documents (max 5 MB each, several per form) through server actions; the default limit is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
};

export default nextConfig;
