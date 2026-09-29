import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { sectionsForUser } from "@/lib/adminAccess";
import { intakeCreate } from "@/server/services/ccBoard";
import { audit } from "@/server/audit";
import { formatPhone } from "@/lib/phone";
import { db } from "@/server/db";

/**
 * Постоянный маршрут для создания Intake: в отличие от Server Action работает
 * из старой вкладки после выкладки новой сборки. Используется IntakeButton.
 * Защищён той же проверкой прав, что и ccIntakeAction (секция control).
 * Дедупликация: тот же текст от того же автора в течение 2 минут — одна карточка.
 */
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || !sectionsForUser(u).includes("control"))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const raw = typeof (body as { text?: unknown }).text === "string" ? (body as { text: string }).text : "";
  const text = raw.trim();
  if (text.length < 10) return NextResponse.json({ ok: false, error: "too_short" }, { status: 400 });
  if (text.length > 8000) return NextResponse.json({ ok: false, error: "too_long" }, { status: 400 });

  const by = u.name || formatPhone(u.phone);

  // Защита от дублей при повторных попытках: тот же текст от того же автора за 2 минуты → одна карточка
  const dedup = await db.task.findFirst({
    where: {
      key: { startsWith: "IN-" },
      intakeText: text,
      createdBy: by,
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
    },
    select: { key: true },
  });
  if (dedup) return NextResponse.json({ ok: true, key: dedup.key });

  try {
    const task = await intakeCreate(text, by);
    await audit(u.id, "cc.intake", "Task", task.key);
    return NextResponse.json({ ok: true, key: task.key });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "too_short") return NextResponse.json({ ok: false, error: "too_short" }, { status: 400 });
    console.error("[cc intake api]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
