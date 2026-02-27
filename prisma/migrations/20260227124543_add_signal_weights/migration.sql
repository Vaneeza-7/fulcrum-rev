-- CreateTable
CREATE TABLE "signal_weights" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "signal_key" TEXT NOT NULL,
    "signal_label" TEXT NOT NULL,
    "current_weight" DECIMAL(5,2) NOT NULL,
    "original_weight" DECIMAL(5,2) NOT NULL,
    "signal_vector" vector(1536),
    "last_adjusted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signal_weights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signal_weights_tenant_id_idx" ON "signal_weights"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "signal_weights_tenant_id_signal_key_key" ON "signal_weights"("tenant_id", "signal_key");

-- AddForeignKey
ALTER TABLE "signal_weights" ADD CONSTRAINT "signal_weights_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
