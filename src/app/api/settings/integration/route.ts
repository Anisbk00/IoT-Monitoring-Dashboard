import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/db';

/**
 * GET /api/settings/integration
 * Returns whether integration is configured (not the actual key).
 * The API key is never exposed to the client for security.
 */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.INTERNAL_API_KEY;
    return NextResponse.json({
      configured: !!apiKey,
      // Never expose the actual API key to the client
    });
  } catch (error) {
    console.error('Get integration settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
