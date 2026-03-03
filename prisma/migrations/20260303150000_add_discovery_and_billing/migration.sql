-- AlterTable
ALTER TABLE "tenants"
ADD COLUMN "lead_discovery_provider" TEXT NOT NULL DEFAULT 'instantly',
ADD COLUMN "instantly_config" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "apify_api_token" TEXT,
ADD COLUMN "anthropic_api_key" TEXT;

-- CreateTable
CREATE TABLE "tenant_billing_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_overage_subscription_item_id" TEXT,
    "subscription_status" TEXT NOT NULL DEFAULT 'inactive',
    "plan_slug" TEXT,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "billing_email" TEXT,
    "low_credit_threshold_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.8,
    "reported_overage_credits" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_billing_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulcrum_credit_ledger" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entry_type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "provider" TEXT,
    "credit_delta" DECIMAL(12,4) NOT NULL,
    "usd_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "external_reference" TEXT,
    "reported_to_stripe_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulcrum_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" UUID NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_accounts_tenant_id_key" ON "tenant_billing_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_accounts_stripe_customer_id_key" ON "tenant_billing_accounts"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_accounts_stripe_subscription_id_key" ON "tenant_billing_accounts"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "tenant_billing_accounts_subscription_status_idx" ON "tenant_billing_accounts"("subscription_status");

-- CreateIndex
CREATE INDEX "tenant_billing_accounts_plan_slug_idx" ON "tenant_billing_accounts"("plan_slug");

-- CreateIndex
CREATE INDEX "fulcrum_credit_ledger_tenant_id_idx" ON "fulcrum_credit_ledger"("tenant_id");

-- CreateIndex
CREATE INDEX "fulcrum_credit_ledger_tenant_id_created_at_idx" ON "fulcrum_credit_ledger"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "fulcrum_credit_ledger_tenant_id_entry_type_idx" ON "fulcrum_credit_ledger"("tenant_id", "entry_type");

-- CreateIndex
CREATE INDEX "fulcrum_credit_ledger_tenant_id_source_idx" ON "fulcrum_credit_ledger"("tenant_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_stripe_event_id_key" ON "stripe_webhook_events"("stripe_event_id");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_event_type_idx" ON "stripe_webhook_events"("event_type");

-- AddForeignKey
ALTER TABLE "tenant_billing_accounts" ADD CONSTRAINT "tenant_billing_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulcrum_credit_ledger" ADD CONSTRAINT "fulcrum_credit_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
