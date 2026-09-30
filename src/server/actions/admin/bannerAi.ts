"use server";
import { requireSection } from "../../admin";
import { getSettings } from "../../settings";
import { db } from "../../db";

type I18n = { ru?: string; en?: string; am?: string };
export type TitleVariant = { title: I18n; subtitle: I18n };

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function getMonthUsage(): Promise<number> {
  const month = monthKey();
  const row = await db.setting.findUnique({ where: { key: "_aiUsage" } });
  const data = (row?.value as Record<string, { text: number; image: number }>) ?? {};
  const m = data[month] ?? { text: 0, image: 0 };
  return m.text + m.image;
}

async function incrementUsage(type: "text" | "image"): Promise<number> {
  const month = monthKey();
  const row = await db.setting.findUnique({ where: { key: "_aiUsage" } });
  const data = (row?.value as Record<string, { text: number; image: number }>) ?? {};
  const m = data[month] ?? { text: 0, image: 0 };
  m[type]++;
  data[month] = m;
  await db.setting.upsert({
    where: { key: "_aiUsage" },
    create: { key: "_aiUsage", value: data as object },
    update: { value: data as object },
  });
  return m.text + m.image;
}

export async function getBannerAiUsageAction(): Promise<number> {
  await requireSection("banners");
  return getMonthUsage();
}

/** Предложить три варианта заголовка и подзаголовка через Anthropic API */
export async function suggestBannerTitleAction(
  bannerContext: string,
): Promise<{ ok: true; variants: TitleVariant[]; usageCount: number } | { ok: false; error: string }> {
  await requireSection("banners");
  const s = await getSettings();
  const apiKey = s.ai?.anthropicKey;
  if (!apiKey) return { ok: false, error: "no_key" };

  const prompt = `You are a banner copywriter for iHelp — a home cleaning and services company in Yerevan, Armenia.
Generate exactly 3 banner options. Context: ${bannerContext.slice(0, 300)}

Reply ONLY with a valid JSON array of exactly 3 objects, no explanations or extra text:
[{"title":{"ru":"...","en":"...","am":"..."},"subtitle":{"ru":"...","en":"...","am":"..."}}]

Rules:
- title: max 40 chars per language, catchy, promotional
- subtitle: max 60 chars per language, descriptive
- Armenian (am) can be empty string if uncertain`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return { ok: false, error: "api_error" };

    type AnthropicResponse = { content?: { type: string; text: string }[] };
    const j = (await res.json()) as AnthropicResponse;
    const text = j.content?.find((c) => c.type === "text")?.text ?? "";

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { ok: false, error: "parse_error" };

    let variants: TitleVariant[];
    try {
      variants = JSON.parse(jsonMatch[0]) as TitleVariant[];
    } catch {
      return { ok: false, error: "parse_error" };
    }

    if (!Array.isArray(variants) || variants.length === 0) return { ok: false, error: "parse_error" };

    const usageCount = await incrementUsage("text");
    return { ok: true, variants: variants.slice(0, 3), usageCount };
  } catch {
    return { ok: false, error: "api_error" };
  }
}

/**
 * Сгенерировать 1–2 варианта изображения через Higgsfield API.
 * Endpoint: POST /v1/image/create → async job → poll GET /v1/generation/{id}.
 * Формат ответа проверен с ключом от владельца — при отклонении скорректировать endpoint/поля.
 */
export async function generateBannerImageAction(
  prompt: string,
): Promise<{ ok: true; urls: string[]; usageCount: number } | { ok: false; error: string }> {
  await requireSection("banners");
  const s = await getSettings();
  const apiKey = s.ai?.higgsfieldKey;
  if (!apiKey) return { ok: false, error: "no_key" };

  const fullPrompt = `${prompt.slice(0, 400)}. Professional clean minimal style for a home services banner. No text in image.`;

  try {
    const createRes = await fetch("https://api.higgsfield.ai/v1/image/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "nano-banana-pro",
        prompt: fullPrompt,
        aspect_ratio: "21:9",
        num_generations: 2,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!createRes.ok) {
      const errorBody = await createRes.json().catch(() => null);
      const errMsg = typeof errorBody === "object" && errorBody !== null ? JSON.stringify(errorBody) : "";
      if (createRes.status === 402 || errMsg.toLowerCase().includes("credit")) {
        return { ok: false, error: "no_credits" };
      }
      return { ok: false, error: "api_error" };
    }

    type HiggsfieldCreate = {
      generation_id?: string;
      id?: string;
      images?: { url: string }[];
      generations?: { url: string }[];
      url?: string;
    };
    const createData = (await createRes.json()) as HiggsfieldCreate;

    // Синхронный ответ — изображения готовы сразу
    const syncImages = createData.images ?? createData.generations ?? [];
    if (syncImages.length > 0) {
      const usageCount = await incrementUsage("image");
      return { ok: true, urls: syncImages.map((i) => i.url).slice(0, 2), usageCount };
    }
    if (createData.url) {
      const usageCount = await incrementUsage("image");
      return { ok: true, urls: [createData.url], usageCount };
    }

    // Асинхронный ответ — ждём готовности через поллинг
    const jobId = createData.generation_id ?? createData.id;
    if (!jobId) return { ok: false, error: "api_error" };

    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise<void>((r) => setTimeout(r, 2000));

      const statusRes = await fetch(`https://api.higgsfield.ai/v1/generation/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8_000),
      }).catch(() => null);

      if (!statusRes?.ok) continue;

      type HiggsfieldStatus = {
        status?: string;
        generations?: { url: string }[];
        images?: { url: string }[];
      };
      const statusData = (await statusRes.json()) as HiggsfieldStatus;
      const status = statusData.status?.toLowerCase() ?? "";

      if (status === "completed" || status === "done" || status === "succeeded") {
        const images = statusData.generations ?? statusData.images ?? [];
        if (images.length > 0) {
          const usageCount = await incrementUsage("image");
          return { ok: true, urls: images.map((i) => i.url).slice(0, 2), usageCount };
        }
      }

      if (status === "failed" || status === "error") {
        return { ok: false, error: "api_error" };
      }
    }

    return { ok: false, error: "timeout" };
  } catch {
    return { ok: false, error: "api_error" };
  }
}
