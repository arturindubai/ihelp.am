/** Экранирование текста для HTML-разметки Telegram (parse_mode: HTML) */
export function escapeHtml(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Шаблон сообщения: разметка пишется как есть, подставленные значения экранируются.
 * html`<b>Заказ №${n}</b> ${user.name}` — имя клиента с «&» или «<» не сломает сообщение и не станет ссылкой.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? escapeHtml(String(values[i] ?? "")) : ""), "");
}
