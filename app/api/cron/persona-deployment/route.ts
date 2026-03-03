import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { routeLogger } from '@/lib/logger'
import { runPersonaDeployment, runPersonaDeploymentAll } from '@/lib/jobs/persona-deployment'

const log = routeLogger('/api/cron/persona-deployment')

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(request)
  if (error) return error

  try {
    if (tenantId) {
      const deployed = await runPersonaDeployment(tenantId)
      return NextResponse.json({
        success: true,
        tenantsProcessed: 1,
        totalDeployed: deployed,
        errors: [],
      })
    }

    const result = await runPersonaDeploymentAll()
    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    log.error({ error: err, tenantId }, 'Persona deployment cron failed')
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
