import { createClient } from '@/src/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Sparkles, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  // Logged‑in users go straight to their dashboard
  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      {/* Header */}
      <header className="mx-auto w-full max-w-5xl px-4 pt-8 sm:pt-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">
              The Commissioner
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16 sm:py-24">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
            Fantasy sports{' '}
            <span className="text-primary">
              league management
            </span>{' '}
            reimagined.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Create leagues, invite members, track seasons, and make decisions
            together—all in one beautiful, modern platform.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center rounded-full bg-primary px-8 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 sm:px-10"
            >
              Start a free league
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-full border border-input bg-transparent px-8 py-3 text-base font-medium text-foreground hover:border-input/70 sm:px-10"
            >
              I already have an account
            </Link>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="mt-24 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">
              Invite & Manage Members
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Send personalized invite links, assign roles, and keep your
              league roster up to date with real‑time updates.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <Sparkles className="h-6 w-6 text-success" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">
              AI‑Powered Insights
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Get smart suggestions for league settings, schedule balancing, and
              conflict resolution—powered by modern AI.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
              <Sparkles className="h-6 w-6 text-warning" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">
              Commissioner Tools
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Everything you need to run a league: draft tools, season tracking,
              rule enforcement, and member communication.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
        <div className="mx-auto max-w-5xl">
          <p>
            The Commissioner · Built with Next.js & Supabase
          </p>
          <p className="mt-2">
            Open‑source fantasy sports platform scaffold.
          </p>
        </div>
      </footer>
    </div>
  )
}