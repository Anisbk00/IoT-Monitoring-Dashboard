import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Get the authenticated user from the current request session.
 * Returns null if not authenticated.
 */
export async function getAuthUser() {
  try {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null
    return user
  } catch {
    return null
  }
}

/**
 * Get a Supabase client authenticated as the current user.
 * Respects RLS policies.
 */
export async function getDb() {
  return await createSupabaseClient()
}

/**
 * Get a Supabase admin client that bypasses RLS.
 * Use ONLY for internal/service operations (data ingestion, etc.)
 */
export function getAdminDb() {
  return createAdminClient()
}

// Re-export for convenience
export { createAdminClient }
