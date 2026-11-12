import { db } from '@/src/lib/db'
import { leagues } from '@/src/db/schema/leagues'
import { eq } from 'drizzle-orm'
import { createClient } from '@/src/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Malformed ids are 404s, not 500s (uuid casts would throw in Postgres).
  if (!UUID_REGEX.test(id)) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    redirect('/login')
  }

  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      sport: leagues.sport,
      format: leagues.format,
      slug: leagues.slug,
    })
    .from(leagues)
    .where(eq(leagues.id, id))
    .limit(1)

  if (!league) {
    notFound()
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          {league.name}
        </h1>
        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Dashboard coming soon.
        </p>
        <div className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          <p>Sport: {league.sport}</p>
          <p>Format: {league.format}</p>
          <p>
            Slug: <code>{league.slug}</code>
          </p>
        </div>
      </main>
    </div>
  )
}
