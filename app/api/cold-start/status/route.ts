import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { routeLogger } from '@/lib/logger';
import { ColdStartGate } from '@/lib/cold-start';

const log = routeLogger('/api/cold-start/status');
const SIGNIFICANCE_THRESHOLD = 0.85;

export async function GET() {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
    });
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const status = await ColdStartGate.getStatus(tenant.id);

    const progressPercent = Math.min(100, Math.round(
      (status.calibrationSignificance / SIGNIFICANCE_THRESHOLD) * 100
    ));

    return NextResponse.json({
      coldStartActive: status.isActive,
      requiresManualApproval: status.requiresManualApproval,
      confidenceFloorBoost: status.confidenceFloorBoost,
      calibrationSignificance: status.calibrationSignificance,
      significanceThreshold: SIGNIFICANCE_THRESHOLD,
      progressPercent,
      expiresAt: status.expiresAt,
      daysRemaining: status.daysRemaining,
      exitConditions: {
        significanceReached: status.calibrationSignificance >= SIGNIFICANCE_THRESHOLD,
        expired: status.expiresAt ? new Date() >= status.expiresAt : false,
      },
    });
  } catch (error) {
    log.error({ error }, 'Cold-start status error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
