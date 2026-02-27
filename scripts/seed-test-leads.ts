import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';

const prisma = new PrismaClient();
const CHANNEL_ID = 'C0AJEHZD2JC';

const ZOHO_CRM_CONFIG_BASE = {
  client_id: process.env.ZOHO_CLIENT_ID ?? '',
  client_secret: process.env.ZOHO_CLIENT_SECRET ?? '',
  refresh_token: process.env.ZOHO_REFRESH_TOKEN ?? '',
  org_id: process.env.ZOHO_ORG_ID ?? '',
};

// Per-brand custom view URLs in Zoho CRM
const ZOHO_CUSTOM_VIEWS: Record<string, string> = {
  pulse: 'https://one.zoho.com/zohoone/exponentstudios/home/cxapp-spaces/sales/crm/org899488274/tab/Leads/custom-view/6992263000006188321/list',
  'fulcrum-collective': 'https://one.zoho.com/zohoone/exponentstudios/home/cxapp-spaces/sales/crm/org899488274/tab/Leads/custom-view/6992263000006188268/list',
};

interface TestLead {
  linkedinUrl: string;
  fullName: string;
  title: string;
  company: string;
  location: string;
  fulcrumScore: number;
  fulcrumGrade: string;
  fitScore: number;
  intentScore: number;
  firstLine: string;
}

const brands: Array<{
  name: string;
  slug: string;
  productType: string;
  leads: TestLead[];
}> = [
  {
    name: 'Pulse',
    slug: 'pulse',
    productType: 'pulse',
    leads: [
      {
        linkedinUrl: 'https://linkedin.com/in/alex-rivera-saas',
        fullName: 'Alex Rivera',
        title: 'CEO',
        company: 'DataLoop Analytics',
        location: 'San Francisco, CA',
        fulcrumScore: 91.5,
        fulcrumGrade: 'A+',
        fitScore: 38,
        intentScore: 53.5,
        firstLine: 'Alex, your recent post about reducing churn through predictive analytics is exactly what Pulse was built for...',
      },
      {
        linkedinUrl: 'https://linkedin.com/in/maria-santos-product',
        fullName: 'Maria Santos',
        title: 'VP Product',
        company: 'CloudMetrics',
        location: 'Austin, TX',
        fulcrumScore: 82.0,
        fulcrumGrade: 'A',
        fitScore: 35,
        intentScore: 47,
        firstLine: "Maria, CloudMetrics' growth to 500+ customers makes the customer health scoring challenge you mentioned very real...",
      },
      {
        linkedinUrl: 'https://linkedin.com/in/jordan-patel-revops',
        fullName: 'Jordan Patel',
        title: 'Head of Revenue',
        company: 'SaaSGrid',
        location: 'New York, NY',
        fulcrumScore: 68.4,
        fulcrumGrade: 'B',
        fitScore: 28,
        intentScore: 40.4,
        firstLine: 'Jordan, saw SaaSGrid just closed Series A -- at this stage, revenue forecasting visibility becomes critical...',
      },
    ],
  },
  {
    name: 'Fulcrum Collective',
    slug: 'fulcrum-collective',
    productType: 'fulcrum_collective',
    leads: [
      {
        linkedinUrl: 'https://linkedin.com/in/rachel-thompson-ops',
        fullName: 'Rachel Thompson',
        title: 'COO',
        company: 'GrowthWorks Consulting',
        location: 'Chicago, IL',
        fulcrumScore: 89.2,
        fulcrumGrade: 'A',
        fitScore: 37,
        intentScore: 52.2,
        firstLine: 'Rachel, your post about operational bottlenecks during rapid scaling resonates -- we see this pattern with every firm hitting the 50-employee mark...',
      },
      {
        linkedinUrl: 'https://linkedin.com/in/david-kim-founder',
        fullName: 'David Kim',
        title: 'Founder & CEO',
        company: 'Meridian Partners',
        location: 'Denver, CO',
        fulcrumScore: 84.7,
        fulcrumGrade: 'A',
        fitScore: 36,
        intentScore: 48.7,
        firstLine: "David, Meridian Partners' 3x growth last year likely strained your HubSpot setup -- we specialize in exactly this inflection point...",
      },
      {
        linkedinUrl: 'https://linkedin.com/in/lisa-chang-revops',
        fullName: 'Lisa Chang',
        title: 'VP Revenue Operations',
        company: 'TechBridge Solutions',
        location: 'Seattle, WA',
        fulcrumScore: 73.1,
        fulcrumGrade: 'B',
        fitScore: 30,
        intentScore: 43.1,
        firstLine: 'Lisa, your role spanning sales and CS ops at TechBridge is the exact profile where Fulcrum Collective drives the most impact...',
      },
    ],
  },
];

