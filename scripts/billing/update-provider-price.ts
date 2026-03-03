import 'dotenv/config'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

function getArg(flag: string) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

async function main() {
  const provider = getArg('--provider')
  const operationType = getArg('--operationType')
  const usdMicrosPerUnit = getArg('--usdMicrosPerUnit')
  const model = getArg('--model')
  const notes = getArg('--notes')

  if (!provider || !operationType || !usdMicrosPerUnit) {
    throw new Error('Provide --provider, --operationType, and --usdMicrosPerUnit')
  }

  const effectiveFrom = new Date()

  const result = await prisma.$transaction(async (tx) => {
    await tx.providerPricingConfig.updateMany({
      where: {
        provider,
        operationType,
        model: model === 'null' ? null : model,
        isActive: true,
        effectiveTo: null,
      },
      data: {
        effectiveTo: effectiveFrom,
        isActive: false,
      },
    })

    return tx.providerPricingConfig.create({
      data: {
        provider,
        model: model === 'null' ? null : model,
        operationType,
        usdMicrosPerUnit: new Prisma.Decimal(usdMicrosPerUnit),
        source: 'admin_override',
        effectiveFrom,
        notes,
      },
    })
  })

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
