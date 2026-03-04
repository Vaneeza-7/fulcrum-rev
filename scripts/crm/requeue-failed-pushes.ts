import 'dotenv/config'
import { prisma } from '@/lib/db'
import { requeueFailedLeadsForTenant } from '@/lib/leads/crm-queue-ops'

function getArg(flag: string) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

async function resolveTenant() {
  const tenantId = getArg('--tenantId')
  const clerkOrgId = getArg('--clerkOrgId')

  if (!tenantId && !clerkOrgId) {
    throw new Error('Provide --tenantId or --clerkOrgId')
  }

  return tenantId
    ? prisma.tenant.findUnique({ where: { id: tenantId } })
    : prisma.tenant.findUnique({ where: { clerkOrgId: clerkOrgId! } })
}

async function main() {
  const tenant = await resolveTenant()
  if (!tenant) throw new Error('Tenant not found')

  const result = await requeueFailedLeadsForTenant({
    tenantId: tenant.id,
    requestedBy: 'crm_requeue_script',
  })

  console.log(
    JSON.stringify(
      {
        tenantId: tenant.id,
        tenantName: tenant.name,
        totalMatched: result.totalMatched,
        queued: result.queued,
        stillFailed: result.stillFailed,
        errors: result.errors,
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
