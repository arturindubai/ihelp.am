import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  // Загруженные картинки уже WebP; AVIF на сервере с 1 ГБ памяти не нужен. Имена файлов уникальны — кэш можно держать год
  images: { formats: ["image/webp"], localPatterns: [{ pathname: "/uploads/**" }], minimumCacheTTL: 31536000 },
};

export default withNextIntl(nextConfig);
