import 'dotenv/config'
import { prisma } from '@/lib/db'
import { getCoreLaunchTenants } from '@/lib/tenants/core-launch'
import { backfillCrmPushStateForTenants } from '@/lib/leads/crm-push-backfill'

function getArg(flag: string) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

function hasFlag(flag: string) {
  return process.argv.includes(flag)
}

async function resolveTargetTenantIds() {
  const tenantId = getArg('--tenantId')
  const clerkOrgId = getArg('--clerkOrgId')
  const allCoreLaunch = hasFlag('--allCoreLaunch')

  const explicitTargetCount = Number(Boolean(tenantId)) + Number(Boolean(clerkOrgId)) + Number(allCoreLaunch)
  if (explicitTargetCount !== 1) {
    throw new Error('Provide exactly one of --tenantId, --clerkOrgId, or --allCoreLaunch')
  }

  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    })
    if (!tenant) throw new Error('Tenant not found')
    return [tenant.id]
  }

  if (clerkOrgId) {
    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId },
      select: { id: true },
    })
    if (!tenant) throw new Error('Tenant not found')
    return [tenant.id]
  }

  const tenants = await getCoreLaunchTenants()
  if (tenants.length === 0) {
    throw new Error('No core launch tenants resolved')
  }
  return tenants.map((tenant) => tenant.id)
}

async function main() {
  const tenantIds = await resolveTargetTenantIds()
  const dryRun = hasFlag('--dryRun')
  const results = await backfillCrmPushStateForTenants({ tenantIds, dryRun })

  const totals = results.reduce(
    (acc, result) => {
      acc.projectedQueued += result.projectedQueued
      acc.projectedFailedPreflight += result.projectedFailedPreflight
      acc.projectedSucceeded += result.projectedSucceeded
      acc.updatedQueued += result.updatedQueued
      acc.updatedFailedPreflight += result.updatedFailedPreflight
      acc.updatedSucceeded += result.updatedSucceeded
      return acc
    },
    {
      projectedQueued: 0,
      projectedFailedPreflight: 0,
      projectedSucceeded: 0,
      updatedQueued: 0,
      updatedFailedPreflight: 0,
      updatedSucceeded: 0,
    },
  )

  console.log(
    JSON.stringify(
      {
        dryRun,
        tenantsProcessed: results.length,
        totals,
        results,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
