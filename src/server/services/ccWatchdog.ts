import "server-only";
import { db } from "../db";
import { html } from "../notify";
import { alertTech } from "../alerts";
import { getWorkersConfig, getTick } from "./workers";

const TECH_BLOCK_HOURS = 4;
const CTO_MSG_HOURS = 2;

/**
 * Тех-алерт: блокировка на технике старше 4 часов без смены статуса или адресата.
 * Вызывается сторожем раз в 15 минут; alertTech не шлёт повторы чаще раза в TECH_BLOCK_HOURS часов.
 */
export async function checkTechBlocks(now = new Date()) {
  const threshold = new Date(now.getTime() - TECH_BLOCK_HOURS * 3600_000);
  const tasks = await db.task.findMany({
    where: { status: "blocked", blockedOn: "tech", updatedAt: { lt: threshold } },
    select: { key: true, title: true, blockedReason: true, updatedAt: true },
  });
  for (const t of tasks) {
    const hours = Math.floor((now.getTime() - t.updatedAt.getTime()) / 3600_000);
    await alertTech(
      `cc:blocked-tech:${t.key}`,
      html`🔧 <b>${t.key}</b> заблокирована на технике уже ${hours} ч\n${t.title}${t.blockedReason ? `\n${t.blockedReason.slice(0, 300)}` : ""}\nСнять: node scripts/cc.mjs reblock ${t.key} "…" --on owner`,
      TECH_BLOCK_HOURS * 60,
    );
  }
  return tasks.length;
}

/**
 * Тех-алерт: непрочитанное сообщение роли cto старше 2 часов.
 * Вызывается сторожем раз в 15 минут; alertTech не шлёт повторы чаще раза в CTO_MSG_HOURS часов.
 */
export async function checkCtoMessages(now = new Date()) {
  const threshold = new Date(now.getTime() - CTO_MSG_HOURS * 3600_000);
  const messages = await db.ccMessage.findMany({
    where: { toRole: "cto", readAt: null, createdAt: { lt: threshold } },
    select: { id: true, fromAgent: true, text: true, taskKey: true, createdAt: true },
  });
  for (const m of messages) {
    const hours = Math.floor((now.getTime() - m.createdAt.getTime()) / 3600_000);
    await alertTech(
      `cc:cto-unread:${m.id}`,
      html`✉️ Непрочитанное роли <b>cto</b> уже ${hours} ч\nОт: ${m.fromAgent}${m.taskKey ? ` · ${m.taskKey}` : ""}\n${m.text.slice(0, 500)}\nПрочитать: /ru/admin/control?tab=notify`,
      CTO_MSG_HOURS * 60,
    );
  }
  return messages.length;
}

const DISPATCHER_STALE_MIN = 10;

/**
 * Тех-алерт: воркеры включены, но диспетчер не делал проход дольше 10 минут.
 * Сигнал: таймер systemd упал, скрипт сломан или сервер перегружен.
 * Вызывается сторожем раз в 15 минут; alertTech не шлёт повторы чаще раза в DISPATCHER_STALE_MIN минут.
 */
export async function checkDispatcherWatchdog(now = new Date()) {
  const config = await getWorkersConfig();
  if (!config.enabled) return 0;
  const tick = await getTick();
  if (!tick) return 0; // никогда не запускался — на вкладке «Воркеры» уже есть предупреждение
  const staleMin = Math.floor((now.getTime() - Date.parse(tick.at)) / 60_000);
  if (staleMin < DISPATCHER_STALE_MIN) return 0;
  await alertTech(
    "dispatcher:stale",
    html`⚠️ <b>Диспетчер воркеров не запускался ${staleMin} мин</b>\nПроверить: <code>journalctl -u ihelp-dispatcher -n 20 --no-pager</code>\nПерезапустить: <code>systemctl start ihelp-dispatcher</code>`,
    DISPATCHER_STALE_MIN,
  );
  return 1;
}
