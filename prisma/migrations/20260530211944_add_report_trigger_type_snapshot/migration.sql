-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('MANUAL', 'WEEKLY');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "snapshotId" TEXT,
ADD COLUMN     "triggerType" "TriggerType" NOT NULL DEFAULT 'MANUAL';
