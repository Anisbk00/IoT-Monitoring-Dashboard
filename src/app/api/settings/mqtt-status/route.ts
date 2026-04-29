import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/db';

/**
 * GET /api/settings/mqtt-status
 * Checks if the MQTT broker service is running.
 * Returns 200 with offline status (not 503) when broker is unavailable,
 * so the frontend can handle it gracefully without console errors.
 * Requires authentication.
 */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const brokerUrl = process.env.MQTT_BROKER_URL || 'http://localhost:3003/health';

    const response = await fetch(brokerUrl, {
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        status: 'ok',
        broker: data.broker || 'running',
        connectedDevices: data.connectedDevices ?? 0,
        tcpPort: data.tcpPort ?? 1883,
        wsPort: data.wsPort ?? 3003,
      });
    }

    // Return 200 with offline status instead of 503
    return NextResponse.json({
      status: 'offline',
      broker: 'unhealthy',
      connectedDevices: 0,
      tcpPort: 1883,
      wsPort: 3003,
    });
  } catch {
    // Broker not reachable - return 200 with offline status instead of 503
    return NextResponse.json({
      status: 'offline',
      broker: 'not_running',
      connectedDevices: 0,
      tcpPort: 1883,
      wsPort: 3003,
    });
  }
}
