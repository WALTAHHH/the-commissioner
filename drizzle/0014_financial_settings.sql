ALTER TABLE "leagues" ADD COLUMN "financial_visibility" text;
ALTER TABLE "leagues" ADD COLUMN "payment_instructions" text;
ALTER TABLE "leagues" ADD COLUMN "currency" text DEFAULT 'USD';