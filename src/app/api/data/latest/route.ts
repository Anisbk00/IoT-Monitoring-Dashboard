import { NextResponse } from 'next/server';
import { getAuthUser, getDb } from '@/lib/db';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getDb();

    // Get all user's devices
    const { data: devices, error: devicesError } = await supabase
      .from('devices')
      .select('device_id')
      .eq('user_id', user.id);

    if (devicesError) {
      console.error('Fetch devices error:', devicesError);
      return NextResponse.json({ error: devicesError.message }, { status: 500 });
    }

    // Get latest reading for each device
    const readings: Record<string, {
      id: string;
      deviceId: string;
      temperature: number;
      co2: number;
      humidity: number | null;
      timestamp: string;
    }> = {};

    // Use Promise.all for parallel queries to avoid N+1 latency
    const results = await Promise.all(
      (devices || []).map(async (device) => {
        const { data: latestReading, error: readingError } = await supabase
          .from('sensor_data')
          .select('*')
          .eq('device_id', device.device_id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();

        if (readingError && readingError.code !== 'PGRST116') {
          console.error(`Fetch latest reading for ${device.device_id} error:`, readingError);
          return null;
        }

        if (latestReading) {
          return {
            deviceId: device.device_id,
            reading: {
              id: latestReading.id,
              deviceId: latestReading.device_id,
              temperature: latestReading.temperature,
              co2: latestReading.co2,
              humidity: latestReading.humidity ?? null,
              timestamp: latestReading.timestamp,
            },
          };
        }
        return null;
      })
    );

    for (const result of results) {
      if (result) {
        readings[result.deviceId] = result.reading;
      }
    }

    return NextResponse.json({ readings });
  } catch (error) {
    console.error('Get latest data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
