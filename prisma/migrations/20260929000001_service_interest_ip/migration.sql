-- IP-адрес для ограничения частоты заявок «Уведомить меня»
ALTER TABLE "service_interest" ADD COLUMN "ip" TEXT;
CREATE INDEX "service_interest_ip_createdAt_idx" ON "service_interest"("ip", "createdAt");
