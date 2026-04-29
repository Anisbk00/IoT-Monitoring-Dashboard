import { NextRequest, NextResponse } from 'next/server';
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

    const deviceIds = (devices || []).map((d) => d.device_id);

    if (deviceIds.length === 0) {
      return NextResponse.json({ alerts: [] });
    }

    // Get alerts for user's devices
    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*')
      .in('device_id', deviceIds)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Fetch alerts error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      alerts: (alerts || []).map((a) => ({
        id: a.id,
        deviceId: a.device_id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        acknowledged: a.acknowledged,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { alertId } = await request.json();

    if (!alertId) {
      return NextResponse.json(
        { error: 'Alert ID is required' },
        { status: 400 }
      );
    }

    const supabase = await getDb();

    // Get user's device IDs to verify the alert belongs to the user
    const { data: devices, error: devicesError } = await supabase
      .from('devices')
      .select('device_id')
      .eq('user_id', user.id);

    if (devicesError) {
      console.error('Fetch devices error:', devicesError);
      return NextResponse.json({ error: devicesError.message }, { status: 500 });
    }

    const deviceIds = (devices || []).map((d) => d.device_id);

    // First verify the alert belongs to one of the user's devices
    const { data: alert, error: alertError } = await supabase
      .from('alerts')
      .select('id, device_id')
      .eq('id', alertId)
      .single();

    if (alertError || !alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    if (!deviceIds.includes(alert.device_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Acknowledge the alert
    const { error: updateError } = await supabase
      .from('alerts')
      .update({ acknowledged: true })
      .eq('id', alertId);

    if (updateError) {
      console.error('Acknowledge alert error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Acknowledge alert error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
