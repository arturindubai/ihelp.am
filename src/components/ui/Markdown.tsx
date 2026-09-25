import React from "react";

// Рендерит инлайн-разметку: **жирный**, [текст](url)
function inline(text: string, baseKey: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    if (m[1] !== undefined) {
      out.push(<strong key={baseKey + i++}>{m[1]}</strong>);
    } else {
      out.push(
        <a key={baseKey + i++} href={m[3]} target="_blank" rel="noopener noreferrer" className="link">
          {m[2]}
        </a>
      );
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Простой Markdown-рендерер: ## заголовки, - списки, **жирный**, [текст](url)
export function Markdown({ text, className }: { text: string; className?: string }) {
  const nodes: React.ReactNode[] = [];
  const lines = text.split("\n");
  let listItems: React.ReactNode[] = [];
  let k = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    nodes.push(
      <ul key={k++} className="mb-4 list-disc pl-6 space-y-1">
        {listItems}
      </ul>
    );
    listItems = [];
  };

  for (const raw of lines) {
    const h3m = raw.match(/^### (.+)/);
    const h2m = raw.match(/^## (.+)/);
    const h1m = raw.match(/^# (.+)/);
    const lim = raw.match(/^[-*] (.+)/);

    if (h3m) {
      flushList();
      nodes.push(<h3 key={k++} className="h3 mt-5 mb-1">{inline(h3m[1], k)}</h3>);
    } else if (h2m) {
      flushList();
      nodes.push(<h2 key={k++} className="h2 mt-6 mb-2">{inline(h2m[1], k)}</h2>);
    } else if (h1m) {
      flushList();
      nodes.push(<h1 key={k++} className="h1 mt-6 mb-2">{inline(h1m[1], k)}</h1>);
    } else if (lim) {
      listItems.push(<li key={k++}>{inline(lim[1], k)}</li>);
    } else if (raw.trim() === "") {
      flushList();
    } else {
      flushList();
      nodes.push(<p key={k++} className="mb-3">{inline(raw, k)}</p>);
    }
  }
  flushList();

  return <div className={className}>{nodes}</div>;
}
