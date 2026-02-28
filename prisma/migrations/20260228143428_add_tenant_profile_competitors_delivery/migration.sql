-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "crm_type" DROP NOT NULL;

-- CreateTable
CREATE TABLE "tenant_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "website_url" TEXT,
    "industry" TEXT,
    "company_size" TEXT,
    "product_description" TEXT,
    "problems_solved" TEXT,
    "value_proposition" TEXT,
    "target_industries" JSONB NOT NULL DEFAULT '[]',
    "target_company_sizes" JSONB NOT NULL DEFAULT '[]',
    "target_roles" JSONB NOT NULL DEFAULT '[]',
    "target_geography" JSONB NOT NULL DEFAULT '[]',
    "pain_points" TEXT,
    "buying_signals" TEXT,
    "search_keywords" TEXT,
    "competitor_differentiation" TEXT,
    "why_choose_us" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_competitors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "website_url" TEXT,
    "differentiator" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_delivery_preferences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_volume_target" INTEGER NOT NULL DEFAULT 25,
    "schedule_type" TEXT NOT NULL DEFAULT 'weekdays',
    "delivery_time" TEXT NOT NULL DEFAULT '06:00',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "crm_enabled" BOOLEAN NOT NULL DEFAULT false,
    "slack_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_delivery_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_profiles_tenant_id_key" ON "tenant_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_competitors_tenant_id_idx" ON "tenant_competitors"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_delivery_preferences_tenant_id_key" ON "tenant_delivery_preferences"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_profiles" ADD CONSTRAINT "tenant_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_competitors" ADD CONSTRAINT "tenant_competitors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_delivery_preferences" ADD CONSTRAINT "tenant_delivery_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulcrum_source_tags" ADD CONSTRAINT "fulcrum_source_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roi_attributions" ADD CONSTRAINT "roi_attributions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negative_signals" ADD CONSTRAINT "negative_signals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
