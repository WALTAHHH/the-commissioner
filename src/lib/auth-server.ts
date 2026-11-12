import { createClient as createServerClient } from '../utils/supabase/server'

export const getSession = async () => {
  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.getSession()
  return { data, error }
}

export const getUser = async () => {
  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.getUser()
  return { data, error }
}