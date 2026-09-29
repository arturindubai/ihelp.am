import type { ReactNode } from "react";

/** Строки, которые показываются только исполнителю: блоки кода, команды, пути, таблицы, поля схемы */
function isDevLine(line: string): boolean {
  return (
    /^```/.test(line) ||
    /^\s*(node |git |docker |npx |npm )/.test(line) ||
    /\/opt\/|\/src\/|\/docs\/|\/scripts\/|\/uploads\//.test(line) ||
    /^\s*\|.+\|/.test(line) ||
    /cc\.mjs/.test(line) ||
    /командой:/i.test(line) ||
    // camelCase-поля схемы вида «mockupUrl: …», «blockedReason: …»
    /\b[a-z][a-zA-Z]{2,}[A-Z][a-zA-Z]+:\s/.test(line)
  );
}

/**
 * Рендерит текст блокировки для владельца: заголовки, списки, жирный текст.
 * Блоки кода, команды и пути к файлам сворачиваются под <details>.
 * devOnlyLabel — переведённая метка спойлера (ключ admin.cc.you.devOnly).
 */
export function renderOwnerText(text: string, devOnlyLabel: string): ReactNode {
  const lines = text.split("\n");
  const result: ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;
  const k = () => keyCounter++;

  while (i < lines.length) {
    const line = lines[i];

    // Блок кода ```
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [line];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) { codeLines.push(lines[i]); i++; }
      result.push(
        <details key={k()} className="my-1">
          <summary className="btn-ghost btn-sm text-muted cursor-pointer">{devOnlyLabel}</summary>
          <pre className="rounded bg-surface p-2 text-xs text-muted overflow-x-auto whitespace-pre-wrap">
            {codeLines.join("\n")}
          </pre>
        </details>
      );
      continue;
    }

    // Таблица |...|
    if (/^\s*\|.+\|/.test(line)) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && /^\s*\|.+\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      result.push(
        <details key={k()} className="my-1">
          <summary className="btn-ghost btn-sm text-muted cursor-pointer">{devOnlyLabel}</summary>
          <pre className="rounded bg-surface p-2 text-xs text-muted overflow-x-auto">{tableLines.join("\n")}</pre>
        </details>
      );
      continue;
    }

    // Строка с командой или путём для исполнителя (одиночная)
    if (isDevLine(line)) {
      result.push(
        <details key={k()} className="my-1">
          <summary className="btn-ghost btn-sm text-muted cursor-pointer">{devOnlyLabel}</summary>
          <pre className="rounded bg-surface p-2 text-xs text-muted overflow-x-auto whitespace-pre-wrap">{line}</pre>
        </details>
      );
      i++;
      continue;
    }

    // Горизонтальный разделитель ---
    if (/^---+$/.test(line.trim())) {
      result.push(<hr key={k()} className="my-2 border-line" />);
      i++;
      continue;
    }

    // Заголовок ## или ###
    if (/^#{2,3}\s/.test(line)) {
      result.push(
        <h4 key={k()} className="font-semibold text-sm mt-2">{inlineRender(line.replace(/^#{2,3}\s/, ""))}</h4>
      );
      i++;
      continue;
    }

    // Маркированный список (- item или * item)
    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s/, ""));
        i++;
      }
      result.push(
        <ul key={k()} className="list-disc ml-4 text-sm">
          {items.map((item, idx) => <li key={idx}>{inlineRender(item)}</li>)}
        </ul>
      );
      continue;
    }

    // Нумерованный список (1. item или 1) item)
    if (/^\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s/, ""));
        i++;
      }
      result.push(
        <ol key={k()} className="list-decimal ml-4 text-sm">
          {items.map((item, idx) => <li key={idx}>{inlineRender(item)}</li>)}
        </ol>
      );
      continue;
    }

    // Пустая строка — пропуск
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Обычный абзац
    result.push(<p key={k()} className="mb-1 text-sm">{inlineRender(line)}</p>);
    i++;
  }

  return <>{result}</>;
}

/** Рендерит инлайн-разметку: **жирный** и `код` */
function inlineRender(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
          return <code key={i} className="rounded bg-surface px-1 font-mono text-xs">{part.slice(1, -1)}</code>;
        return part;
      })}
    </>
  );
}
