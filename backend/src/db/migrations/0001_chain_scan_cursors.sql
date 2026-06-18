CREATE TABLE IF NOT EXISTS "chain_scan_cursors" (
	"name" text PRIMARY KEY NOT NULL,
	"last_scanned_block" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
