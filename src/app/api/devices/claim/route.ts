import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getDb } from '@/lib/db';
import { z } from 'zod';

// Claim an auto-registered device (link it to a user account)
// The user must provide the deviceId and secret to claim the device

const claimSchema = z.object({
  deviceId: z.string().min(1),
  secret: z.string().min(1),
  name: z.string().min(1),
  location: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parseResult = claimSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { deviceId, secret, name, location } = parseResult.data;
    const supabase = await getDb();

    // Find the device
    const { data: device, error: findError } = await supabase
      .from('devices')
      .select('id, device_id, secret, claimed, user_id')
      .eq('device_id', deviceId)
      .single();

    if (findError || !device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // If already claimed by someone else
    if (device.claimed && device.user_id && device.user_id !== user.id) {
      return NextResponse.json({ error: 'Device already claimed by another user' }, { status: 409 });
    }

    // If already claimed by this user
    if (device.claimed && device.user_id === user.id) {
      return NextResponse.json({ error: 'You already own this device' }, { status: 409 });
    }

    // Verify the secret (allows claiming)
    // If secret is 'auto-registered' (from ingest fallback), allow claiming without matching
    // If secret is a real secret, it must match
    if (device.secret !== 'auto-registered' && device.secret !== secret) {
      return NextResponse.json({ error: 'Invalid device secret' }, { status: 403 });
    }

    // Claim the device
    const { data: updatedDevice, error: updateError } = await supabase
      .from('devices')
      .update({
        user_id: user.id,
        name,
        location: location || null,
        claimed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('device_id', deviceId)
      .select()
      .single();

    if (updateError) {
      console.error('[Claim] Error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log(`[Claim] ✓ Device ${deviceId} claimed by ${user.email}`);

    return NextResponse.json({
      device: {
        id: updatedDevice.id,
        deviceId: updatedDevice.device_id,
        name: updatedDevice.name,
        location: updatedDevice.location,
        status: updatedDevice.status,
        claimed: updatedDevice.claimed,
        userId: updatedDevice.user_id,
        createdAt: updatedDevice.created_at,
        updatedAt: updatedDevice.updated_at,
      },
    }, { status: 200 });
  } catch (error) {
    console.error('[Claim] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
