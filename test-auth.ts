import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { signUp, signIn, signOut } from './src/lib/auth'

async function testAuth() {
  const testEmail = `test-${Date.now()}@example.com`
  const testPassword = 'password123'

  console.log('Testing Supabase Auth...')
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('Supabase Anon Key present:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  // Sign up
  console.log(`Signing up with email: ${testEmail}`)
  const { data: signUpData, error: signUpError } = await signUp(testEmail, testPassword)
  if (signUpError) {
    console.error('Sign up error:', signUpError.message)
    return
  }
  console.log('Sign up successful:', signUpData.user?.email)

  // Sign in
  console.log('Signing in...')
  const { data: signInData, error: signInError } = await signIn(testEmail, testPassword)
  if (signInError) {
    console.error('Sign in error:', signInError.message)
    return
  }
  console.log('Sign in successful:', signInData.user?.email)

  // Sign out
  console.log('Signing out...')
  const { error: signOutError } = await signOut()
  if (signOutError) {
    console.error('Sign out error:', signOutError.message)
    return
  }
  console.log('Sign out successful')

  console.log('All auth tests passed!')
}

testAuth().catch(console.error)