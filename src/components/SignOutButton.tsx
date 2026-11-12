'use client'

import { signOut } from '@/src/lib/auth'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function SignOutButton() {
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

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-50"
    >
      {loading ? 'Signing out...' : 'Sign Out'}
    </button>
  )
}
