-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "grade" TEXT,
ADD COLUMN     "score" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailReports" BOOLEAN NOT NULL DEFAULT true;
