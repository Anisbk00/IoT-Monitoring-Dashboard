import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db';
import { z } from 'zod';

// Internal API for ingesting sensor data (called by MQTT broker bridge service)
// Data flow: ESP32 → MQTT Broker (port 1883) → Bridge → POST /api/data/ingest → Supabase

const ingestSchema = z.object({
  deviceId: z.string().min(1),
  temperature: z.number().finite(),
  co2: z.number().int().finite(),
  humidity: z.number().finite().nullable().optional(),
  timestamp: z.string().min(1).optional(),  // Accept any ISO datetime (ESP32 may send with or without offset)
});

export async function POST(request: NextRequest) {
  try {
    // Validate API key for internal service-to-service calls
    const apiKey = request.headers.get('X-API-Key');
    const expectedKey = process.env.INTERNAL_API_KEY;

    // Reject if API key env var is not configured
    if (!expectedKey) {
      console.error('INTERNAL_API_KEY env var is not set — rejecting all ingest requests');
      return NextResponse.json({ error: 'Service misconfigured' }, { status: 503 });
    }

    if (apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body with Zod
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
      .single();

    if (deviceError || !device) {
      // Auto-register: create device record so data isn't lost
      // Device will appear as "unclaimed" in the dashboard
      console.log(`[Ingest] Auto-registering new device: ${deviceId}`);
      const { data: newDevice, error: createError } = await supabase
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
        console.error('[Ingest] Auto-register failed:', createError);
        return NextResponse.json({ error: 'Device not found and auto-register failed' }, { status: 500 });
      }
      console.log(`[Ingest] ✓ Auto-registered device: ${deviceId}`);
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
      console.error('Insert sensor data error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Check for alert conditions and create alerts
    if (co2 > 1000) {
      const { error: alertError } = await supabase.from('alerts').insert({
        device_id: deviceId,
        type: 'co2_threshold',
        severity: co2 > 1100 ? 'critical' : 'warning',
        message: `CO2 level (${co2} ppm) exceeds threshold (1000 ppm)`,
      });

      if (alertError) {
        console.error('Create CO2 alert error:', alertError);
      }
    }

    if (temperature > 32) {
      const { error: alertError } = await supabase.from('alerts').insert({
        device_id: deviceId,
        type: 'temperature_threshold',
        severity: temperature > 34 ? 'critical' : 'warning',
        message: `Temperature (${temperature}°C) is too high`,
      });

      if (alertError) {
        console.error('Create temperature alert error:', alertError);
      }
    }

    // Update device status to online
    const { error: updateError } = await supabase
      .from('devices')
      .update({ status: 'online', updated_at: new Date().toISOString() })
      .eq('device_id', deviceId);

    if (updateError) {
      console.error('Update device status error:', updateError);
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
    console.error('Ingest data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
