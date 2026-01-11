import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    // We don't throw error to prevent build crash during development if envs are missing
    console.warn('Missing Supabase Environment Variables')
}

// Prevent build crash if env vars are missing
const url = supabaseUrl || 'https://placeholder.supabase.co'
const key = supabaseAnonKey || 'placeholder'

export const supabase = createClient(url, key)
