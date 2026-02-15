import { NextRequest, NextResponse } from 'next/server';
import { auditLog } from '@/lib/db';

/**
 * POST /api/webhooks/apify
 * Handle Apify actor run completion webhooks.
 * Currently logs the event. The pipeline already polls for results,
 * but this can be used for async notification.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  console.log('Apify webhook received:', {
    eventType: body.eventType,
    actorRunId: body.resource?.id,
    status: body.resource?.status,
  });

  await auditLog(null, 'apify_webhook', undefined, {
    eventType: body.eventType,
    actorRunId: body.resource?.id,
    status: body.resource?.status,
  });

  return NextResponse.json({ received: true });
}
