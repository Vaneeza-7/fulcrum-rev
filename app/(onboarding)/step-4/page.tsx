import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getTenantCrmSettings } from '@/lib/settings/crm'
import { Step4DeliveryClient } from './Step4DeliveryClient'

export const metadata = {
  title: 'Fulcrum — Lead Delivery',
  description: 'Step 4: Configure how and when you receive leads',
}

export default async function Step4Page() {
  let orgId: string | null | undefined = null
  try {
    const session = await auth()
    orgId = session.orgId
  } catch {}
  if (!orgId) redirect('/')

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    include: {
      deliveryPreference: true,
      slackConfig: true,
    },
  })

  if (!tenant) redirect('/step-1')

  const delivery = tenant.deliveryPreference
  const crm = await getTenantCrmSettings(prisma, tenant.id)

  return (
    <Step4DeliveryClient
      initialDelivery={
        delivery
          ? {
              leadVolumeTarget: delivery.leadVolumeTarget,
              scheduleType: delivery.scheduleType,
              deliveryTime: delivery.deliveryTime,
              timezone: delivery.timezone,
              crmEnabled: delivery.crmEnabled,
              slackEnabled: delivery.slackEnabled,
              emailEnabled: delivery.emailEnabled,
              emailAddress: delivery.emailAddress ?? '',
            }
          : undefined
      }
      currentCrmType={tenant.crmType}
      currentCrmConfig={crm.hasTenantConfig ? {} : undefined}
      hasSlack={!!tenant.slackConfig}
    />
  )
}
