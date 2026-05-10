import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Nabeeh] Build failed: Missing required environment variables.\n' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file.\n' +
    'See dashboard/.env.example for reference.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
