import { NextResponse } from 'next/server';

/**
 * One-time migration endpoint: adds `claimed` and `auto_registered` columns
 * to the devices table and makes `user_id` nullable.
 *
 * Uses the `pg` library with the SUPABASE_DB_URL env var (PostgreSQL connection string).
 * Call once after setting the env var, e.g.:
 *   curl -X POST http://localhost:3000/api/migrate
 *
 * After running successfully this endpoint returns 200 and can be safely removed.
 */

export async function POST() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    return NextResponse.json(
      {
        error:
          'SUPABASE_DB_URL env var is not set. Set it to the PostgreSQL connection string, e.g. postgresql://postgres.{ref}:{password}@aws-0-{region}.pooler.supabase.com:6543/postgres',
      },
      { status: 503 }
    );
  }

  try {
    // Dynamic import so `pg` is only loaded when this endpoint is actually called
    const { Client } = await import('pg');

    const client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();

    await client.query(`
      -- Make user_id nullable so devices can exist without an owner
      ALTER TABLE public.devices ALTER COLUMN user_id DROP NOT NULL;

      -- Add claimed flag: false = device is unclaimed, true = device has an owner
      ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS claimed BOOLEAN NOT NULL DEFAULT false;

      -- Add auto_registered flag: true = device registered itself automatically
      ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS auto_registered BOOLEAN NOT NULL DEFAULT false;

      -- Set claimed=true for all existing devices that already have an owner
      UPDATE public.devices SET claimed = true WHERE user_id IS NOT NULL;
    `);

    await client.end();

    return NextResponse.json({ success: true, message: 'Migration 002_auto_register applied successfully' });
  } catch (error) {
    console.error('Migration error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
