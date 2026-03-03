import 'dotenv/config'
import { prisma } from '@/lib/db'
import { seedProviderPricingCatalog } from '@/lib/billing/provider-pricing'

async function main() {
  const result = await seedProviderPricingCatalog(prisma)
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
