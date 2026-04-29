import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getAdminDb } from '@/lib/db';
import { z } from 'zod';

// Simulator auto-register: authenticated users can register simulated devices
// Directly inserts into Supabase instead of proxying through HTTP (which breaks on serverless/Vercel)

const autoRegisterSchema = z.object({
  deviceId: z.string().min(1),
  secret: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
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
      .maybeSingle();

    if (checkError) {
      console.error('[Sim-AutoReg] Check error:', checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    if (existingDevice) {
      // Update secret if it was auto-registered without a real one
      if (!existingDevice.claimed && existingDevice.secret === 'auto-registered') {
        const { error: updateError } = await supabase
          .from('devices')
          .update({ secret, status: 'online', updated_at: new Date().toISOString() })
          .eq('device_id', deviceId);
        if (updateError) console.error('[Sim-AutoReg] Update secret error:', updateError);
      } else {
        // Just update status to online
        const { error: updateError } = await supabase
          .from('devices')
          .update({ status: 'online', updated_at: new Date().toISOString() })
          .eq('device_id', deviceId);
        if (updateError) console.error('[Sim-AutoReg] Update status error:', updateError);
      }
      return NextResponse.json({ action: 'updated', deviceId }, { status: 200 });
    }

    // Create new device as unclaimed (simulator devices need to be claimed later)
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
      console.error('[Sim-AutoReg] Create error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[Sim-AutoReg] ✓ New device: ${deviceId}`);
    return NextResponse.json({ action: 'created', deviceId: device.device_id }, { status: 201 });
  } catch (error) {
    console.error('[Sim-AutoReg] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
