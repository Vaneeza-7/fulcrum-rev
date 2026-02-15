import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runHealthChecks } from '@/lib/health/crm-health';
import { sendSystemAlert } from '@/lib/huck/proactive';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/cron/health');

/**
 * POST /api/cron/health
 * Run health checks for all tenants and alert via Huck on critical/degraded.
 * Protected by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    const results = [];

    for (const tenant of tenants) {
      try {
        const checks = await runHealthChecks(tenant.id);

        // Send Huck alerts for non-healthy checks
        for (const check of checks) {
          if (check.status === 'critical' || check.status === 'degraded') {
            const details = Object.entries(check.details ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ');
            await sendSystemAlert(tenant.id, check.checkType, check.status, details);
          }
        }

        results.push({
          tenant: tenant.name,
          checks: checks.map((c) => ({ type: c.checkType, status: c.status })),
        });
      } catch (error) {
        log.error({ err: error, tenantId: tenant.id }, `Health checks failed for ${tenant.name}`);
        results.push({ tenant: tenant.name, error: String(error) });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    log.error({ err: error }, 'Health check trigger failed');
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
