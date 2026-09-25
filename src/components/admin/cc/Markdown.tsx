import { Fragment } from "react";
import { Link } from "@/i18n/navigation";
import { parseInline, parseMarkdown, type Block, type Inline } from "@/lib/markdown";
import { cn } from "@/lib/format";

/**
 * Документ Библиотеки с разметкой. Только React-элементы из разобранного дерева — HTML из текста не вставляется.
 * Ссылки на соседние .md ведут на эти же документы в Библиотеке, внешние открываются в новой вкладке
 */
export function Markdown({ source, docPath }: { source: string; docPath?: string | null }) {
  return <div className="space-y-3 text-[15px] leading-relaxed">{parseMarkdown(source).map((b, i) => renderBlock(b, i, docPath))}</div>;
}

/** Относительная ссылка на .md → путь документа в репозитории (docs/roles/../WORKERS.md → docs/WORKERS.md) */
function resolveDoc(href: string, docPath?: string | null) {
  const [file, anchor] = href.split("#");
  if (!file.endsWith(".md")) return null;
  const baseDir = docPath?.includes("/") ? docPath.slice(0, docPath.lastIndexOf("/")) : "";
  const parts = (file.startsWith("/") ? file.slice(1) : baseDir ? `${baseDir}/${file}` : file).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return { slug: out.join("/"), anchor };
}

function renderInline(nodes: Inline[], docPath?: string | null, key = ""): React.ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}${i}`;
    if (n.t === "text") return <Fragment key={k}>{n.v}</Fragment>;
    if (n.t === "code") return <code key={k} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em]">{n.v}</code>;
    if (n.t === "b") return <b key={k}>{renderInline(n.c, docPath, `${k}-`)}</b>;
    if (n.t === "i") return <i key={k}>{renderInline(n.c, docPath, `${k}-`)}</i>;
    const doc = /^https?:\/\//i.test(n.href) ? null : resolveDoc(n.href, docPath);
    if (doc)
      return (
        <Link key={k} href={`/admin/control/library?doc=${encodeURIComponent(doc.slug)}`} className="text-brand underline-offset-2 hover:underline">
          {renderInline(n.c, docPath, `${k}-`)}
        </Link>
      );
    if (/^https?:\/\//i.test(n.href))
      return (
        <a key={k} href={n.href} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
          {renderInline(n.c, docPath, `${k}-`)}
        </a>
      );
    return <Fragment key={k}>{renderInline(n.c, docPath, `${k}-`)}</Fragment>;
  });
}

const inline = (s: string, docPath?: string | null) => renderInline(parseInline(s), docPath);

function renderBlock(b: Block, i: number, docPath?: string | null): React.ReactNode {
  switch (b.type) {
    case "h": {
      const cls = b.level === 1 ? "text-2xl font-bold tracking-tight" : b.level === 2 ? "mt-6 text-xl font-semibold" : b.level === 3 ? "mt-4 text-base font-semibold" : "mt-3 text-sm font-semibold";
      const Tag = `h${Math.min(6, b.level + 1)}` as "h2";
      return (
        <Tag key={i} className={cls}>
          {inline(b.text, docPath)}
        </Tag>
      );
    }
    case "p":
      return <p key={i}>{inline(b.text, docPath)}</p>;
    case "hr":
      return <hr key={i} className="border-line" />;
    case "code":
      return (
        <pre key={i} className="overflow-x-auto rounded-lg bg-surface p-3 font-mono text-[12.5px] leading-snug">
          {b.text}
        </pre>
      );
    case "quote":
      return (
        <blockquote key={i} className="border-l-4 border-line pl-3 text-muted">
          {b.blocks.map((x, j) => renderBlock(x, j, docPath))}
        </blockquote>
      );
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag key={i} className={cn("space-y-1", b.ordered ? "list-decimal" : "list-disc", "pl-5")}>
          {b.items.map((it, j) => (
            <li key={j} style={{ marginLeft: `${it.level * 1.25}rem` }}>
              {inline(it.text, docPath)}
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div key={i} className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface/70 text-left text-xs text-muted">
              <tr>
                {b.head.map((h, j) => (
                  <th key={j} className="px-3 py-2 font-medium">
                    {inline(h, docPath)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {b.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k} className="px-3 py-2 align-top">
                      {inline(c, docPath)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
