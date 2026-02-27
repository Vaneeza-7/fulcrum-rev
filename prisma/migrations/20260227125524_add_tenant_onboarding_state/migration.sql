-- CreateEnum
CREATE TYPE "ColdStartExitReason" AS ENUM ('STATISTICAL_SIGNIFICANCE_REACHED', 'MANUAL_OVERRIDE_BY_ADMIN', 'EXPIRY_30_DAYS');

-- CreateTable
CREATE TABLE "tenant_onboarding_states" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cold_start_active" BOOLEAN NOT NULL DEFAULT true,
    "cold_start_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cold_start_expires_at" TIMESTAMP(3) NOT NULL,
    "confidence_floor_boost" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "requires_manual_approval" BOOLEAN NOT NULL DEFAULT true,
    "calibration_significance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "exited_cold_start_at" TIMESTAMP(3),
    "exit_reason" "ColdStartExitReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_onboarding_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_onboarding_states_tenant_id_key" ON "tenant_onboarding_states"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_onboarding_states_tenant_id_idx" ON "tenant_onboarding_states"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_onboarding_states_cold_start_active_idx" ON "tenant_onboarding_states"("cold_start_active");

-- AddForeignKey
ALTER TABLE "tenant_onboarding_states" ADD CONSTRAINT "tenant_onboarding_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
