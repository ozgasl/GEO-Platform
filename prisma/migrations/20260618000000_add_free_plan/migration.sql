-- This migration does not run in a transaction.
-- PostgreSQL requires ALTER TYPE ... ADD VALUE to commit before it can be used in the same migration.

-- Add FREE value to Plan enum
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'FREE' BEFORE 'STARTER';

-- Migrate all existing STARTER users to FREE (none have paid — payment is a stub)
UPDATE "User" SET plan = 'FREE' WHERE plan = 'STARTER';

-- Change default for new users to FREE
ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'FREE';
