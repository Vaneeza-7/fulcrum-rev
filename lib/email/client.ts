import { Resend } from 'resend'

const globalForResend = globalThis as unknown as { resend: Resend | undefined }

function createResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

export const resend = globalForResend.resend ?? createResendClient()

if (process.env.NODE_ENV !== 'production' && resend) {
  globalForResend.resend = resend
}
