# Discovery Providers

## Current Model

Fulcrum uses a provider abstraction for lead discovery.

- primary provider: `Instantly`
- fallback provider: `Apify`
- source of truth: `lib/discovery/service.ts`

## Stored Query Shape

Search queries remain stored in the existing tenant schema:

```json
{
  "keywords": "superintendent OR director",
  "industry": "Education",
  "companySize": "201-1000",
  "additionalKeywords": "student wellness"
}
```

The translator layer in `lib/discovery/translate-query.ts` converts that shape into the Instantly preview request.

## Credential Resolution

Tenant credentials override platform credentials in this order:

1. tenant-owned provider key
2. platform environment key

Managed keys:

- Instantly API key and workspace ID in `Tenant.instantlyConfig`
- Apify API token in `Tenant.apifyApiToken`
- Anthropic API key in `Tenant.anthropicApiKey`

Secrets are encrypted at rest when `TOKEN_ENCRYPTION_KEY` is configured.

## Fallback Rules

- if the primary provider is `instantly` and the request fails for auth or configuration reasons, the discovery service retries once with Apify when an Apify credential is available
- if the primary provider is `apify`, there is no automatic reverse fallback

## Key Files

- `lib/discovery/provider.ts`
- `lib/discovery/service.ts`
- `lib/discovery/instantly-provider.ts`
- `lib/discovery/apify-provider.ts`
- `lib/discovery/translate-query.ts`
- `app/api/settings/api-keys/route.ts`
