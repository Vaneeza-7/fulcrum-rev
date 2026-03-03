import 'dotenv/config'
import { prisma } from '@/lib/db'

async function main() {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      clerkOrgId: true,
      billingAccount: {
        select: {
          billingSource: true,
          subscriptionStatus: true,
          planSlug: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
        },
      },
    },
  })

  console.log(JSON.stringify(tenants, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
