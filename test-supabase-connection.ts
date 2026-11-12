import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function testConnection() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  console.log('Testing Supabase connection with service role key...')
  console.log('URL:', supabaseUrl)

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Test auth admin list users (requires service role key)
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) {
    console.error('Supabase connection error:', error.message)
    process.exit(1)
  }
  console.log('Connected successfully!')
  console.log('Total users:', data.users.length)
}

testConnection().catch(console.error)