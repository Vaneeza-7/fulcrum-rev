import 'dotenv/config'
import { prisma } from '@/lib/db'
import { upsertManualPlanAssignment } from '@/lib/billing/manual-plans'
import { isPlanSlug } from '@/lib/billing/plans'

function getArg(flag: string) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

async function main() {
  const tenantId = getArg('--tenantId')
  const clerkOrgId = getArg('--clerkOrgId')
  const planSlug = getArg('--plan')
  const billingEmail = getArg('--billingEmail')
  const assignedBy = getArg('--assignedBy')
  const anchorDate = getArg('--anchorDate')

  if (!tenantId && !clerkOrgId) {
    throw new Error('Provide --tenantId or --clerkOrgId')
  }
  if (!isPlanSlug(planSlug)) {
    throw new Error('Provide --plan starter|growth|scale')
  }

  const tenant = tenantId
    ? await prisma.tenant.findUnique({ where: { id: tenantId } })
    : await prisma.tenant.findUnique({ where: { clerkOrgId: clerkOrgId! } })

  if (!tenant) {
    throw new Error('Tenant not found')
  }

  const account = await upsertManualPlanAssignment({
    tenantId: tenant.id,
    planSlug,
    billingEmail,
    assignedBy,
    anchorDate: anchorDate ? new Date(anchorDate) : undefined,
  })

  console.log(
    JSON.stringify(
      {
        tenantId: tenant.id,
        tenantName: tenant.name,
        planSlug,
        billingSource: account.billingSource,
        subscriptionStatus: account.subscriptionStatus,
        currentPeriodStart: account.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd: account.currentPeriodEnd?.toISOString() ?? null,
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
