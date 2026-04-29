-- =====================================================
-- Migration: 002_auto_register
-- Description: Support auto-registered devices without an owner
-- Date: 2026-03-05
-- =====================================================

-- Make user_id nullable so devices can exist without an owner
ALTER TABLE public.devices ALTER COLUMN user_id DROP NOT NULL;

-- Add claimed flag: false = device is unclaimed, true = device has an owner
ALTER TABLE public.devices ADD COLUMN claimed BOOLEAN NOT NULL DEFAULT false;

-- Add auto_registered flag: true = device registered itself automatically
ALTER TABLE public.devices ADD COLUMN auto_registered BOOLEAN NOT NULL DEFAULT false;

-- =====================================================
-- New RLS Policies
-- =====================================================

-- Allow all authenticated users to view unclaimed devices
CREATE POLICY "Authenticated users can view unclaimed devices"
  ON public.devices FOR SELECT
  USING (claimed = false);

-- Allow service role to insert devices without an owner (auto-registration)
CREATE POLICY "Service role can insert auto-registered devices"
  ON public.devices FOR INSERT
  WITH CHECK (user_id IS NULL);
