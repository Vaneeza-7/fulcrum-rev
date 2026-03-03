-- AlterTable
ALTER TABLE "tenants"
ADD COLUMN "perplexity_api_key" TEXT;

-- AlterTable
ALTER TABLE "tenant_billing_accounts"
ADD COLUMN "billing_source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "plan_assigned_at" TIMESTAMP(3),
ADD COLUMN "plan_assigned_by" TEXT;

-- AlterTable
ALTER TABLE "fulcrum_credit_ledger"
ADD COLUMN "provider_cost_usd_micros" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "customer_billable_usd_micros" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pricing_unit_version" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "usage_event_id" UUID;

-- Existing rows belong to the approximate v1 billing model.
UPDATE "fulcrum_credit_ledger"
SET "pricing_unit_version" = 1;

-- CreateTable
CREATE TABLE "provider_pricing_configs" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "operation_type" TEXT NOT NULL,
    "usd_micros_per_unit" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_pricing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_usage_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "feature" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 1,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "provider_cost_usd_micros" INTEGER NOT NULL DEFAULT 0,
    "pricing_source" TEXT NOT NULL,
    "tenant_owned_credential_used" BOOLEAN NOT NULL DEFAULT false,
    "external_request_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fulcrum_credit_ledger_usage_event_id_key" ON "fulcrum_credit_ledger"("usage_event_id");

-- CreateIndex
CREATE INDEX "provider_pricing_configs_provider_operation_type_is_active_idx" ON "provider_pricing_configs"("provider", "operation_type", "is_active");

-- CreateIndex
CREATE INDEX "provider_pricing_configs_provider_model_operation_type_effective_from_idx" ON "provider_pricing_configs"("provider", "model", "operation_type", "effective_from" DESC);

-- CreateIndex
CREATE INDEX "provider_usage_events_tenant_id_idx" ON "provider_usage_events"("tenant_id");

-- CreateIndex
CREATE INDEX "provider_usage_events_tenant_id_created_at_idx" ON "provider_usage_events"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "provider_usage_events_tenant_id_provider_stage_idx" ON "provider_usage_events"("tenant_id", "provider", "stage");

-- CreateIndex
CREATE INDEX "provider_usage_events_tenant_id_lead_id_idx" ON "provider_usage_events"("tenant_id", "lead_id");

-- AddForeignKey
ALTER TABLE "provider_usage_events" ADD CONSTRAINT "provider_usage_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulcrum_credit_ledger" ADD CONSTRAINT "fulcrum_credit_ledger_usage_event_id_fkey" FOREIGN KEY ("usage_event_id") REFERENCES "provider_usage_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
