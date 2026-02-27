import { prisma, auditLog } from '@/lib/db';
import { NegativeReason } from '@prisma/client';
import { jobLogger } from '@/lib/logger';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const log = jobLogger('hitl-processor');

export interface HITLRejectionInput {
  tenantId: string;
  leadId?: string;
  brandSuggestionId?: string;
  rejectReason: NegativeReason;
  rejectReasonRaw?: string;
  rejectedBy: string;
}

export class HITLProcessor {

  /**
   * Process a Sales Leader rejection — embed the reason and store NegativeSignal
   */
  static async processRejection(input: HITLRejectionInput): Promise<string> {
    const textToEmbed = input.rejectReasonRaw
      ? `${input.rejectReason}: ${input.rejectReasonRaw}`
      : input.rejectReason;

    // Generate embedding
    let vector: number[] | null = null;
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: textToEmbed,
      });
      vector = embeddingResponse.data[0].embedding;
    } catch (err) {
      log.error({ error: err }, 'Embedding failed, storing without vector');
    }

    // Create NegativeSignal record — use raw SQL for vector column
    // Table is "negative_signals" (@@map), columns are snake_case (@map)
    let signalId: string;

    if (vector) {
      const vectorStr = `[${vector.join(',')}]`;
      const result = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO "negative_signals" (id, "tenant_id", "lead_id", "brand_suggestion_id", "reject_reason", "reject_reason_raw", "reason_vector", "applied_to_model", "created_at")
         VALUES (gen_random_uuid(), $1, $2, $3, $4::"NegativeReason", $5, $6::vector, false, NOW())
         RETURNING id`,
        input.tenantId,
        input.leadId ?? null,
        input.brandSuggestionId ?? null,
        input.rejectReason,
        input.rejectReasonRaw ?? null,
        vectorStr,
      );
      signalId = result[0].id;
    } else {
      const signal = await prisma.negativeSignal.create({
        data: {
          tenantId: input.tenantId,
          leadId: input.leadId,
          brandSuggestionId: input.brandSuggestionId,
          rejectReason: input.rejectReason,
          rejectReasonRaw: input.rejectReasonRaw,
          appliedToModel: false,
        },
      });
      signalId = signal.id;
    }

    await auditLog(input.tenantId, 'negative_signal_created', signalId, {
      rejectReason: input.rejectReason,
      rejectedBy: input.rejectedBy,
    });

    return signalId;
  }

  /**
   * Get all unapplied NegativeSignals for a tenant (for recalibration)
   */
  static async getUnappliedSignals(tenantId: string) {
    return prisma.negativeSignal.findMany({
      where: { tenantId, appliedToModel: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Mark signals as applied after recalibration runs
   */
  static async markSignalsApplied(signalIds: string[]): Promise<void> {
    await prisma.negativeSignal.updateMany({
      where: { id: { in: signalIds } },
      data: { appliedToModel: true, appliedAt: new Date() },
    });
  }
}
