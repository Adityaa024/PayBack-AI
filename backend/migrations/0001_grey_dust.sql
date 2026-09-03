CREATE TYPE "public"."promise_to_pay_status" AS ENUM('pending', 'kept', 'broken', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."recovery_session_status" AS ENUM('active', 'recovered', 'stopped', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."recovery_stop_reason" AS ENUM('max_retries_reached', 'legal_stop', 'manual_override', 'dlq_threshold', 'ptp_broken_twice', 'invoice_paid', 'over_90_days');--> statement-breakpoint
CREATE TYPE "public"."recovery_strategy" AS ENUM('payment_link_refresh', 'mandate_retry', 'soft_reminder', 'firm_escalation', 'promise_follow_up', 'legal_stop');--> statement-breakpoint
CREATE TABLE "checkout_abandonment_signals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"invoice_id" varchar(36) NOT NULL,
	"portal_viewed_at" timestamp NOT NULL,
	"recovery_triggered" boolean DEFAULT false NOT NULL,
	"recovery_triggered_at" timestamp,
	"session_id" varchar(36),
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_retry_attempts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"invoice_id" varchar(36) NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"razorpay_payment_link_id" varchar(255),
	"razorpay_payment_link_url" text,
	"communication_id" varchar(36),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"triggered_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"responded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "promise_to_pay" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"invoice_id" varchar(36) NOT NULL,
	"session_id" varchar(36),
	"detected_from_communication_id" varchar(36),
	"promised_amount" numeric(14, 2),
	"promised_date" date,
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"status" "promise_to_pay_status" DEFAULT 'pending' NOT NULL,
	"broken_count" integer DEFAULT 0 NOT NULL,
	"ai_extracted_text" text,
	"ai_confidence" numeric(5, 4),
	"checked_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_audit_log" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"invoice_id" varchar(36) NOT NULL,
	"action" varchar(100) NOT NULL,
	"actor" varchar(50) DEFAULT 'recovery_agent' NOT NULL,
	"ai_decision" jsonb,
	"razorpay_ref" varchar(255),
	"amount_at_risk" numeric(14, 2),
	"result" varchar(50) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"invoice_id" varchar(36) NOT NULL,
	"status" "recovery_session_status" DEFAULT 'active' NOT NULL,
	"strategy" "recovery_strategy" DEFAULT 'payment_link_refresh' NOT NULL,
	"amount_at_risk" numeric(14, 2) NOT NULL,
	"amount_recovered" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"ai_confidence" numeric(5, 4),
	"ai_reasoning" text,
	"stop_reason" "recovery_stop_reason",
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_action_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkout_abandonment_signals" ADD CONSTRAINT "checkout_abandonment_signals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_abandonment_signals" ADD CONSTRAINT "checkout_abandonment_signals_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_abandonment_signals" ADD CONSTRAINT "checkout_abandonment_signals_session_id_recovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."recovery_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_retry_attempts" ADD CONSTRAINT "payment_retry_attempts_session_id_recovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."recovery_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_retry_attempts" ADD CONSTRAINT "payment_retry_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_retry_attempts" ADD CONSTRAINT "payment_retry_attempts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_retry_attempts" ADD CONSTRAINT "payment_retry_attempts_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_to_pay" ADD CONSTRAINT "promise_to_pay_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_to_pay" ADD CONSTRAINT "promise_to_pay_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_to_pay" ADD CONSTRAINT "promise_to_pay_session_id_recovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."recovery_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_to_pay" ADD CONSTRAINT "promise_to_pay_detected_from_communication_id_communications_id_fk" FOREIGN KEY ("detected_from_communication_id") REFERENCES "public"."communications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_audit_log" ADD CONSTRAINT "recovery_audit_log_session_id_recovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."recovery_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_audit_log" ADD CONSTRAINT "recovery_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_audit_log" ADD CONSTRAINT "recovery_audit_log_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_sessions" ADD CONSTRAINT "recovery_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_sessions" ADD CONSTRAINT "recovery_sessions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abandonment_tenant_idx" ON "checkout_abandonment_signals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "abandonment_invoice_idx" ON "checkout_abandonment_signals" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "abandonment_triggered_idx" ON "checkout_abandonment_signals" USING btree ("tenant_id","recovery_triggered");--> statement-breakpoint
CREATE INDEX "payment_retry_attempts_session_id_idx" ON "payment_retry_attempts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "payment_retry_attempts_tenant_idx" ON "payment_retry_attempts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ptp_tenant_status_idx" ON "promise_to_pay" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "ptp_invoice_id_idx" ON "promise_to_pay" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "ptp_promised_date_idx" ON "promise_to_pay" USING btree ("promised_date");--> statement-breakpoint
CREATE INDEX "recovery_audit_session_idx" ON "recovery_audit_log" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "recovery_audit_tenant_created_idx" ON "recovery_audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "recovery_audit_invoice_idx" ON "recovery_audit_log" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "recovery_sessions_tenant_status_idx" ON "recovery_sessions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "recovery_sessions_invoice_id_idx" ON "recovery_sessions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "recovery_sessions_tenant_created_idx" ON "recovery_sessions" USING btree ("tenant_id","created_at");