async function pushToZoho(lead: { id: string; fullName: string; title: string; company: string; linkedinUrl: string; fulcrumScore: number; fulcrumGrade: string; fitScore: number; intentScore: number; firstLine: string }, brandName: string): Promise<string | null> {
  if (!ZOHO_CRM_CONFIG_BASE.client_id || !ZOHO_CRM_CONFIG_BASE.refresh_token) {
    console.log('  -> Zoho credentials not configured, skipping CRM push');
    return null;
  }

  try {
    // Import dynamically to avoid issues if CRM module has side effects
    const { CRMFactory } = await import('../lib/crm/factory');
    const crm = CRMFactory.create('zoho', ZOHO_CRM_CONFIG_BASE);
    await crm.authenticate();

    const nameParts = lead.fullName.split(' ');
    const crmLeadId = await crm.createLead({
      first_name: nameParts.slice(0, -1).join(' ') || nameParts[0],
      last_name: nameParts[nameParts.length - 1] || 'Unknown',
      company: lead.company,
      title: lead.title,
      linkedin_url: lead.linkedinUrl,
      fulcrum_score: lead.fulcrumScore,
      fulcrum_grade: lead.fulcrumGrade,
      fit_score: lead.fitScore,
      intent_score: lead.intentScore,
      first_line: lead.firstLine,
      source: `Fulcrum - ${brandName}`,
    });

    // Update lead in DB with CRM ID
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'pushed_to_crm', crmLeadId, pushedToCrmAt: new Date() },
    });

    return crmLeadId;
  } catch (err) {
    console.error(`  -> Zoho push failed: ${err}`);
    return null;
  }
}

