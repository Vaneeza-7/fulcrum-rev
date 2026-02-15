import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendWeeklyDigest } from '@/lib/huck/proactive';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/cron/weekly-digest');

/**
 * POST /api/cron/weekly-digest
 * Trigger Huck's weekly performance digest for all active tenants.
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
        await sendWeeklyDigest(tenant.id);
        results.push({ tenant: tenant.name, success: true });
      } catch (error) {
        log.error({ err: error, tenantId: tenant.id }, `Weekly digest failed for ${tenant.name}`);
        results.push({ tenant: tenant.name, success: false, error: String(error) });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    log.error({ err: error }, 'Weekly digest trigger failed');
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
