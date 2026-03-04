import 'dotenv/config'
import { prisma } from '@/lib/db'
import { addOneMonthUtc } from '@/lib/billing/manual-plans'

const APPLY = process.argv.includes('--apply')

async function main() {
  const accounts = await prisma.tenantBillingAccount.findMany({
    where: { billingSource: 'manual' },
    orderBy: { createdAt: 'asc' },
    include: {
      tenant: {
        select: {
          name: true,
          clerkOrgId: true,
        },
      },
    },
  })

  const changes = accounts
    .filter((account) => account.currentPeriodStart)
    .map((account) => {
      const nextPeriodEnd = addOneMonthUtc(account.currentPeriodStart!)
      return {
        account,
        nextPeriodEnd,
        changed:
          !account.currentPeriodEnd || account.currentPeriodEnd.getTime() !== nextPeriodEnd.getTime(),
      }
    })
    .filter((entry) => entry.changed)

  console.log(`manual billing accounts scanned: ${accounts.length}`)
  console.log(`accounts needing repair: ${changes.length}`)

  for (const { account, nextPeriodEnd } of changes) {
    console.log(
      JSON.stringify(
        {
          tenantId: account.tenantId,
          tenantName: account.tenant.name,
          currentPeriodStart: account.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEndBefore: account.currentPeriodEnd?.toISOString() ?? null,
          currentPeriodEndAfter: nextPeriodEnd.toISOString(),
        },
        null,
        2,
      ),
    )
  }

  if (!APPLY || changes.length === 0) {
    console.log(APPLY ? 'No changes to apply.' : 'Dry run only. Re-run with --apply to persist changes.')
    return
  }

  for (const { account, nextPeriodEnd } of changes) {
    await prisma.tenantBillingAccount.update({
      where: { id: account.id },
      data: { currentPeriodEnd: nextPeriodEnd },
    })
  }

  console.log(`updated ${changes.length} manual billing accounts`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
