import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Paths that don't need session refresh
const SKIP_SESSION_PATHS = [
  '/api/data/ingest',
  '/api/auth/login',
  '/api/auth/register',
]

export async function updateSession(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  // Skip Supabase session refresh for certain paths to reduce latency
  const pathname = request.nextUrl.pathname
  if (SKIP_SESSION_PATHS.some(path => pathname.startsWith(path))) {
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || ''),
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Refresh the session
    await supabase.auth.getUser()
  } catch (error) {
    // If Supabase session refresh fails, continue without session
    console.error('Middleware session refresh error:', error)
  }

  return supabaseResponse
}
