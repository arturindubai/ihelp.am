-- AlterEnum
ALTER TYPE "OtpChannel" ADD VALUE 'EMAIL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);
