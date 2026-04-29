import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getDb } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ device: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device: deviceId } = await params;
    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get('limit') || '100', 10);
    const limit = isNaN(limitParam) ? 100 : limitParam;

    const supabase = await getDb();

    // Verify the device belongs to the user
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id')
      .eq('device_id', deviceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (deviceError) {
      console.error('Fetch device error:', deviceError);
      return NextResponse.json({ error: 'Device lookup failed' }, { status: 500 });
    }

    if (!device) {
      // Device not found or doesn't belong to this user
      // Return empty data instead of 404 to avoid console errors
      return NextResponse.json({ data: [] });
    }

    // Query sensor data with limit and ordering
    const { data: sensorData, error } = await supabase
      .from('sensor_data')
      .select('*')
      .eq('device_id', deviceId)
      .order('timestamp', { ascending: false })
      .limit(Math.min(limit, 1000));

    if (error) {
      console.error('Fetch sensor data error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: (sensorData || []).map((d) => ({
        id: d.id,
        deviceId: d.device_id,
        temperature: d.temperature,
        co2: d.co2,
        humidity: d.humidity,
        timestamp: d.timestamp,
      })),
    });
  } catch (error) {
    console.error('Get device data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
