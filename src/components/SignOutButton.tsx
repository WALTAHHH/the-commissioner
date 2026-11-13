'use client'

import { signOut } from '@/src/lib/auth'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LogOut } from 'lucide-react'

export default function SignOutButton({
  variant = 'solid',
}: {
  variant?: 'solid' | 'nav' | 'icon'
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
  // standalone look (T1 login/landing pages); 'icon' is icon-only button.
  const className =
    variant === 'nav'
      ? 'rounded border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50'
      : variant === 'icon'
      ? 'p-2 rounded-md hover:bg-accent text-foreground disabled:opacity-50'
      : 'rounded bg-destructive px-4 py-2 text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50'

  return (
    <button onClick={handleSignOut} disabled={loading} className={className}>
      {variant === 'icon' ? (
        <LogOut className="h-5 w-5" />
      ) : loading ? (
        'Signing out...'
      ) : (
        'Sign Out'
      )}
    </button>
  )
}