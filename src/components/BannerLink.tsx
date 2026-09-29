"use client";
import { Link } from "@/i18n/navigation";

type Props = {
  bannerId: string;
  href: string;
  children: React.ReactNode;
};

/** Ссылка-обёртка для баннера: при клике отправляет POST /api/banner для счётчика кликов */
export function BannerLink({ bannerId, href, children }: Props) {
  const trackClick = () => {
    fetch("/api/banner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bannerId }),
    }).catch(() => {});
  };

  return (
    <Link href={href} onClick={trackClick}>
      {children}
    </Link>
  );
}
