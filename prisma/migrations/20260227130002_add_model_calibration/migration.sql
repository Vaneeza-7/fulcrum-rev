-- CreateTable
CREATE TABLE "model_calibrations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "statistical_significance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sample_size" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "precision" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "recall" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_calibrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_calibrations_tenant_id_idx" ON "model_calibrations"("tenant_id");

-- CreateIndex
CREATE INDEX "model_calibrations_tenant_id_created_at_idx" ON "model_calibrations"("tenant_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "model_calibrations" ADD CONSTRAINT "model_calibrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
