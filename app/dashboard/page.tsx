import { createClient } from '@/src/utils/supabase/server'
import { redirect } from 'next/navigation'
import SignOutButton from '@/src/components/SignOutButton'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Welcome to your dashboard.
        </p>
        <div className="mt-8">
          <p>Logged in as: {user.email}</p>
          <SignOutButton />
        </div>
      </main>
    </div>
  )
}
