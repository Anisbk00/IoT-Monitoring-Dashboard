import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const startedAt = Date.now();
  const health: {
    status: 'ok' | 'degraded' | 'error';
    timestamp: string;
    uptime: number;
    supabase: 'connected' | 'unreachable' | 'misconfigured';
    responseTimeMs: number;
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    supabase: 'connected',
    responseTimeMs: 0,
  };

  // Test Supabase connectivity
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      health.supabase = 'misconfigured';
      health.status = 'degraded';
    }
  } catch {
    health.supabase = 'unreachable';
    health.status = 'error';
  }

  health.responseTimeMs = Date.now() - startedAt;

  const statusCode = health.status === 'error' ? 503 : health.status === 'degraded' ? 200 : 200;
  return NextResponse.json(health, { status: statusCode });
}