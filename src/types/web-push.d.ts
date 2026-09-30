// Минимальные типы web-push для проверки типов до пересборки образа.
// Источник: https://github.com/web-push-libs/web-push (v3.x, @types/web-push).
// При пересборке образа этот файл можно удалить — типы придут из @types/web-push.
declare module "web-push" {
  interface PushSubscriptionInput {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;

  function sendNotification(
    subscription: PushSubscriptionInput,
    payload?: string | Buffer | null,
    options?: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: string; headers: Record<string, string> }>;

  function generateVAPIDKeys(): { publicKey: string; privateKey: string };

  export { setVapidDetails, sendNotification, generateVAPIDKeys };
  export default { setVapidDetails, sendNotification, generateVAPIDKeys };
}
