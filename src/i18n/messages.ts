import { getUiOverrides } from "@/server/settings";
import ru from "../../messages/ru.json";

export type Msg = { [k: string]: string | Msg };

function deepMerge(base: Msg, extra: Msg): Msg {
  const out: Msg = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === "object" && typeof out[k] === "object") out[k] = deepMerge(out[k] as Msg, v as Msg);
    else if (v !== "" && v != null) out[k] = v;
  }
  return out;
}

function setPath(obj: Msg, path: string, value: string) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]] as Msg;
  }
  cur[parts[parts.length - 1]] = value;
}

/** Тексты интерфейса для языка: русский — базовый (непереведённое показывается по-русски), поверх — правки из админки */
export async function loadMessages(locale: string): Promise<Msg> {
  const own = (await import(`../../messages/${locale}.json`)).default as Msg;
  let messages = locale === "ru" ? (ru as unknown as Msg) : deepMerge(ru as Msg, own);
  const overrides = await getUiOverrides(locale);
  if (overrides.length) {
    messages = JSON.parse(JSON.stringify(messages));
    for (const o of overrides) setPath(messages, o.key, o.value);
  }
  return messages;
}
