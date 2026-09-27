import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

// Server-only: the secret key bypasses RLS. Never import this from a client component.
export function db() {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY belum diset')
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

// Unwrap a Supabase response. Lists are never null on success; maybeSingle() may be (callers type it `| null`).
export function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}
