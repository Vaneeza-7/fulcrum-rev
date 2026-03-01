import { NextRequest, NextResponse } from 'next/server';

/**
 * Verify cron endpoint authorization using a standardized Bearer token pattern.
 * Supports both `Authorization: Bearer <token>` and legacy `x-cron-secret` header.
 *
 * Returns null if authorized, or a 401 NextResponse if not.
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET must be set
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Server misconfiguration: CRON_SECRET not set' }, { status: 500 });
    }
    return null;
  }

  // Check standard Bearer token first
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return null;

  // Fallback: check legacy x-cron-secret header
  const legacySecret = request.headers.get('x-cron-secret');
  if (legacySecret === cronSecret) return null;

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
