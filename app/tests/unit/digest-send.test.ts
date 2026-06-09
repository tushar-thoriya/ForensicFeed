// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { sendDigestEmail, type EmailSender } from '@/lib/email/send'

// All values are injected via `deps`, so getEnv() is only the fallback path —
// mock it to avoid coupling this unit to a real DATABASE_URL at module load.
vi.mock('@/lib/env', () => ({
  getEnv: () => ({
    RESEND_API_KEY: undefined,
    DIGEST_RECIPIENT: undefined,
    DIGEST_FROM: undefined,
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  }),
}))

const CONTENT = { subject: 'ForensicFeed · 2 new papers this week', html: '<p>hi</p>', text: 'hi' }
const okDeps = { apiKey: 're_test', recipient: 'me@example.com', from: 'ForensicFeed <x@y.com>' }

function okSender(): EmailSender {
  return vi.fn(async () => ({ data: { id: 'email_123' }, error: null }))
}

describe('sendDigestEmail', () => {
  it('returns the email id on success', async () => {
    const sender = okSender()
    const result = await sendDigestEmail(CONTENT, { ...okDeps, sender })
    expect(result).toEqual({ id: 'email_123' })
  })

  it('passes from/to/subject/html/text through to the sender', async () => {
    const sender = okSender()
    await sendDigestEmail(CONTENT, { ...okDeps, sender })
    expect(sender).toHaveBeenCalledWith(
      {
        from: 'ForensicFeed <x@y.com>',
        to: 'me@example.com',
        subject: CONTENT.subject,
        html: CONTENT.html,
        text: CONTENT.text,
      },
      undefined,
    )
  })

  it('forwards an idempotency key to the sender options', async () => {
    const sender = okSender()
    await sendDigestEmail({ ...CONTENT, idempotencyKey: 'weekly-digest-2026-06-02' }, { ...okDeps, sender })
    expect(sender).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: 'weekly-digest-2026-06-02',
    })
  })

  it('throws when Resend returns an error', async () => {
    const sender: EmailSender = vi.fn(async () => ({ data: null, error: { message: 'rate limited' } }))
    await expect(sendDigestEmail(CONTENT, { ...okDeps, sender })).rejects.toThrow(/Resend send failed/)
  })

  it('throws when Resend returns neither data nor error', async () => {
    const sender: EmailSender = vi.fn(async () => ({ data: null, error: null }))
    await expect(sendDigestEmail(CONTENT, { ...okDeps, sender })).rejects.toThrow(/no data/)
  })

  it('throws when no API key is configured', async () => {
    const sender = okSender()
    await expect(
      sendDigestEmail(CONTENT, { ...okDeps, apiKey: '', sender }),
    ).rejects.toThrow(/RESEND_API_KEY/)
    expect(sender).not.toHaveBeenCalled()
  })

  it('throws when no recipient is configured', async () => {
    const sender = okSender()
    await expect(
      sendDigestEmail(CONTENT, { ...okDeps, recipient: '', sender }),
    ).rejects.toThrow(/DIGEST_RECIPIENT/)
    expect(sender).not.toHaveBeenCalled()
  })
})
