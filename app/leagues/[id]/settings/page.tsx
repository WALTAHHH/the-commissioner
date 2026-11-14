import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { prettifyLabel, formatDate } from '@/src/lib/display'
import { Settings, Trophy, Users, Hash, Calendar, Mail, Globe } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} settings — The Commissioner` : 'League not found',
  }
}

export default async function LeagueSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  const fields = [
    {
      icon: <Globe className="h-5 w-5" />,
      label: 'League name',
      value: ctx.name,
    },
    {
      icon: <Trophy className="h-5 w-5" />,
      label: 'Sport',
      value: prettifyLabel(ctx.sport),
    },
    {
      icon: <Users className="h-5 w-5" />,
      label: 'Format',
      value: prettifyLabel(ctx.format),
    },
    {
      icon: <Hash className="h-5 w-5" />,
      label: 'URL slug',
      value: ctx.slug,
      mono: true,
    },
    {
      icon: <Mail className="h-5 w-5" />,
      label: 'Commissioner',
      value: ctx.commissionerEmail ?? 'Unknown',
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      label: 'Created',
      value: formatDate(ctx.createdAt),
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            League settings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your league's configuration
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Read‑only for now
          </span>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div
            key={field.label}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                {field.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {field.label}
                </p>
                <p className={`mt-1 text-xl font-semibold ${field.mono ? 'font-mono' : ''} text-foreground`}>
                  {field.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Notice */}
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-primary">
              Settings are read‑only in this phase
            </h3>
            <p className="mt-2 text-muted-foreground">
              These fields cannot be edited yet. League renaming, sport/format
              changes, and commissioner hand‑off will arrive in a future release.
            </p>
          </div>
        </div>
      </div>

      {/* Actions placeholder */}
      <div className="rounded-2xl border border-border bg-card p-8">
        <h3 className="mb-4 text-xl font-semibold text-foreground">
          Coming soon
        </h3>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"></div>
            <span>League renaming and logo upload</span>
          </li>
          <li className="flex items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"></div>
            <span>Advanced scoring settings</span>
          </li>
          <li className="flex items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"></div>
            <span>Member role management</span>
          </li>
          <li className="flex items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"></div>
            <span>Season scheduling and draft tools</span>
          </li>
        </ul>
      </div>
    </div>
  )
}