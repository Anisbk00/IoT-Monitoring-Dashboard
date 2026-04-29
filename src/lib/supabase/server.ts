import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { CookieOptions } from '@supabase/ssr'

function validateEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    validateEnv('NEXT_PUBLIC_SUPABASE_URL'),
    validateEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // The `set` method was called from a Server Component.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Same as above
          }
        },
      },
    }
  )
}

/**
 * Create a Supabase admin client with service_role key (bypasses RLS).
 * Use ONLY for internal operations (data ingestion, system tasks).
 */
export function createAdminClient() {
  return createServerClient(
    validateEnv('NEXT_PUBLIC_SUPABASE_URL'),
    validateEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      cookies: {
        get() { return undefined },
        set() {},
        remove() {},
      },
    }
  )
}
