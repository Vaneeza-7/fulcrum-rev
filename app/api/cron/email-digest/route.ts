import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { routeLogger } from '@/lib/logger'
import { runEmailDigest } from '@/lib/jobs/email-digest'

const log = routeLogger('/api/cron/email-digest')

export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req)
  if (authError) return authError

  log.info('Starting email digest cron job')

  try {
    const result = await runEmailDigest()

    log.info(
      {
        tenantsProcessed: result.tenantsProcessed,
        emailsSent: result.emailsSent,
        errorCount: result.errors.length,
      },
      'Email digest cron job complete'
    )

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    log.error({ error: err }, 'Email digest cron job failed')

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
