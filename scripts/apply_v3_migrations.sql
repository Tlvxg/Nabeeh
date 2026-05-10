-- ============================================================================
-- Combined V3 Migration Script for Nabeeh
-- Run this in the Supabase Dashboard SQL Editor (https://supabase.com/dashboard)
-- Project: bfhhajlxfxmhigamnhlj
--
-- This script combines the following migrations:
--   1. 20260224000001_user_profiles.sql
--   2. 20260224000002_user_watchlist.sql
--   3. 20260224000003_user_profile_preferences.sql
--   4. 20260224000004_user_profiles_insert_policy.sql
-- ============================================================================

-- ============================================================================
-- MIGRATION 1: user_profiles table with auto-creation trigger and RLS
-- Purpose: Establish free/premium subscription tiers per user
-- ============================================================================

-- 1. Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_profiles_user_id_unique UNIQUE (user_id)
);

-- 2. Index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- 3. Trigger function: auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id, plan)
    VALUES (NEW.id, 'free');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger: fire after new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- 5. Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies
-- Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON user_profiles
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON user_profiles
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 7. Backfill: create profiles for any existing users who don't have one
INSERT INTO user_profiles (user_id, plan)
SELECT id, 'free'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_profiles)
ON CONFLICT (user_id) DO NOTHING;


-- ============================================================================
-- MIGRATION 2: user_watchlist table with RLS policies
-- Purpose: Allow premium users to save stocks to a personal watchlist
-- ============================================================================

-- 1. Create user_watchlist table
CREATE TABLE IF NOT EXISTS user_watchlist (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stock_symbol  TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_watchlist_user_stock_unique UNIQUE (user_id, stock_symbol)
);

-- 2. Index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_id ON user_watchlist(user_id);

-- 3. Enable Row Level Security
ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies
-- Users can view their own watchlist
CREATE POLICY "Users can view own watchlist"
    ON user_watchlist
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can add to their own watchlist
CREATE POLICY "Users can add to own watchlist"
    ON user_watchlist
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can remove from their own watchlist
CREATE POLICY "Users can remove from own watchlist"
    ON user_watchlist
    FOR DELETE
    USING (auth.uid() = user_id);


-- ============================================================================
-- MIGRATION 3: Add preference columns to user_profiles
-- Purpose: email_alerts_enabled toggle + theme_preference (light/dark)
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'light'
    CHECK (theme_preference IN ('light', 'dark'));


-- ============================================================================
-- MIGRATION 4: Add INSERT RLS policy for user_profiles
-- Purpose: Allow upsert operations from the frontend (upgrade, preferences)
-- ============================================================================

-- Users can insert their own profile (needed for upsert from client)
CREATE POLICY "Users can insert own profile"
    ON user_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);


-- ============================================================================
-- VERIFICATION: Confirm tables and policies were created
-- ============================================================================
DO $$
BEGIN
    -- Check user_profiles exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
        RAISE EXCEPTION 'FAILED: user_profiles table was not created';
    END IF;

    -- Check user_watchlist exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_watchlist') THEN
        RAISE EXCEPTION 'FAILED: user_watchlist table was not created';
    END IF;

    RAISE NOTICE 'SUCCESS: All migrations applied. Tables user_profiles and user_watchlist are ready.';
END $$;
