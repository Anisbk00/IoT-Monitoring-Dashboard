import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db';
import { z } from 'zod';

// Internal API for auto-registering devices (called by MQTT broker when ESP32 sends registration)
// Data flow: ESP32 → MQTT topic devices/{id}/register → MQTT broker → POST /api/devices/auto-register → Supabase

const autoRegisterSchema = z.object({
  deviceId: z.string().min(1),
  secret: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    // Validate API key for internal service-to-service calls
    const apiKey = request.headers.get('X-API-Key');
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey) {
      console.error('INTERNAL_API_KEY env var is not set — rejecting auto-register requests');
      return NextResponse.json({ error: 'Service misconfigured' }, { status: 503 });
    }

    if (apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parseResult = autoRegisterSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { deviceId, secret } = parseResult.data;
    const supabase = getAdminDb();

    // Check if device already exists
    const { data: existingDevice, error: checkError } = await supabase
      .from('devices')
      .select('id, device_id, claimed, secret')
      .eq('device_id', deviceId)
      .single();

    if (existingDevice) {
      // Device exists — update the secret if it was auto-registered without a real secret
      if (!existingDevice.claimed && existingDevice.secret === 'auto-registered') {
        const { error: updateError } = await supabase
          .from('devices')
          .update({ secret, status: 'online', updated_at: new Date().toISOString() })
          .eq('device_id', deviceId);
        if (updateError) console.error('[Auto-Register] Update secret error:', updateError);
        else console.log(`[Auto-Register] Updated secret for: ${deviceId}`);
      } else {
        // Just update status to online
        const { error: updateError } = await supabase
          .from('devices')
          .update({ status: 'online', updated_at: new Date().toISOString() })
          .eq('device_id', deviceId);
        if (updateError) console.error('[Auto-Register] Update status error:', updateError);
      }
      return NextResponse.json({ action: 'updated', deviceId }, { status: 200 });
    }

    // Auto-register new device (unclaimed, no owner)
    const { data: device, error } = await supabase
      .from('devices')
      .insert({
        device_id: deviceId,
        secret,
        name: deviceId,
        status: 'online',
        claimed: false,
        auto_registered: true,
        user_id: null,
      })
      .select()
      .single();

    if (error) {
      console.error('[Auto-Register] Create device error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[Auto-Register] ✓ New device: ${deviceId}`);
    return NextResponse.json({ action: 'created', deviceId: device.device_id }, { status: 201 });
  } catch (error) {
    console.error('[Auto-Register] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
