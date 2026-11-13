import Link from 'next/link'
import { createClient } from '@/src/utils/supabase/server'
import { redirect } from 'next/navigation'
import LeagueCreationForm from './league-creation-form'
import { Sparkles } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function NewLeaguePage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 font-sans">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Create a League
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Set up your fantasy league. You will be its commissioner.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
          <LeagueCreationForm />
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  )
}