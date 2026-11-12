import { createClient } from '@/src/utils/supabase/server'
import { redirect } from 'next/navigation'
import LeagueCreationForm from './league-creation-form'

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
    <div className="flex flex-col items-center justify-center py-6 sm:py-10">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
        <h1 className="mb-2 text-2xl font-bold text-black dark:text-zinc-50">
          Create a League
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Set up your fantasy league. You will be its commissioner.
        </p>
        <LeagueCreationForm />
      </div>
    </div>
  )
}