async function main() {
  for (const brand of brands) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${brand.name}`);
    console.log(`${'='.repeat(60)}`);

    // 1. Upsert tenant (with per-brand custom view URL)
    const tenantCrmConfig = {
      ...ZOHO_CRM_CONFIG_BASE,
      custom_view_url: ZOHO_CUSTOM_VIEWS[brand.slug] ?? '',
    };

    let tenant = await prisma.tenant.findUnique({ where: { slug: brand.slug } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: brand.name,
          slug: brand.slug,
          productType: brand.productType,
          crmType: 'zoho',
          crmConfig: tenantCrmConfig,
        },
      });
      console.log(`Created tenant: ${tenant.id}`);
    } else {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { crmType: 'zoho', crmConfig: tenantCrmConfig },
      });
      console.log(`Updated tenant: ${tenant.id}`);
    }

    // 2. Ensure Slack config
    const existingSlack = await prisma.tenantSlackConfig.findUnique({
      where: { tenantId: tenant.id },
    });
    if (!existingSlack) {
      await prisma.tenantSlackConfig.create({
        data: {
          tenantId: tenant.id,
          teamId: 'T_DEFAULT',
          botToken: process.env.SLACK_BOT_TOKEN!,
          channelId: CHANNEL_ID,
        },
      });
      console.log(`Created Slack config`);
    }

    // 3. Create leads and push to CRM
    const pushedLeads: Array<{ lead: TestLead & { id: string }; crmLeadId: string | null }> = [];

    for (const leadData of brand.leads) {
      const lead = await prisma.lead.upsert({
        where: {
          tenantId_linkedinUrl: {
            tenantId: tenant.id,
            linkedinUrl: leadData.linkedinUrl,
          },
        },
        create: {
          tenantId: tenant.id,
          linkedinUrl: leadData.linkedinUrl,
          fullName: leadData.fullName,
          title: leadData.title,
          company: leadData.company,
          location: leadData.location,
          fulcrumScore: leadData.fulcrumScore,
          fulcrumGrade: leadData.fulcrumGrade,
          fitScore: leadData.fitScore,
          intentScore: leadData.intentScore,
          firstLine: leadData.firstLine,
          firstLineGeneratedAt: new Date(),
          enrichedAt: new Date(),
          scoredAt: new Date(),
          scoreBreakdown: {},
          status: 'pending_review',
        },
        update: {
          fulcrumScore: leadData.fulcrumScore,
          fulcrumGrade: leadData.fulcrumGrade,
          fitScore: leadData.fitScore,
          intentScore: leadData.intentScore,
          firstLine: leadData.firstLine,
          status: 'pending_review',
          crmLeadId: null,
          pushedToCrmAt: null,
        },
      });

      console.log(`Lead: ${lead.fullName} (${leadData.fulcrumGrade}) - Score: ${lead.fulcrumScore}`);

      const crmLeadId = await pushToZoho({ ...leadData, id: lead.id }, brand.name);
      if (crmLeadId) {
        console.log(`  -> Pushed to Zoho: ${crmLeadId}`);
      }

      pushedLeads.push({ lead: { ...leadData, id: lead.id }, crmLeadId });
    }

    // 4. Send branded Slack message with Zoho deep links
    const slackConfig = await prisma.tenantSlackConfig.findUnique({
      where: { tenantId: tenant.id },
    });
    if (!slackConfig) continue;

    const slack = new WebClient(slackConfig.botToken);
    const zohoOrgId = ZOHO_CRM_CONFIG_BASE.org_id;
    const zohoLeadsUrl = ZOHO_CUSTOM_VIEWS[brand.slug] || null;

    const blocks: any[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Fulcrum Pipeline: ${brand.name}` },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: zohoLeadsUrl
            ? `*${pushedLeads.length} new leads* scored and pushed to Zoho CRM\n<${zohoLeadsUrl}|View all ${brand.name} leads in Zoho>`
            : `*${pushedLeads.length} new leads* scored and ready for review`,
        },
      },
      { type: 'divider' },
    ];

    for (const { lead, crmLeadId } of pushedLeads) {
      const grade = lead.fulcrumGrade;
      const gradeEmoji = grade === 'A+' ? ':fire:' : grade === 'A' ? ':star:' : ':eyes:';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${gradeEmoji} *${lead.fullName}* -- ${grade} (${lead.fulcrumScore})\n_${lead.title} at ${lead.company}_\nFit: ${lead.fitScore} | Intent: ${lead.intentScore}`,
        },
      });

      const buttons: any[] = [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'LinkedIn' },
          url: lead.linkedinUrl,
          action_id: `open_linkedin_${lead.id}`,
        },
      ];

      if (crmLeadId && zohoOrgId) {
        buttons.push({
          type: 'button',
          text: { type: 'plain_text', text: 'View in Zoho' },
          url: `https://crm.zoho.com/crm/org${zohoOrgId}/tab/Leads/${crmLeadId}`,
          action_id: `open_zoho_${lead.id}`,
        });
      }

      blocks.push({ type: 'actions', elements: buttons });
      blocks.push({ type: 'divider' });
    }

    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Powered by *Fulcrum* RevOps Engine | *${brand.name}* pipeline`,
      }],
    });

    try {
      const result = await slack.chat.postMessage({
        channel: CHANNEL_ID,
        text: `Fulcrum: ${pushedLeads.length} new ${brand.name} leads`,
        blocks,
      });
      console.log(`\nSlack message sent for ${brand.name}! ts: ${result.ts}`);
    } catch (err) {
      console.error(`Slack failed for ${brand.name}:`, err);
    }
  }

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
