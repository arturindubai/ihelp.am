/** Хуки Next.js. register — перехват журнала для Control Center → Логи; onRequestError — тех-алерт об ошибках обработки запросов. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installLogCapture } = await import("./server/logbuffer");
    installLogCapture();
  }
}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath: string; routeType: string }) {
  // Импорт только внутри этой проверки: так сборщик не тащит серверный код (база, crypto) в Edge-сборку
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportRequestError } = await import("./server/alerts");
    await reportRequestError(err, request, context);
  }
}
