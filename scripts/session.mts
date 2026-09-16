// npx tsx scripts/session.ts +37400000000 → печатает токен сессии (только для локальных тестов)
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const phone = process.argv[2];
const u = await db.user.findUniqueOrThrow({ where: { phone } });
const token = crypto.randomBytes(32).toString("base64url");
await db.session.create({ data: { userId: u.id, tokenHash: crypto.createHmac("sha256", process.env.SESSION_SECRET || "dev").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86400_000) } });
console.log(token);
await db.$disconnect();
