import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { HITLProcessor } from '@/lib/hitl/hitl-processor';
import { NegativeReason } from '@prisma/client';
import { routeLogger } from '@/lib/logger';
import { z } from 'zod';

const log = routeLogger('/api/hitl/feedback');

const feedbackSchema = z.object({
  leadId: z.string().uuid().optional(),
  brandSuggestionId: z.string().uuid().optional(),
  rejectReason: z.nativeEnum(NegativeReason),
  rejectReasonRaw: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { orgId, userId } = await auth();
    if (!orgId || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = feedbackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { leadId, brandSuggestionId, rejectReason, rejectReasonRaw } = parsed.data;

    if (!leadId && !brandSuggestionId) {
      return NextResponse.json(
        { error: 'Either leadId or brandSuggestionId is required' },
        { status: 400 },
      );
    }

    const signalId = await HITLProcessor.processRejection({
      tenantId: tenant.id,
      leadId,
      brandSuggestionId,
      rejectReason,
      rejectReasonRaw,
      rejectedBy: userId,
    });

    log.info(
      { signalId, tenantId: tenant.id, rejectReason },
      'HITL feedback recorded',
    );

    return NextResponse.json({
      success: true,
      signalId,
      message: 'Rejection recorded. Model will recalibrate within 24 hours.',
    });
  } catch (error) {
    log.error({ error }, 'HITL feedback error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
