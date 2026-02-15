import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type CheckStatus = 'ok' | 'degraded' | 'unhealthy';

interface HealthCheck {
  status: CheckStatus;
  detail?: string;
  latencyMs?: number;
}

export async function GET() {
  const checks: Record<string, HealthCheck> = {};
  let overallStatus: CheckStatus = 'ok';

  // Database connectivity + latency
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;
    checks.database = {
      status: dbLatency > 2000 ? 'degraded' : 'ok',
      latencyMs: dbLatency,
    };
    if (dbLatency > 2000) overallStatus = 'degraded';
  } catch (error) {
    checks.database = { status: 'unhealthy', detail: String(error) };
    overallStatus = 'unhealthy';
  }

  // Pipeline freshness (last run should be within 26 hours)
  try {
    const lastPipeline = await prisma.auditLog.findFirst({
      where: { actionType: 'pipeline_completed' },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastPipeline) {
      checks.pipeline = { status: 'ok', detail: 'No pipeline runs yet' };
    } else {
      const hoursSince = (Date.now() - lastPipeline.createdAt.getTime()) / 3_600_000;
      if (hoursSince > 48) {
        checks.pipeline = { status: 'unhealthy', detail: `Last run ${Math.round(hoursSince)}h ago` };
        overallStatus = 'unhealthy';
      } else if (hoursSince > 26) {
        checks.pipeline = { status: 'degraded', detail: `Last run ${Math.round(hoursSince)}h ago` };
        if (overallStatus === 'ok') overallStatus = 'degraded';
      } else {
        checks.pipeline = { status: 'ok', detail: `Last run ${Math.round(hoursSince)}h ago` };
      }
    }
  } catch {
    checks.pipeline = { status: 'ok', detail: 'Unable to check' };
  }

  // Tenant summary
  try {
    const [tenantCount, leadCount, pendingReview] = await Promise.all([
      prisma.tenant.count({ where: { isActive: true } }),
      prisma.lead.count(),
      prisma.lead.count({ where: { status: 'pending_review' } }),
    ]);
    checks.tenants = { status: 'ok', detail: `${tenantCount} active, ${leadCount} leads, ${pendingReview} pending` };
  } catch {
    checks.tenants = { status: 'degraded', detail: 'Unable to query' };
    if (overallStatus === 'ok') overallStatus = 'degraded';
  }

  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: statusCode }
  );
}
