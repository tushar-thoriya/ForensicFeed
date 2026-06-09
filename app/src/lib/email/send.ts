import { Resend } from 'resend'
import { getEnv } from '@/lib/env'

// Resend's no-domain sender. Fine for a personal tool; override via DIGEST_FROM
// once a custom domain is verified.
const DEFAULT_FROM = 'ForensicFeed <onboarding@resend.dev>'

export interface SendDigestInput {
  subject: string
  html: string
  text: string
  idempotencyKey?: string
}

// Structural shape of resend.emails.send — injectable so the wrapper's guard and
// result-handling logic is unit-testable without hitting the network.
export type EmailSender = (
  payload: { from: string; to: string; subject: string; html: string; text: string },
  options?: { idempotencyKey?: string },
) => Promise<{ data: { id: string } | null; error: { message: string } | null }>

export interface SendDeps {
  sender?: EmailSender
  apiKey?: string
  recipient?: string
  from?: string
}

export async function sendDigestEmail(
  input: SendDigestInput,
  deps: SendDeps = {},
): Promise<{ id: string }> {
  const env = getEnv()
  const apiKey = deps.apiKey ?? env.RESEND_API_KEY
  const recipient = deps.recipient ?? env.DIGEST_RECIPIENT
  const from = deps.from ?? env.DIGEST_FROM ?? DEFAULT_FROM

  if (!apiKey) throw new Error('RESEND_API_KEY is not configured')
  if (!recipient) throw new Error('DIGEST_RECIPIENT is not configured')

  const send: EmailSender =
    deps.sender ?? ((payload, options) => new Resend(apiKey).emails.send(payload, options))

  const { data, error } = await send(
    { from, to: recipient, subject: input.subject, html: input.html, text: input.text },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  )

  // Resend reports API failures via `error` rather than throwing. Re-throw so
  // the Inngest step fails and the run retries instead of silently no-op'ing.
  if (error) throw new Error(`Resend send failed: ${error.message}`)
  if (!data) throw new Error('Resend returned no data')

  return { id: data.id }
}
