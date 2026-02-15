# Fulcrum Rev — Setup Prompts for Claude Code

Run these one at a time, in order. Each one is self-contained.

---

## Prompt 1: Git Init + Push to GitHub

```
Initialize a git repo for ~/fulcrum-rev and push it to the fulcrum-co GitHub org. The repo name should be fulcrum-rev. Create the repo on GitHub using the gh CLI, make an initial commit with everything, and push to main. Add a .gitignore if one doesn't exist (Node.js template — make sure .env is ignored).
```

---

## Prompt 2: Set Up Anthropic + Perplexity API Keys

```
I need to add my API keys to the Fulcrum Rev project at ~/fulcrum-rev.

Here are my keys:
- Anthropic: [PASTE YOUR KEY]
- Perplexity: [PASTE YOUR KEY]

Update the .env file with these values for ANTHROPIC_API_KEY and PERPLEXITY_API_KEY. Don't touch any other env vars.
```

---

## Prompt 3: Set Up Clerk

```
I need to set up Clerk for the Fulcrum Rev project at ~/fulcrum-rev. My Clerk secret key is: [PASTE YOUR KEY]

1. Update .env with CLERK_SECRET_KEY
2. Tell me exactly what webhook I need to configure in the Clerk dashboard — give me the event types and the URL path. The app isn't deployed yet so just tell me the path and I'll update it later.
```

---

## Prompt 4: Set Up Slack App (Huck Agent)

```
I need to set up the Slack app for Fulcrum Rev at ~/fulcrum-rev. The bot's name is Huck — he's the AI revenue ops agent that users talk to.

Here are my credentials:
- Bot Token: [PASTE xoxb-...]
- App ID: [PASTE A...]
- Signing Secret: [PASTE]
- Team ID: [PASTE T...]
- Channel ID for Hunhu alerts: [PASTE C...]
- Channel ID for Pulse alerts: [PASTE C...]

1. Update .env with SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, and SLACK_APP_ID
2. Insert the Slack config rows into the Neon database for both tenants. The Neon project ID is restless-grass-89011670. Hunhu tenant ID is 252b7916-924c-4471-a00b-3830781412cc, Pulse tenant ID is b442001c-94e7-4185-a54b-e5e58437e3c7.

IMPORTANT: When configuring the Slack app in the dashboard, make sure to:
- Enable Event Subscriptions with these bot events: app_mention, message.im
- Set the Request URL for events to: [YOUR_APP_URL]/api/slack/events
- Set the Request URL for interactivity to: [YOUR_APP_URL]/api/slack/interactions
- Add these bot token scopes: chat:write, commands, app_mentions:read, im:history, im:read, im:write
- Enable the /fulcrum slash command pointing to: [YOUR_APP_URL]/api/slack/commands

Users will interact with Huck by @mentioning him in channels or DMing him directly.
```

---

## Prompt 5: Set Up Zoho CRM

```
I need to configure Zoho CRM for Fulcrum Rev at ~/fulcrum-rev. Here are my Zoho API credentials:
- Client ID: [PASTE]
- Client Secret: [PASTE]
- Refresh Token: [PASTE]

1. Update the .env with ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
2. Update both tenant records in the Neon database (project ID: restless-grass-89011670) to store these CRM credentials in the crm_config JSON column. Both Hunhu and Pulse use Zoho.
```

---

## Prompt 6: Set Up Apify

```
I need to configure Apify for LinkedIn scraping in Fulcrum Rev at ~/fulcrum-rev. My Apify API token is: [PASTE]

Update .env with APIFY_API_KEY.
```

---

## Prompt 7: Deploy to DigitalOcean

```
Deploy the Fulcrum Rev project at ~/fulcrum-rev to DigitalOcean App Platform using the doctl CLI. The GitHub repo is fulcrum-co/fulcrum-rev.

1. Install doctl if needed and authenticate
2. Create the app spec and deploy
3. Set all environment variables from .env
4. Generate a CRON_SECRET (random 32-byte hex string) and add it too
5. Give me the final app URL when done

After deployment, tell me what webhook URLs I need to update in Clerk and Slack dashboards.
```

---

## Prompt 8: First Test Run

```
The Fulcrum Rev app is deployed at [PASTE YOUR APP URL]. Run through these tests:

1. Hit the health endpoint and confirm it returns tenant count = 2
2. Trigger the pipeline manually using curl with the CRON_SECRET from .env
3. Check if there are any errors in the response
4. Tell me what happened and what to fix if anything fails

The CRON_SECRET is in ~/fulcrum-rev/.env
```

---

## Prompt 9: Notion Brand Registry Integration (Future)

```
I want to connect the Fulcrum Rev system at ~/fulcrum-rev to our Notion Brand Registry so it can pull product/brand information per tenant. My Notion API key is: [PASTE]

The Brand Registry is a Notion database at: [PASTE DATABASE URL]

Each entry has: Brand Name, Product Description, Target Audience, Value Proposition, Key Differentiators, and Competitor List.

Create a lib/notion/brand-registry.ts module that:
1. Fetches brand info from Notion for a given tenant
2. Injects that context into the AI enrichment prompts so Claude knows what each product does
3. Can be called during the daily pipeline to keep brand context fresh

Wire it into the existing enricher at lib/pipeline/enricher.ts.
```

---

## Quick Reference

- **Project:** ~/fulcrum-rev
- **Neon Project ID:** restless-grass-89011670
- **Database:** neondb
- **Hunhu Tenant ID:** 252b7916-924c-4471-a00b-3830781412cc
- **Pulse Tenant ID:** b442001c-94e7-4185-a54b-e5e58437e3c7
- **CRO Memory Doc:** ~/fulcrum-rev/docs/CRO-MEMORY.md
