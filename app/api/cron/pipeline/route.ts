import { NextRequest, NextResponse } from 'next/server';
import { runDailyPipeline } from '@/lib/jobs/daily-pipeline';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/cron/pipeline');

/**
 * POST /api/cron/pipeline
 * Trigger the daily lead generation pipeline.
 * Protected by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const result = await runDailyPipeline();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    log.error({ err: error }, 'Pipeline trigger failed');
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
