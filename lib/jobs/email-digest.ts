import { prisma } from '@/lib/db'
import { sendLeadDigestEmail } from '@/lib/email/lead-digest'
import { jobLogger } from '@/lib/logger'

const log = jobLogger('email-digest')

export async function runEmailDigest(): Promise<{
  tenantsProcessed: number
  emailsSent: number
  errors: string[]
}> {
  const errors: string[] = []
  let emailsSent = 0

  // Load all active tenants that have email delivery enabled
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      deliveryPreference: {
        emailEnabled: true,
      },
    },
    include: {
      deliveryPreference: true,
    },
  })

  log.info({ count: tenants.length }, 'Found tenants with email delivery enabled')

  const qualifyingTenants = tenants.filter((tenant) => {
    const pref = tenant.deliveryPreference
    if (!pref) return false

    try {
      return isDeliveryTime(pref.deliveryTime, pref.timezone, pref.scheduleType)
    } catch (err) {
      const msg = `Timezone check failed for tenant ${tenant.id}: ${err instanceof Error ? err.message : 'Unknown error'}`
      log.error({ tenantId: tenant.id, error: err }, msg)
      errors.push(msg)
      return false
    }
  })

  log.info(
    { qualifying: qualifyingTenants.length, total: tenants.length },
    'Tenants qualifying for delivery at current time'
  )

  for (const tenant of qualifyingTenants) {
    try {
      const sent = await sendLeadDigestEmail(tenant.id)
      if (sent) {
        emailsSent++
      }
    } catch (err) {
      const msg = `Failed to send digest for tenant ${tenant.id}: ${err instanceof Error ? err.message : 'Unknown error'}`
      log.error({ tenantId: tenant.id, error: err }, msg)
      errors.push(msg)
    }
  }

  log.info(
    { tenantsProcessed: qualifyingTenants.length, emailsSent, errorCount: errors.length },
    'Email digest job complete'
  )

  return {
    tenantsProcessed: qualifyingTenants.length,
    emailsSent,
    errors,
  }
}

// ---------------------------------------------------------------------------
// Time matching helpers (using Intl.DateTimeFormat -- no external libraries)
// ---------------------------------------------------------------------------

function isDeliveryTime(
  deliveryTime: string,
  timezone: string,
  scheduleType: string
): boolean {
  const now = new Date()

  // Get the current hour and day-of-week in the tenant's timezone
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(now)

  const dayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(now)

  const currentHour = parseInt(hourStr, 10)
  const targetHour = parseInt(deliveryTime.split(':')[0], 10)

  // Hour must match
  if (currentHour !== targetHour) return false

  // Check schedule type
  if (scheduleType === 'weekdays') {
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    if (!weekdays.includes(dayStr)) return false
  }
  // 'daily' delivers every day -- no additional check needed

  return true
}
