/**
 * Transactional email transport (Resend).
 *
 * Server-only — never import from a client component. This is infrastructure
 * for the notification features (dues reminders, announcements, vote
 * reminders); no production code sends mail through it yet. Callers compose
 * HTML with `src/lib/email-templates.ts` and hand it to `sendEmail`.
 *
 * ## Why lazy
 * Same lesson as `src/lib/db.ts`: `RESEND_API_KEY` is a runtime-injected
 * Vercel env var, and a module-scope client that throws when the var is
 * missing would kill page collection during `next build`. The client is
 * therefore built on first use, and the throw only fires when a send is
 * actually attempted without configuration.
 *
 * ## Error model
 * The Resend SDK reports failures as a `{ data, error }` tuple instead of
 * throwing (see `CreateEmailResponse` in the package types — `error` is
 * non-null exactly when `data` is null). We convert `error` into a thrown
 * `Error` so callers get normal try/catch semantics and cannot silently
 * ignore a failed send by destructuring only `data`.
 *
 * ## Keys
 * `RESEND_API_KEY` must be set in the environment (Matt adds it in Vercel);
 * nothing here hardcodes a key, and nothing here logs one.
 */
import { Resend } from 'resend'

/** Fallback sender for local/dev work before a verified domain is configured.
 *  `onboarding@resend.dev` is Resend's sandbox address — it can only deliver
 *  to addresses verified on the account, which is exactly what we want from
 *  a default. Production should set `RESEND_FROM_EMAIL` to an address on a
 *  verified domain. */
const DEV_FALLBACK_FROM = 'The Commissioner <onboarding@resend.dev>'

let client: Resend | null = null

/**
 * The Resend client, created once per serverless container.
 * Throws only when a send is actually attempted without configuration.
 */
export function getResendClient(): Resend {
  if (client) return client

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set.')
  }

  client = new Resend(apiKey)
  return client
}

/**
 * Resolve the sender address: explicit `from` param wins, then the
 * `RESEND_FROM_EMAIL` env var, then the Resend sandbox address.
 * The env var supports the `"Friendly Name <addr@domain>"` format Resend
 * documents; it is passed through untouched.
 */
export function resolveFrom(from?: string): string {
  if (from) return from
  return process.env.RESEND_FROM_EMAIL || DEV_FALLBACK_FROM
}

export type SendEmailParams = {
  /** Recipient(s). Resend accepts up to 50 addresses per send. */
  to: string | string[]
  subject: string
  /** Full HTML document — build it with `src/lib/email-templates.ts`. */
  html: string
  /** Override the sender; defaults to `RESEND_FROM_EMAIL`. */
  from?: string
  replyTo?: string
}

export type SendEmailResult = {
  /** Resend's email id — keep it if a caller wants to correlate delivery webhooks. */
  id: string
}

/**
 * Send one transactional email through Resend.
 *
 * Resolves with the email id once the API accepts the send (delivery is
 * still asynchronous); throws on any configuration or API error.
 */
export async function sendEmail({
  to,
  subject,
  html,
  from,
  replyTo,
}: SendEmailParams): Promise<SendEmailResult> {
  const resend = getResendClient()

  const { data, error } = await resend.emails.send({
    from: resolveFrom(from),
    to,
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  })

  if (error) {
    throw new Error(
      `Resend send failed (${error.statusCode ?? 'unknown status'}): ${error.message}`,
    )
  }

  return { id: data.id }
}
