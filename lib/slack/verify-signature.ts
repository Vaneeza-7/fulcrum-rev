import crypto from 'crypto';

export type SignatureError = 'missing_headers' | 'timestamp_too_old' | 'invalid_signature';

export interface SignatureResult {
  valid: boolean;
  error?: SignatureError;
}

const MAX_TIMESTAMP_AGE_SECONDS = 300; // 5 minutes — prevents replay attacks

/**
 * Verify a Slack request signature using HMAC-SHA256.
 * Returns { valid: true } if the signature matches,
 * or { valid: false, error } with the specific failure reason.
 *
 * Skips verification in development if SLACK_SIGNING_SECRET is not set.
 */
export function verifySlackSignature(
  signingSecret: string | undefined,
  timestamp: string | null,
  signature: string | null,
  body: string
): SignatureResult {
  // Skip verification in development
  if (!signingSecret) return { valid: true };

  if (!timestamp || !signature) {
    return { valid: false, error: 'missing_headers' };
  }

  // Reject requests older than 5 minutes (replay attack prevention)
  const requestTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(requestTime) || Math.abs(now - requestTime) > MAX_TIMESTAMP_AGE_SECONDS) {
    return { valid: false, error: 'timestamp_too_old' };
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBasestring).digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    const valid = crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
    return valid ? { valid: true } : { valid: false, error: 'invalid_signature' };
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    return { valid: false, error: 'invalid_signature' };
  }
}

/**
 * Helper to extract signature headers from a NextRequest and verify.
 */
export function verifySlackRequest(
  headers: { get(name: string): string | null },
  body: string
): SignatureResult {
  return verifySlackSignature(
    process.env.SLACK_SIGNING_SECRET,
    headers.get('x-slack-request-timestamp'),
    headers.get('x-slack-signature'),
    body
  );
}
