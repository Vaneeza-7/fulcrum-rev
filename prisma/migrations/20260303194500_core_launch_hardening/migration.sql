ALTER TABLE "tenants"
  ADD COLUMN "crm_push_paused" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "crm_push_pause_reason" TEXT,
  ADD COLUMN "crm_push_paused_at" TIMESTAMP(3);

ALTER TABLE "leads"
  ADD COLUMN "crm_push_state" TEXT NOT NULL DEFAULT 'not_queued',
  ADD COLUMN "crm_push_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "crm_push_queued_at" TIMESTAMP(3),
  ADD COLUMN "crm_push_processing_at" TIMESTAMP(3),
  ADD COLUMN "crm_push_last_error" TEXT,
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by" TEXT;

CREATE TABLE "crm_push_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "connector" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "crm_object_id" TEXT,
  "attempt_number" INTEGER NOT NULL DEFAULT 1,
  "error_code" TEXT,
  "error_message" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "crm_push_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_tenant_id_crm_push_state_idx" ON "leads"("tenant_id", "crm_push_state");
CREATE INDEX "leads_tenant_id_status_crm_push_state_idx" ON "leads"("tenant_id", "status", "crm_push_state");
CREATE INDEX "crm_push_events_tenant_id_idx" ON "crm_push_events"("tenant_id");
CREATE INDEX "crm_push_events_tenant_id_created_at_idx" ON "crm_push_events"("tenant_id", "created_at" DESC);
CREATE INDEX "crm_push_events_tenant_id_outcome_idx" ON "crm_push_events"("tenant_id", "outcome");
CREATE INDEX "crm_push_events_tenant_id_lead_id_idx" ON "crm_push_events"("tenant_id", "lead_id");

ALTER TABLE "crm_push_events"
  ADD CONSTRAINT "crm_push_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm_push_events"
  ADD CONSTRAINT "crm_push_events_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
