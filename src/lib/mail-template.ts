/** Простое письмо в фирменном оформлении: заголовок, текст, кнопка */
export function mailTemplate(opts: { title: string; lines: string[]; button?: { text: string; url: string }; brand: string }) {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = opts.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#1c1917">${esc(l)}</p>`).join("");
  const button = opts.button
    ? `<p style="margin:24px 0 0"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#c2521b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">${esc(opts.button.text)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f7f4f1;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1c1917">${esc(opts.brand)}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1c1917">${esc(opts.title)}</h1>
${body}${button}
</td></tr></table>
</td></tr></table></body></html>`;
}
