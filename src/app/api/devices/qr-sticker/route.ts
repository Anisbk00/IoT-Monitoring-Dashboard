import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    const supabase = await getDb();

    // Get device with secret
    const { data: device, error } = await supabase
      .from('devices')
      .select('device_id, secret, name')
      .eq('device_id', deviceId)
      .eq('user_id', user.id)
      .single();

    if (error || !device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Generate QR payload for the physical device sticker
    // This is what gets printed on the device enclosure
    const qrPayload = {
      type: 'iot-device',
      deviceId: device.device_id,
      secret: device.secret,
      apSsid: `IoT-${device.device_id}`,
    };

    return NextResponse.json({
      qrPayload,
      apSsid: `IoT-${device.device_id}`,
      instructions: [
        `1. Print a QR code containing the JSON below`,
        `2. Stick it on the device enclosure`,
        `3. To add device: scan QR in dashboard -> fill WiFi/MQTT info -> register`,
        `4. ESP32 starts in AP mode (WiFi: IoT-${device.device_id}) for auto-config`,
      ],
    });
  } catch (error) {
    console.error('QR sticker error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
