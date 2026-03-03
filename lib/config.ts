import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  APIFY_API_TOKEN: z.string().optional(),
  INSTANTLY_API_KEY: z.string().optional(),
  INSTANTLY_WORKSPACE_ID: z.string().optional(),
  DEFAULT_DISCOVERY_PROVIDER: z.enum(['instantly', 'apify']).optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  SLACK_APP_ID: z.string().optional(),
  ZOHO_CLIENT_ID: z.string().optional(),
  ZOHO_CLIENT_SECRET: z.string().optional(),
  ZOHO_REFRESH_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  // Resend (email delivery)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  // Predictive Revenue Engine — external API connectors
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GSC_SITE_URL: z.string().optional(),
  GA4_PROPERTY_ID: z.string().optional(),
  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),
  CLARITY_API_TOKEN: z.string().optional(),
  CLARITY_PROJECT_ID: z.string().optional(),
  INDEXNOW_API_KEY: z.string().optional(),
  APP_URL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER_BASE: z.string().optional(),
  STRIPE_PRICE_STARTER_OVERAGE: z.string().optional(),
  STRIPE_PRICE_GROWTH_BASE: z.string().optional(),
  STRIPE_PRICE_GROWTH_OVERAGE: z.string().optional(),
  STRIPE_PRICE_SCALE_BASE: z.string().optional(),
  STRIPE_PRICE_SCALE_OVERAGE: z.string().optional(),
  BILLING_TARGET_MARKUP_MULTIPLIER: z.string().optional(),
  BILLING_INCLUDED_CREDITS_STARTER: z.string().optional(),
  BILLING_INCLUDED_CREDITS_GROWTH: z.string().optional(),
  BILLING_INCLUDED_CREDITS_SCALE: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  return parsed.data;
}

export const env = loadEnv();
