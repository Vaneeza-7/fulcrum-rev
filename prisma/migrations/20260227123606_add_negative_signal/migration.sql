-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "NegativeReason" AS ENUM ('WRONG_ICP', 'BAD_TIMING', 'ALREADY_CUSTOMER', 'COMPETITOR', 'NOT_INTERESTED', 'BRAND_MISMATCH', 'OTHER');

-- CreateTable
CREATE TABLE "negative_signals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" UUID,
    "brand_suggestion_id" UUID,
    "reject_reason" "NegativeReason" NOT NULL,
    "reject_reason_raw" TEXT,
    "reason_vector" vector(1536),
    "applied_to_model" BOOLEAN NOT NULL DEFAULT false,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negative_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "negative_signals_tenant_id_idx" ON "negative_signals"("tenant_id");

-- CreateIndex
CREATE INDEX "negative_signals_tenant_id_applied_to_model_idx" ON "negative_signals"("tenant_id", "applied_to_model");
