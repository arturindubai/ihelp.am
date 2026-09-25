-- Индекс для лимита OTP-кодов по IP: ускоряет запрос count в src/server/otp.ts
CREATE INDEX "OtpCode_ip_createdAt_idx" ON "OtpCode"("ip", "createdAt");
