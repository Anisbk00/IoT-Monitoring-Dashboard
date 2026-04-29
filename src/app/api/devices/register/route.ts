import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { deviceId, secret, name, location, wifiSsid, wifiPassword } = await request.json();

    if (!deviceId || !secret || !name) {
      return NextResponse.json(
        { error: 'Device ID, secret, and name are required' },
        { status: 400 }
      );
    }

    const supabase = await getDb();

    // Check if device already exists
    const { data: existingDevice, error: checkError } = await supabase
      .from('devices')
      .select('id, device_id, secret, user_id, claimed')
      .eq('device_id', deviceId)
      .single();

    // If device exists
    if (existingDevice) {
      const isUnclaimed = !existingDevice.claimed || existingDevice.user_id === null;

      if (isUnclaimed) {
        // Auto-registered device — verify secret and claim it
        if (existingDevice.secret !== 'auto-registered' && existingDevice.secret !== secret) {
          return NextResponse.json(
            { error: 'Device exists but secret does not match' },
            { status: 403 }
          );
        }

        // Claim the device by transferring ownership
        const updateData: Record<string, unknown> = {
          user_id: user.id,
          name,
          location: location || null,
          wifi_ssid: wifiSsid || null,
          wifi_password: wifiPassword || null,
          claimed: true,
          updated_at: new Date().toISOString(),
        };

        const { data: updatedDevice, error: updateError } = await supabase
          .from('devices')
          .update(updateData)
          .eq('device_id', deviceId)
          .select()
          .single();

        if (updateError) {
          console.error('Claim auto-registered device error:', updateError);
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        console.log(`[Register] Claimed auto-registered device: ${deviceId}`);
        return NextResponse.json(
          {
            device: {
              id: updatedDevice.id,
              deviceId: updatedDevice.device_id,
              name: updatedDevice.name,
              location: updatedDevice.location,
              status: updatedDevice.status,
              userId: updatedDevice.user_id,
              wifiSsid: updatedDevice.wifi_ssid,
              createdAt: updatedDevice.created_at,
              updatedAt: updatedDevice.updated_at,
            },
            action: 'claimed',
          },
          { status: 200 }
        );
      }

      // Device already claimed by someone
      if (existingDevice.user_id === user.id) {
        return NextResponse.json(
          { error: 'You already own this device' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Device ID already registered' },
        { status: 409 }
      );
    }

    // Ignore "no rows returned" error from .single() - that's expected when device doesn't exist
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Device check error:', checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    // Insert new device with WiFi credentials
    const insertData: Record<string, unknown> = {
      device_id: deviceId,
      secret,
      name,
      location: location || null,
      wifi_ssid: wifiSsid || null,
      wifi_password: wifiPassword || null,
      status: 'offline',
      claimed: true,
      auto_registered: false,
      user_id: user.id,
    };

    const { data: device, error } = await supabase
      .from('devices')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Create device error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        device: {
          id: device.id,
          deviceId: device.device_id,
          name: device.name,
          location: device.location,
          status: device.status,
          userId: device.user_id,
          wifiSsid: device.wifi_ssid,
          createdAt: device.created_at,
          updatedAt: device.updated_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Register device error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
