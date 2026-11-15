import Link from 'next/link'
import { Trophy } from 'lucide-react'

/**
 * The league a piece of content belongs to, as a compact badge.
 *
 * Two surfaces have to answer "which league is this from?" and must look
 * identical:
 *  - the /dashboard "Recent announcements" widget — its items arrive from
 *    every league the viewer belongs to, so each row calls out its league;
 *  - the league announcements page header — the league is the page's context.
 *
 * Tint follows docs/design-system.md §"Tint pattern" (a token at low alpha
 * over a surface, never a hard-coded pastel) and the badge shape the widget
 * already uses for its New/Pinned chips (rounded-md, text-xs).
 *
 * `href` is optional on purpose: the widget renders each row as a <Link> and
 * an <a> inside an <a> is invalid HTML, so there the badge is a plain
 * <span>. When `href` is set the badge links out (e.g. to the league
 * dashboard) and gains a hover fill.
 */
export default function LeagueBadge({
  name,
  href,
  className = '',
}: {
  name: string
  /** When set, the badge becomes a link to this href. */
  href?: string
  className?: string
}) {
  const classes = [
    'inline-flex max-w-full items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      <Trophy className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </>
  )

  if (href) {
    return (
      <Link href={href} title={name} className={`${classes} hover:bg-primary/20`}>
        {inner}
      </Link>
    )
  }

  return (
    <span className={classes} title={name}>
      {inner}
    </span>
  )
}
