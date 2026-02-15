import { NextRequest, NextResponse } from 'next/server';
import { runPersonaDeploymentAll } from '@/lib/jobs/persona-deployment';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/cron/persona-deployment');

/**
 * POST /api/cron/persona-deployment
 * Daily persona snippet deployment check.
 * Protected by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const { totalDeployed, errors } = await runPersonaDeploymentAll();
    return NextResponse.json({
      success: true,
      totalDeployed,
      errors,
    });
  } catch (error) {
    log.error({ err: error }, 'Persona deployment trigger failed');
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
