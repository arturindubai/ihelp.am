import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default withNextIntl(nextConfig);
