/** Хуки Next.js на старте сервера. onRequestError — тех-алерт об ошибках обработки запросов. */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath: string; routeType: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRequestError } = await import("./server/alerts");
  await reportRequestError(err, request, context);
}
