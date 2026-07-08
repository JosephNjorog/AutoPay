/**
 * Lightweight startup migrator.
 *
 * Drizzle Kit's migrate command requires a direct (non-pooled) connection,
 * which isn't always available in production environments. This module applies
 * any outstanding DDL statements via the existing app connection pool instead.
 *
 * Each entry is idempotent (IF NOT EXISTS / IF EXISTS guards) so it is safe to
 * run on every cold start.
 */

import { sql } from "drizzle-orm";
import { db } from "./index";

const MIGRATIONS: { name: string; up: string }[] = [
  {
    name: "0004_terms_consent",
    up: `
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp,
        ADD COLUMN IF NOT EXISTS "terms_accepted_ip" text,
        ADD COLUMN IF NOT EXISTS "terms_version"     text
    `,
  },
  // 0005_nifty_purifiers — this one was only ever added as a drizzle-kit SQL
  // file (src/db/migrations/0005_nifty_purifiers.sql) and never ported into
  // this startup migrator, so it silently never ran against production:
  // schema.ts declares users.fullName etc, but the live table never got the
  // column, and every query touching `users` failed with
  // `column "full_name" does not exist`.
  {
    name: "0005_nifty_purifiers/enum_kyc_status",
    up: `DO $$ BEGIN CREATE TYPE "public"."kyc_status" AS ENUM('verified', 'rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  },
  {
    name: "0005_nifty_purifiers/enum_agent_audit_event",
    up: `DO $$ BEGIN CREATE TYPE "public"."agent_audit_event" AS ENUM('permission_granted', 'permission_updated', 'permission_revoked', 'kill_switch_activated', 'anomaly_flagged'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  },
  {
    name: "0005_nifty_purifiers/enum_agent_review_status",
    up: `DO $$ BEGIN CREATE TYPE "public"."agent_review_status" AS ENUM('pending', 'reviewed'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  },
  {
    name: "0005_nifty_purifiers/users_columns",
    up: `
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "full_name" text,
        ADD COLUMN IF NOT EXISTS "date_of_birth" date,
        ADD COLUMN IF NOT EXISTS "id_type" text,
        ADD COLUMN IF NOT EXISTS "id_number" text,
        ADD COLUMN IF NOT EXISTS "kyc_status" "kyc_status",
        ADD COLUMN IF NOT EXISTS "kyc_rejection_reason" text,
        ADD COLUMN IF NOT EXISTS "kyc_submitted_at" timestamp
    `,
  },
  {
    name: "0005_nifty_purifiers/agent_audit_log",
    up: `
      CREATE TABLE IF NOT EXISTS "agent_audit_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "event_type" "agent_audit_event" NOT NULL,
        "detail" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `,
  },
  {
    name: "0005_nifty_purifiers/agent_permissions",
    up: `
      CREATE TABLE IF NOT EXISTS "agent_permissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "max_transaction_usd" numeric NOT NULL,
        "approved_recipients" jsonb DEFAULT '[]' NOT NULL,
        "approved_corridors" jsonb DEFAULT '[]' NOT NULL,
        "max_tx_per_day" integer NOT NULL,
        "version" integer DEFAULT 1 NOT NULL,
        "revoked_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "agent_permissions_user_id_unique" UNIQUE("user_id")
      )
    `,
  },
  {
    name: "0005_nifty_purifiers/agent_review_events",
    up: `
      CREATE TABLE IF NOT EXISTS "agent_review_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "reason" text NOT NULL,
        "detail" jsonb,
        "status" "agent_review_status" DEFAULT 'pending' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `,
  },
  {
    name: "0005_nifty_purifiers/fk_agent_audit_log",
    up: `
      DO $$ BEGIN
        ALTER TABLE "agent_audit_log" ADD CONSTRAINT "agent_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `,
  },
  {
    name: "0005_nifty_purifiers/fk_agent_permissions",
    up: `
      DO $$ BEGIN
        ALTER TABLE "agent_permissions" ADD CONSTRAINT "agent_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `,
  },
  {
    name: "0005_nifty_purifiers/fk_agent_review_events",
    up: `
      DO $$ BEGIN
        ALTER TABLE "agent_review_events" ADD CONSTRAINT "agent_review_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `,
  },
  {
    name: "0005_nifty_purifiers/idx_agent_audit_log_user_id",
    up: `CREATE INDEX IF NOT EXISTS "agent_audit_log_user_id_idx" ON "agent_audit_log" USING btree ("user_id")`,
  },
  {
    name: "0005_nifty_purifiers/idx_agent_audit_log_created_at",
    up: `CREATE INDEX IF NOT EXISTS "agent_audit_log_created_at_idx" ON "agent_audit_log" USING btree ("created_at")`,
  },
  {
    name: "0005_nifty_purifiers/idx_agent_permissions_user_id",
    up: `CREATE INDEX IF NOT EXISTS "agent_permissions_user_id_idx" ON "agent_permissions" USING btree ("user_id")`,
  },
  {
    name: "0005_nifty_purifiers/idx_agent_review_events_user_id",
    up: `CREATE INDEX IF NOT EXISTS "agent_review_events_user_id_idx" ON "agent_review_events" USING btree ("user_id")`,
  },
  {
    name: "0005_nifty_purifiers/idx_agent_review_events_status",
    up: `CREATE INDEX IF NOT EXISTS "agent_review_events_status_idx" ON "agent_review_events" USING btree ("status")`,
  },
];

export async function runStartupMigrations(): Promise<void> {
  for (const migration of MIGRATIONS) {
    try {
      await db.execute(sql.raw(migration.up));
      console.log(`[migrate] ✓ ${migration.name}`);
    } catch (err) {
      // Column already exists is fine — anything else is a real error
      const msg = (err as Error).message ?? "";
      if (msg.includes("already exists")) {
        console.log(`[migrate] ↩ ${migration.name} (already applied)`);
      } else {
        console.error(`[migrate] ✗ ${migration.name}:`, msg);
        throw err;
      }
    }
  }
}
