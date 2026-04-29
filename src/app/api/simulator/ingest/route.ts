import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy for simulator to ingest sensor data without exposing the internal API key to the client.
// The simulator panel (client) calls this route, which adds the API key server-side and forwards to the real ingest endpoint.

export async function POST(request: NextRequest) {
  const apiKey = process.env.INTERNAL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 503 });
  }

  const body = await request.json();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const response = await fetch(`${baseUrl}/api/data/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Failed to proxy ingest request' }, { status: 502 });
  }
}
