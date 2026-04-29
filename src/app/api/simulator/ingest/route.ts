import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getAdminDb } from '@/lib/db';
import { z } from 'zod';

// Simulator ingest: authenticated users can send simulated sensor data
// Directly inserts into Supabase instead of proxying through HTTP (which breaks on serverless/Vercel)

const ingestSchema = z.object({
  deviceId: z.string().min(1),
  temperature: z.number().finite(),
  co2: z.number().int().finite(),
  humidity: z.number().finite().nullable().optional(),
  timestamp: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parseResult = ingestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { deviceId, temperature, co2, humidity, timestamp } = parseResult.data;
    const supabase = getAdminDb();

    // Verify device exists — auto-register if not found
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('device_id')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (deviceError) {
      console.error('[Sim-Ingest] Device lookup error:', deviceError);
      return NextResponse.json({ error: deviceError.message }, { status: 500 });
    }

    if (!device) {
      // Auto-register: create device record so data isn't lost
      console.log(`[Sim-Ingest] Auto-registering new device: ${deviceId}`);
      const { error: createError } = await supabase
        .from('devices')
        .insert({
          device_id: deviceId,
          secret: 'auto-registered',
          name: deviceId,
          status: 'online',
          claimed: false,
          auto_registered: true,
          user_id: null,
        })
        .select('device_id')
        .single();

      if (createError) {
        console.error('[Sim-Ingest] Auto-register failed:', createError);
        return NextResponse.json({ error: 'Device not found and auto-register failed' }, { status: 500 });
      }
    }

    // Store sensor data
    const { data: sensorData, error: insertError } = await supabase
      .from('sensor_data')
      .insert({
        device_id: deviceId,
        temperature,
        co2,
        humidity: humidity ?? null,
        timestamp: timestamp || new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Sim-Ingest] Insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Check for alert conditions
    if (co2 > 1000) {
      const { error: alertError } = await supabase.from('alerts').insert({
        device_id: deviceId,
        type: 'co2_threshold',
        severity: co2 > 1100 ? 'critical' : 'warning',
        message: `CO2 level (${co2} ppm) exceeds threshold (1000 ppm)`,
      });
      if (alertError) console.error('[Sim-Ingest] CO2 alert error:', alertError);
    }

    if (temperature > 32) {
      const { error: alertError } = await supabase.from('alerts').insert({
        device_id: deviceId,
        type: 'temperature_threshold',
        severity: temperature > 34 ? 'critical' : 'warning',
        message: `Temperature (${temperature}°C) is too high`,
      });
      if (alertError) console.error('[Sim-Ingest] Temp alert error:', alertError);
    }

    // Update device status to online
    const { error: updateError } = await supabase
      .from('devices')
      .update({ status: 'online', updated_at: new Date().toISOString() })
      .eq('device_id', deviceId);

    if (updateError) {
      console.error('[Sim-Ingest] Update status error:', updateError);
    }

    return NextResponse.json(
      {
        id: sensorData.id,
        deviceId: sensorData.device_id,
        timestamp: sensorData.timestamp,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Sim-Ingest] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
