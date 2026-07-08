CREATE TYPE "public"."pay_method" AS ENUM('buy_goods', 'paybill');--> statement-breakpoint
ALTER TYPE "public"."rail" ADD VALUE 'mpesa_b2b_till';--> statement-breakpoint
ALTER TYPE "public"."rail" ADD VALUE 'mpesa_b2b_paybill';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "recipient_phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_pay_method" "pay_method";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_till_number" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_paybill_number" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_account_number" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "refund_tx_hash" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "refunded_at" timestamp;
