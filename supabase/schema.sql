-- =====================================================
-- IoT Monitor - Supabase Database Schema
-- Run this SQL in the Supabase SQL Editor
-- =====================================================

-- 1. Create profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'technician',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'technician'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Create devices table
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  secret TEXT NOT NULL,
  claimed BOOLEAN NOT NULL DEFAULT false,
  auto_registered BOOLEAN NOT NULL DEFAULT false,
  wifi_ssid TEXT,
  wifi_password TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by user_id
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON public.devices(device_id);

-- 3. Create sensor_data table
CREATE TABLE IF NOT EXISTS public.sensor_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
  temperature DOUBLE PRECISION NOT NULL,
  co2 INTEGER NOT NULL,
  humidity DOUBLE PRECISION,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by device_id and timestamp
CREATE INDEX IF NOT EXISTS idx_sensor_data_device_id ON public.sensor_data(device_id);
CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON public.sensor_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_data_device_timestamp ON public.sensor_data(device_id, timestamp DESC);

-- 4. Create alerts table
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_alerts_device_id ON public.alerts(device_id);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON public.alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON public.alerts(created_at DESC);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Devices: users can only manage their own devices
CREATE POLICY "Users can view own devices"
  ON public.devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view unclaimed devices"
  ON public.devices FOR SELECT
  USING (claimed = false);

CREATE POLICY "Users can insert own devices"
  ON public.devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can insert auto-registered devices"
  ON public.devices FOR INSERT
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Users can update own devices"
  ON public.devices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own devices"
  ON public.devices FOR DELETE
  USING (auth.uid() = user_id);

-- Sensor data: users can only see data from their devices
CREATE POLICY "Users can view own sensor data"
  ON public.sensor_data FOR SELECT
  USING (
    device_id IN (
      SELECT device_id FROM public.devices WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert sensor data for own devices"
  ON public.sensor_data FOR INSERT
  WITH CHECK (
    device_id IN (
      SELECT device_id FROM public.devices WHERE user_id = auth.uid()
    )
  );

-- Alerts: users can only see alerts from their devices
CREATE POLICY "Users can view own alerts"
  ON public.alerts FOR SELECT
  USING (
    device_id IN (
      SELECT device_id FROM public.devices WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own alerts"
  ON public.alerts FOR UPDATE
  USING (
    device_id IN (
      SELECT device_id FROM public.devices WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- Enable Realtime for sensor_data and alerts tables
-- =====================================================
-- Run this in Supabase Dashboard > Database > Replication
-- Or use the following SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE public.sensor_data;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;

-- =====================================================
-- Updated_at trigger function
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to profiles and devices
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_devices_updated_at ON public.devices;
CREATE TRIGGER update_devices_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
