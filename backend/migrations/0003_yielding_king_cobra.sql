CREATE TYPE "public"."outbox_status" AS ENUM('queued', 'claimed', 'completed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."recovery_stop_reason" ADD VALUE IF NOT EXISTS 'stale_lock_timeout';--> statement-breakpoint
CREATE TABLE "recovery_outbox_intents" (
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
--> statement-breakpoint
ALTER TABLE "recovery_audit_log" ADD COLUMN "previous_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "recovery_audit_log" ADD COLUMN "hash" varchar(64);--> statement-breakpoint
ALTER TABLE "recovery_audit_log" ADD COLUMN "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "recovery_sessions" ADD COLUMN "incident_lane" varchar(50) DEFAULT 'payment_degradation' NOT NULL;--> statement-breakpoint
ALTER TABLE "recovery_sessions" ADD COLUMN "is_holdout" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recovery_sessions" ADD COLUMN "recovery_contract" jsonb;--> statement-breakpoint
ALTER TABLE "recovery_sessions" ADD COLUMN "voice_script_hinglish" text;--> statement-breakpoint
ALTER TABLE "recovery_sessions" ADD COLUMN "opted_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recovery_sessions" ADD COLUMN "locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "recovery_outbox_intents" ADD CONSTRAINT "recovery_outbox_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_outbox_intents" ADD CONSTRAINT "recovery_outbox_intents_session_id_recovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."recovery_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_outbox_intents" ADD CONSTRAINT "recovery_outbox_intents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_outbox_tenant_status_idx" ON "recovery_outbox_intents" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "recovery_outbox_session_idx" ON "recovery_outbox_intents" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_outbox_idempotency_uniq" ON "recovery_outbox_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_retry_attempts_session_attempt_uniq" ON "payment_retry_attempts" USING btree ("session_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_audit_idempotency_uniq" ON "recovery_audit_log" USING btree ("idempotency_key") WHERE "recovery_audit_log"."idempotency_key" IS NOT NULL;