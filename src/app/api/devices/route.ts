import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getDb();

    // Only fetch devices owned by the current user
    // Unclaimed devices are NOT shown in the main list —
    // they can only be claimed through the "Add Device" dialog
    const { data: myDevices, error: myError } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (myError) {
      console.error('Fetch user devices error:', myError);
      return NextResponse.json({ error: myError.message }, { status: 500 });
    }

    return NextResponse.json({
      devices: (myDevices || []).map((d) => ({
        id: d.id,
        deviceId: d.device_id,
        name: d.name,
        location: d.location,
        status: d.status,
        userId: d.user_id,
        claimed: d.claimed ?? true,
        autoRegistered: d.auto_registered ?? false,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get devices error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
