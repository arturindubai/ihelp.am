export function amd(n: number) {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(n)).replace(/ /g, " ")} ֏`;
}

export function durationLabel(min: number, locale: string) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const H = locale === "en" ? "h" : locale === "am" ? "ժ" : "ч";
  const M = locale === "en" ? "min" : locale === "am" ? "ր" : "мин";
  if (!h) return `${m} ${M}`;
  return m ? `${h} ${H} ${m} ${M}` : `${h} ${H}`;
}

export function dateLabel(d: Date, locale: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", weekday: "short" }) {
  const loc = locale === "am" ? "hy-AM" : locale === "en" ? "en-GB" : "ru-RU";
  return new Intl.DateTimeFormat(loc, { timeZone: "Asia/Yerevan", ...opts }).format(d);
}

export function timeLabel(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Yerevan", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
