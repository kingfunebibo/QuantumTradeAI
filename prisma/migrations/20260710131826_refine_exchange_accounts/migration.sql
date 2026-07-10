-- CreateEnum
CREATE TYPE "ExchangeAccountType" AS ENUM ('SPOT', 'FUTURES', 'UNIFIED', 'MARGIN', 'OPTIONS');

-- AlterTable
ALTER TABLE "ExchangeAccount" ADD COLUMN     "accountType" "ExchangeAccountType" NOT NULL DEFAULT 'SPOT',
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "nickname" TEXT;

-- CreateIndex
CREATE INDEX "ExchangeAccount_accountType_idx" ON "ExchangeAccount"("accountType");
