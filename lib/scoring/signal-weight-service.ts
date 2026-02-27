import { prisma, auditLog } from '@/lib/db';
import { jobLogger } from '@/lib/logger';
import { HITLProcessor } from '@/lib/hitl/hitl-processor';

const log = jobLogger('signal-weight-service');

export class SignalWeightService {

  /**
   * Recalibrate signal weights based on unapplied NegativeSignals.
   * Uses pgvector cosine similarity to find which SignalWeights are most
   * similar to rejection reason vectors, then reduces those weights.
   */
  static async recalibrateFromNegativeSignals(tenantId: string): Promise<{
    signalsProcessed: number;
    weightsAdjusted: number;
  }> {
    const unapplied = await HITLProcessor.getUnappliedSignals(tenantId);

    if (unapplied.length === 0) {
      return { signalsProcessed: 0, weightsAdjusted: 0 };
    }

    let weightsAdjusted = 0;

    for (const signal of unapplied) {
      // Find the most similar SignalWeight using cosine similarity
      // Uses actual snake_case DB column names from migrations
      // reason_vector null check is in SQL since Prisma Unsupported types
      // are excluded from the generated TypeScript client
      const similarWeights = await prisma.$queryRawUnsafe<Array<{
        id: string;
        signal_key: string;
        current_weight: number;
        similarity: number;
      }>>(
        `SELECT sw.id, sw."signal_key", sw."current_weight",
                1 - (sw."signal_vector" <=> ns."reason_vector") AS similarity
         FROM "signal_weights" sw
         CROSS JOIN "negative_signals" ns
         WHERE sw."tenant_id" = $1
           AND ns.id = $2
           AND sw."signal_vector" IS NOT NULL
           AND ns."reason_vector" IS NOT NULL
           AND (1 - (sw."signal_vector" <=> ns."reason_vector")) > 0.7
         ORDER BY similarity DESC
         LIMIT 3`,
        tenantId,
        signal.id
      );

      // Reduce weight for highly similar signals (cosine similarity > 0.7)
      for (const sw of similarWeights) {
        const newWeight = Math.max(0, sw.current_weight * 0.85); // 15% reduction
        await prisma.signalWeight.update({
          where: { id: sw.id },
          data: { currentWeight: newWeight, lastAdjustedAt: new Date() },
        });
        weightsAdjusted++;
      }
    }

    // Mark all unapplied signals as applied
    await HITLProcessor.markSignalsApplied(unapplied.map(s => s.id));

    log.info(
      { tenantId, signalsProcessed: unapplied.length, weightsAdjusted },
      'Signal weights recalibrated from negative signals'
    );

    await auditLog(tenantId, 'signal_weights_recalibrated', tenantId, {
      signalsProcessed: unapplied.length,
      weightsAdjusted,
    });

    return { signalsProcessed: unapplied.length, weightsAdjusted };
  }
}
