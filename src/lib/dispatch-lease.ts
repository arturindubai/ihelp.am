/** Порог устаревшего пульса в минутах: нет сигнала дольше — исполнитель считается неактивным */
export const LEASE_STALE_MIN = 10;

/**
 * Снимать ли аренду задачи при отказе agent_busy.
 * Снимаем только когда одновременно выполнены оба условия:
 *   — нет активного юнита ihelp-w-<агент>-* (процесс воркера не запущен);
 *   — последний пульс по задаче старше LEASE_STALE_MIN минут или пульса не было вовсе.
 * Если хотя бы одно условие не выполнено — исполнитель работает, аренду не трогать.
 */
export function shouldReleaseAgentBusy(
  unitActive: boolean,
  heartbeatAt: Date | null,
  now = new Date(),
  staleMin = LEASE_STALE_MIN,
): boolean {
  if (unitActive) return false;
  if (heartbeatAt && heartbeatAt.getTime() > now.getTime() - staleMin * 60_000) return false;
  return true;
}

/**
 * Пульс задачи устарел по записи из снимка плана?
 * Если запись не найдена (undefined) — неизвестное состояние, аренду не снимаем.
 * Снимаем только если запись найдена и пульс отсутствует или старше staleMin минут.
 */
export function staleHeartbeatForClaim(
  claim: { heartbeatAt: string | null } | undefined,
  now = new Date(),
  staleMin = LEASE_STALE_MIN,
): boolean {
  if (claim === undefined) return false;
  if (!claim.heartbeatAt) return true;
  return Date.parse(claim.heartbeatAt) <= now.getTime() - staleMin * 60_000;
}
