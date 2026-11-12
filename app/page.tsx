import { createClient } from '@/src/utils/supabase/server'
import Link from 'next/link'
import SignOutButton from '@/src/components/SignOutButton'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          The Commissioner
        </h1>
        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Fantasy sports platform scaffold
        </p>
        <div className="mt-8">
          {user ? (
            <div className="flex flex-col gap-4">
              <p>Logged in as: {user.email}</p>
              <SignOutButton />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p>Not logged in</p>
              <Link
                href="/login"
                className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 text-center"
              >
                Go to Login
              </Link>
              <Link
                href="/signup"
                className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 text-center"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}