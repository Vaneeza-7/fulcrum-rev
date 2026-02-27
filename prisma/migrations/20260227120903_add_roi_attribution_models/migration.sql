-- CreateEnum
CREATE TYPE "FulcrumSourceType" AS ENUM ('RESEARCHER_DISCOVERY', 'ICP_MATCH', 'SIGNAL_TRIGGERED', 'RESURRECTION');

-- CreateTable
CREATE TABLE "fulcrum_source_tags" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "fulcrum_source_id" TEXT NOT NULL,
    "source_type" "FulcrumSourceType" NOT NULL,
    "tagged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulcrum_source_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roi_attributions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "fulcrum_source_tag_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "estimated_deal_value" DOUBLE PRECISION,
    "attributed_revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_credit_spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roi_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stage" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roi_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fulcrum_source_tags_lead_id_key" ON "fulcrum_source_tags"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulcrum_source_tags_fulcrum_source_id_key" ON "fulcrum_source_tags"("fulcrum_source_id");

-- CreateIndex
CREATE INDEX "fulcrum_source_tags_tenant_id_idx" ON "fulcrum_source_tags"("tenant_id");

-- CreateIndex
CREATE INDEX "fulcrum_source_tags_fulcrum_source_id_idx" ON "fulcrum_source_tags"("fulcrum_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "roi_attributions_fulcrum_source_tag_id_key" ON "roi_attributions"("fulcrum_source_tag_id");

-- CreateIndex
CREATE INDEX "roi_attributions_tenant_id_idx" ON "roi_attributions"("tenant_id");

-- CreateIndex
CREATE INDEX "roi_attributions_lead_id_idx" ON "roi_attributions"("lead_id");

-- AddForeignKey
ALTER TABLE "fulcrum_source_tags" ADD CONSTRAINT "fulcrum_source_tags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roi_attributions" ADD CONSTRAINT "roi_attributions_fulcrum_source_tag_id_fkey" FOREIGN KEY ("fulcrum_source_tag_id") REFERENCES "fulcrum_source_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
