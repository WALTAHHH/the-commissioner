'use client'

import { signOut } from '@/src/lib/auth'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function SignOutButton({
  variant = 'solid',
}: {
  variant?: 'solid' | 'nav'
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleSignOut = async () => {
    setLoading(true)
    const { error } = await signOut()
    setLoading(false)
    if (error) {
      console.error('Sign out error:', error)
      // optionally show error
    } else {
      router.push('/login')
    }
  }

  // 'nav' is the compact form used in AppNav; 'solid' keeps the original
  // standalone look (T1 login/landing pages).
  const className =
    variant === 'nav'
      ? 'rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
      : 'rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-50'

  return (
    <button onClick={handleSignOut} disabled={loading} className={className}>
      {loading ? 'Signing out...' : 'Sign Out'}
    </button>
  )
}
