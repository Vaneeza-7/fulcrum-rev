import { prisma } from '@/lib/db'
import { resend } from './client'
import { dailyDigestHtml } from './templates'
import { jobLogger } from '@/lib/logger'

const log = jobLogger('lead-digest')

// ---------------------------------------------------------------------------
// CSV Generation
// ---------------------------------------------------------------------------

export function generateLeadCSV(leads: Array<{
  fullName: string
  title: string | null
  company: string | null
  location: string | null
  linkedinUrl: string
  fulcrumScore: number
  fulcrumGrade: string | null
  fitScore: number
  intentScore: number
  firstLine: string | null
  discoveredAt: Date
}>): string {
  const headers = [
    'Name',
    'Title',
    'Company',
    'Location',
    'LinkedIn URL',
    'Score',
    'Grade',
    'Fit Score',
    'Intent Score',
    'Opening Line',
    'Discovered',
  ]

  const rows = leads.map((lead) => [
    csvEscape(lead.fullName),
    csvEscape(lead.title ?? ''),
    csvEscape(lead.company ?? ''),
    csvEscape(lead.location ?? ''),
    csvEscape(lead.linkedinUrl),
    String(lead.fulcrumScore),
    csvEscape(lead.fulcrumGrade ?? ''),
    String(lead.fitScore),
    String(lead.intentScore),
    csvEscape(lead.firstLine ?? ''),
    lead.discoveredAt.toISOString().split('T')[0],
  ])

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// ---------------------------------------------------------------------------
// Send Digest Email
// ---------------------------------------------------------------------------

export async function sendLeadDigestEmail(tenantId: string): Promise<boolean> {
  try {
    // Load tenant with profile and delivery preferences
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        profile: true,
        deliveryPreference: true,
      },
    })

    if (!tenant) {
      log.warn({ tenantId }, 'Tenant not found')
      return false
    }

    if (!tenant.deliveryPreference?.emailEnabled) {
      log.info({ tenantId }, 'Email delivery not enabled for tenant')
      return false
    }

    const emailAddress = tenant.deliveryPreference.emailAddress
    if (!emailAddress) {
      log.warn({ tenantId }, 'No email address configured for tenant')
      return false
    }

    // Load today's leads (not rejected, ordered by score desc, up to 30)
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const leads = await prisma.lead.findMany({
      where: {
        tenantId,
        status: { not: 'rejected' },
        discoveredAt: { gte: todayStart },
      },
      orderBy: { fulcrumScore: 'desc' },
      take: 30,
    })

    if (leads.length === 0) {
      log.info({ tenantId }, 'No leads found for today, skipping email')
      return false
    }

    const companyName = tenant.profile?.companyName ?? tenant.name
    const date = todayStart.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    // Map leads to the shapes needed by CSV and HTML
    const csvLeads = leads.map((lead) => ({
      fullName: lead.fullName,
      title: lead.title,
      company: lead.company,
      location: lead.location,
      linkedinUrl: lead.linkedinUrl,
      fulcrumScore: Number(lead.fulcrumScore),
      fulcrumGrade: lead.fulcrumGrade,
      fitScore: Number(lead.fitScore),
      intentScore: Number(lead.intentScore),
      firstLine: lead.firstLine,
      discoveredAt: lead.discoveredAt,
    }))

    const csv = generateLeadCSV(csvLeads)

    const topLeads = csvLeads.slice(0, 5).map((lead) => ({
      fullName: lead.fullName,
      title: lead.title,
      company: lead.company,
      fulcrumScore: lead.fulcrumScore,
      fulcrumGrade: lead.fulcrumGrade,
    }))

    const html = dailyDigestHtml({
      companyName,
      date,
      leadCount: leads.length,
      topLeads,
    })

    const fromAddress = process.env.RESEND_FROM_EMAIL ?? 'leads@fulcrumcollective.io'
    const subject = `Fulcrum \u2014 ${leads.length} Qualified Leads for ${date}`

    if (!resend) {
      log.error({ tenantId }, 'Resend client not configured (missing RESEND_API_KEY)')
      return false
    }

    await resend.emails.send({
      from: fromAddress,
      to: emailAddress,
      subject,
      html,
      attachments: [
        {
          filename: `fulcrum-leads-${todayStart.toISOString().split('T')[0]}.csv`,
          content: Buffer.from(csv, 'utf-8').toString('base64'),
        },
      ],
    })

    log.info({ tenantId, leadCount: leads.length, to: emailAddress }, 'Lead digest email sent')
    return true
  } catch (error) {
    log.error({ error, tenantId }, 'Failed to send lead digest email')
    return false
  }
}
