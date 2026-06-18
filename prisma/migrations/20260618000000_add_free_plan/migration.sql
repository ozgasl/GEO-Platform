-- Add FREE value to Plan enum (must commit alone — cannot be used in the same transaction)
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'FREE' BEFORE 'STARTER';
