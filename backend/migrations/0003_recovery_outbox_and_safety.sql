DO $$ BEGIN
 CREATE TYPE "public"."outbox_status" AS ENUM('queued', 'claimed', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "recovery_outbox_intents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"invoice_id" varchar(36) NOT NULL,
	"action_type" varchar(100) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"status" "outbox_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb,
	"provider_ref" varchar(255),
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "recovery_outbox_intents" ADD CONSTRAINT "recovery_outbox_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "recovery_outbox_intents" ADD CONSTRAINT "recovery_outbox_intents_session_id_recovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."recovery_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "recovery_outbox_intents" ADD CONSTRAINT "recovery_outbox_intents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "recovery_outbox_tenant_status_idx" ON "recovery_outbox_intents" USING btree ("tenant_id","status");
CREATE INDEX IF NOT EXISTS "recovery_outbox_session_idx" ON "recovery_outbox_intents" USING btree ("session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "recovery_outbox_idempotency_uniq" ON "recovery_outbox_intents" USING btree ("idempotency_key");
