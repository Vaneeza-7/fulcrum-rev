import { NextResponse } from 'next/server'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { getTenantBillingHistory } from '@/lib/billing/history'

export async function GET(request: Request) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const url = new URL(request.url)
  const history = await getTenantBillingHistory(authResult.tenant.id, {
    page: Number(url.searchParams.get('page') ?? '1'),
    pageSize: Number(url.searchParams.get('pageSize') ?? '25'),
    provider: url.searchParams.get('provider'),
    stage: url.searchParams.get('stage'),
    billableOnly:
      url.searchParams.get('billableOnly') === null
        ? true
        : url.searchParams.get('billableOnly') !== 'false',
  })

  return NextResponse.json(history)
}
