import { addDays, ymd } from "./time";

/** Мастер может получить уведомление — у него есть chat ID в @ihelp_staff_bot */
export function masterCanReceive(staffChatId: string | null | undefined): boolean {
  return !!staffChatId;
}

/** YYYY-MM-DD «завтра» в поясе Asia/Yerevan (UTC+4) для данного момента */
export function tomorrowYmd(now: Date): string {
  return addDays(ymd(now), 1);
}

/** Подставить параметры в шаблон вида «Привет, {name}!» */
export function fillTemplate(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), v), template);
}
