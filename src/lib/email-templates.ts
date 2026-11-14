/**
 * HTML email templates for transactional notifications.
 *
 * Pure string-in / string-out: no SDK, no env vars, no DB — the transport
 * lives in `src/lib/email.ts` and callers pick a subject line. Every one of
 * these returns a complete HTML document with inline styles only (email
 * clients strip external CSS), table-based layout, and a system font stack.
 *
 * ## Escaping
 * Every interpolated value — names, league names, titles, free-text bodies,
 * payment instructions — is HTML-escaped before it reaches markup. Member
 * display names and announcement bodies are user data we do not control, so
 * a name like `<script>alert(1)</script>` must render as literal text, not
 * execute in a recipient's client. Multi-line text converts `\n` to
 * `<br />` *after* escaping, so the break conversion itself can't be spoofed
 * by injected markup.
 *
 * ## Dates
 * `dueDate` / `closesAt` accept a pre-formatted string (callers usually
 * already have one) or a `Date`, which we render deterministically in UTC so
 * server and background workers never disagree on a deadline.
 */

export type DudeReminderEmailParams = {
  memberName: string
  leagueName: string
  /** Dues amount in USD; rendered with two decimals. */
  amount: number
  dueDate: string | Date
  /** Free-text payment instructions (Venmo/Zelle/cash…), multi-line allowed. */
  paymentInstructions: string
}

export type AnnouncementEmailParams = {
  memberName: string
  leagueName: string
  title: string
  /** Announcement body as plain text; `\n` line breaks are preserved. */
  body: string
}

export type VoteReminderEmailParams = {
  memberName: string
  leagueName: string
  pollTitle: string
  closesAt: string | Date
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape, then turn newlines into breaks. Order matters — see header. */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br />')
}

/**
 * Dates render deterministically as "Friday, January 2, 2026, 9:00 PM UTC";
 * pre-formatted strings pass through untouched.
 *
 * Deliberately plain UTC arithmetic instead of `Intl.DateTimeFormat`: server
 * ICU builds vary (Vercel may ship small-icu and fall back to odd locales),
 * and every value shown must be unambiguous without a viewer timezone.
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatWhen(value: string | Date): string {
  if (typeof value === 'string') return value
  const pad = (n: number) => String(n).padStart(2, '0')
  const hours24 = value.getUTCHours()
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return (
    `${DAY_NAMES[value.getUTCDay()]}, ${MONTH_NAMES[value.getUTCMonth()]} ` +
    `${value.getUTCDate()}, ${value.getUTCFullYear()}, ` +
    `${hours12}:${pad(value.getUTCMinutes())} ${period} UTC`
  )
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`
}

/**
 * Shared chrome: one 560px card with a league eyebrow, heading, body slot,
 * and a compliance footer. `body` must already be escaped/safe markup.
 */
function layout({
  leagueName,
  heading,
  body,
}: {
  leagueName: string
  heading: string
  body: string
}): string {
  const safeLeague = escapeHtml(leagueName)
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f4f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b;">
            <tr>
              <td style="padding: 28px 32px 0;">
                <p style="margin: 0; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #71717a;">The Commissioner &middot; ${safeLeague}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 14px 32px 0;">
                <h1 style="margin: 0; font-size: 22px; line-height: 1.3; font-weight: 600; color: #18181b;">${escapeHtml(heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 32px 24px; font-size: 15px; line-height: 1.55; color: #3f3f46;">
${body}
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 28px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a1a1aa; border-top: 1px solid #e4e4e7; padding-top: 16px;">You are receiving this because you are a member of ${safeLeague} on The Commissioner.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Dues reminder ("dude reminder"). Renders amount and due date in a detail
 * table and the commissioner's payment instructions in a highlighted block.
 */
export function dudeReminderEmail({
  memberName,
  leagueName,
  amount,
  dueDate,
  paymentInstructions,
}: DudeReminderEmailParams): string {
  const body = `<p style="margin: 0 0 16px;">Hi ${escapeHtml(memberName)},</p>
<p style="margin: 0 0 20px;">Your dues for <strong style="color: #18181b;">${escapeHtml(leagueName)}</strong> are coming up. Here are the details:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 0 0 20px;">
  <tr>
    <td style="padding: 10px 12px; border: 1px solid #e4e4e7; border-radius: 8px 0 0 8px; font-size: 14px; color: #71717a;">Amount due</td>
    <td style="padding: 10px 12px; border: 1px solid #e4e4e7; font-size: 14px; font-weight: 600; color: #18181b;">${escapeHtml(formatAmount(amount))}</td>
  </tr>
  <tr>
    <td style="padding: 10px 12px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 0 8px; font-size: 14px; color: #71717a;">Due by</td>
    <td style="padding: 10px 12px; border: 1px solid #e4e4e7; border-top: none; font-size: 14px; font-weight: 600; color: #18181b;">${escapeHtml(formatWhen(dueDate))}</td>
  </tr>
</table>
<p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #71717a;">Payment instructions</p>
<div style="padding: 14px 16px; background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 14px; color: #18181b;">${escapeMultiline(paymentInstructions)}</div>
<p style="margin: 20px 0 0;">Questions? Just reply to this email and the commissioner will see it.</p>`

  return layout({ leagueName, heading: 'Dues reminder', body })
}

/**
 * League announcement. The announcement title is the email heading; the body
 * renders as free text with the author's line breaks preserved.
 */
export function announcementEmail({
  memberName,
  leagueName,
  title,
  body,
}: AnnouncementEmailParams): string {
  const content = `<p style="margin: 0 0 16px;">Hi ${escapeHtml(memberName)},</p>
<p style="margin: 0;">${escapeMultiline(body)}</p>`

  return layout({ leagueName, heading: title, body: content })
}

/**
 * Poll closing reminder. Names the poll and the exact closing deadline;
 * there is deliberately no link/button — callers add deep links when the
 * notification UI decides the URL shape.
 */
export function voteReminderEmail({
  memberName,
  leagueName,
  pollTitle,
  closesAt,
}: VoteReminderEmailParams): string {
  const body = `<p style="margin: 0 0 16px;">Hi ${escapeHtml(memberName)},</p>
<p style="margin: 0 0 16px;">Voting is closing soon on a poll in <strong style="color: #18181b;">${escapeHtml(leagueName)}</strong>:</p>
<div style="padding: 14px 16px; background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 15px; font-weight: 600; color: #18181b; margin: 0 0 16px;">${escapeHtml(pollTitle)}</div>
<p style="margin: 0;">Closes <strong style="color: #18181b;">${escapeHtml(formatWhen(closesAt))}</strong>. Cast your vote before then — once it closes, the result stands.</p>`

  return layout({ leagueName, heading: 'Vote reminder', body })
}
