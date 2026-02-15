import { z } from 'zod';

/** UUID v4 validation. */
export const uuidSchema = z.string().uuid();

/** Tenant ID parameter validation for cron endpoints. */
export const tenantIdParam = z.string().uuid().optional();

/** Slack event callback payload (minimal validation). */
export const slackEventSchema = z.object({
  type: z.enum(['url_verification', 'event_callback']),
  challenge: z.string().optional(),
  team_id: z.string().optional(),
  event: z.object({
    type: z.string(),
    text: z.string().optional(),
    channel: z.string().optional(),
    thread_ts: z.string().optional(),
    ts: z.string().optional(),
    channel_type: z.string().optional(),
    bot_id: z.string().optional(),
    subtype: z.string().optional(),
  }).optional(),
});

/** Clerk webhook payload (minimal validation). */
export const clerkWebhookSchema = z.object({
  type: z.enum([
    'organization.created',
    'organization.updated',
    'organization.deleted',
  ]),
  data: z.object({
    id: z.string(),
    name: z.string().optional(),
    slug: z.string().optional(),
  }),
});

/** Apify webhook payload (minimal validation). */
export const apifyWebhookSchema = z.object({
  eventType: z.string(),
  resource: z.object({
    id: z.string().optional(),
    status: z.string().optional(),
  }).optional(),
});
