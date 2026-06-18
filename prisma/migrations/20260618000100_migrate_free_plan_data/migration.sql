-- Migrate existing STARTER users to FREE (payment is a stub — none have paid)
UPDATE "User" SET plan = 'FREE' WHERE plan = 'STARTER';

-- Change default for new users to FREE
ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'FREE';
