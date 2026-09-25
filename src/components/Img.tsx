import Image from "next/image";
import { cn } from "@/lib/format";

type Props = { src: string; alt?: string; className?: string } & (
  | { width: number; height?: number; fill?: false; sizes?: string }
  | { fill: true; sizes: string; width?: undefined; height?: undefined }
);

/**
 * Картинка из админки. Загруженные файлы (/uploads/…) отдаёт оптимизатор Next: WebP нужного размера под экран, с кэшем.
 * Заглушки из public/img (SVG) и любые другие адреса выводятся обычным <img>: оптимизатору они не нужны.
 * width/height — размер на экране в пикселях (по нему подбирается 1x/2x); fill — картинка заполняет положенный (relative) блок, тогда sizes обязателен.
 */
export function Img({ src, alt = "", className, ...rest }: Props) {
  if (!src.startsWith("/uploads/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={cn(rest.fill && "absolute inset-0 size-full", className)} />;
  }
  if (rest.fill) return <Image src={src} alt={alt} fill sizes={rest.sizes} className={className} />;
  return <Image src={src} alt={alt} width={rest.width} height={rest.height ?? rest.width} sizes={rest.sizes} className={className} />;
}
