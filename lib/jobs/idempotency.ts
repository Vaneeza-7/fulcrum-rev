import { prisma } from '@/lib/db';

type JobPeriod = 'daily' | 'weekly' | 'monthly' | 'biweekly';

/**
 * Check if a job has already run for the current period.
 * Uses the AuditLog table to track job completions (no schema changes needed).
 */
export async function hasJobRunForPeriod(
  jobName: string,
  period: JobPeriod,
  tenantId?: string
): Promise<boolean> {
  const since = getPeriodStart(period);

  const existing = await prisma.auditLog.findFirst({
    where: {
      actionType: `job_completed_${jobName}`,
      ...(tenantId ? { tenantId } : {}),
      createdAt: { gte: since },
    },
  });

  return !!existing;
}

/**
 * Mark a job as completed for the current period.
 */
export async function markJobComplete(
  jobName: string,
  tenantId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: tenantId ?? null,
      actionType: `job_completed_${jobName}`,
      details: (details ?? {}) as any,
    },
  });
}

/**
 * Get the start of the current period.
 */
function getPeriodStart(period: JobPeriod): Date {
  const now = new Date();

  switch (period) {
    case 'daily': {
      const start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      return start;
    }
    case 'weekly': {
      const start = new Date(now);
      const day = start.getUTCDay();
      const diff = day === 0 ? 6 : day - 1; // Monday = start of week
      start.setUTCDate(start.getUTCDate() - diff);
      start.setUTCHours(0, 0, 0, 0);
      return start;
    }
    case 'biweekly': {
      const start = new Date(now);
      // 1st-14th = first half, 15th-end = second half
      const dayOfMonth = start.getUTCDate();
      start.setUTCDate(dayOfMonth <= 14 ? 1 : 15);
      start.setUTCHours(0, 0, 0, 0);
      return start;
    }
    case 'monthly': {
      const start = new Date(now);
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      return start;
    }
  }
}
