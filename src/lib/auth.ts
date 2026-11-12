import { createClient as createBrowserClient } from '../utils/supabase/client'

export const signUp = async (email: string, password: string) => {
  const supabase = createBrowserClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })
  return { data, error }
}

export const signIn = async (email: string, password: string) => {
  const supabase = createBrowserClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

export const signOut = async () => {
  const supabase = createBrowserClient()
  const { error } = await supabase.auth.signOut()
  return { error }
}