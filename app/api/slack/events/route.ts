import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processMessage } from '@/lib/huck/agent';
import { getSlackClient } from '@/lib/slack/client';
import { verifySlackRequest } from '@/lib/slack/verify-signature';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * POST /api/slack/events
 * Handle Slack Events API — Huck's primary entry point.
 *
 * Supports:
 * - url_verification (Slack challenge)
 * - app_mention (someone @mentions Huck in a channel)
 * - message (DM to Huck)
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Verify Slack request signature
  const sig = verifySlackRequest(request.headers, rawBody);
  if (!sig.valid) {
    return NextResponse.json({ error: sig.error }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  // Handle Slack URL verification challenge
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Handle event callbacks
  if (body.type === 'event_callback') {
    const event = body.event;
    const teamId = body.team_id;

    // Rate limit by team
    if (teamId) {
      const rl = checkRateLimit(`slack:${teamId}`, RATE_LIMITS.slackEvents);
      if (rl.limited) {
        return new NextResponse('', { status: 200 }); // Acknowledge but don't process
      }
    }

    // Ignore bot messages to prevent self-reply loops
    if (event?.bot_id || event?.subtype === 'bot_message') {
      return new NextResponse('', { status: 200 });
    }

    // Ignore message_changed, message_deleted, etc.
    if (event?.subtype) {
      return new NextResponse('', { status: 200 });
    }

    // Return 200 immediately — Slack requires response within 3 seconds
    // Process the message asynchronously
    const eventType = event?.type;
    const text = event?.text ?? '';
    const channelId = event?.channel;
    const threadTs = event?.thread_ts ?? event?.ts;

    if ((eventType === 'app_mention' || (eventType === 'message' && event?.channel_type === 'im')) && text && channelId) {
      // Fire and forget — process async
      handleHuckMessage(teamId, channelId, threadTs, text).catch((err) => {
        console.error('[Huck] Message processing failed:', err);
      });
    }
  }

  return new NextResponse('', { status: 200 });
}

/**
 * Process a message through Huck and reply in Slack.
 */
async function handleHuckMessage(
  teamId: string,
  channelId: string,
  threadTs: string,
  rawText: string
): Promise<void> {
  // Strip the @mention from the message text
  const text = rawText.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  // Look up which tenant this workspace belongs to
  const slackConfig = await prisma.tenantSlackConfig.findFirst({
    where: { teamId },
  });

  if (!slackConfig) {
    console.warn(`[Huck] No tenant found for Slack team ${teamId}`);
    return;
  }

  const tenantId = slackConfig.tenantId;

  // Process through Huck
  const response = await processMessage(tenantId, channelId, threadTs, text);

  // Post Huck's reply
  const slack = await getSlackClient(tenantId);
  if (!slack) return;

  await slack.client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: response.text,
    ...(response.blocks ? { blocks: response.blocks as never[] } : {}),
  });
}
