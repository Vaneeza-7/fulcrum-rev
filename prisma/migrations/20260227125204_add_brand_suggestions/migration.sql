-- CreateTable
CREATE TABLE "brand_suggestions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_suggestions_tenant_id_idx" ON "brand_suggestions"("tenant_id");

-- CreateIndex
CREATE INDEX "brand_suggestions_tenant_id_status_idx" ON "brand_suggestions"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "brand_suggestions" ADD CONSTRAINT "brand_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
