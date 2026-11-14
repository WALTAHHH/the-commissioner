'use client'

import { useState } from 'react'
import { signUp } from '@/src/lib/auth'
import { returnToAfterAuth } from '@/src/lib/auth-return'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signUp(email, password)
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      // Honour ?next= so invite links survive the sign-up round trip.
      router.push(returnToAfterAuth('/dashboard'))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 font-sans">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            The Commissioner
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your account
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
          <h2 className="mb-6 text-xl font-semibold text-foreground">
            Sign Up
          </h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Email address" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                disabled={loading}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                disabled={loading}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            {error && <FormMessage>{error}</FormMessage>}
            <SubmitButton loading={loading} size="lg" className="w-full">
              Sign Up
            </SubmitButton>
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                href="/login"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
            <p className="mt-3 text-center text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">
                ← Back to home
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
