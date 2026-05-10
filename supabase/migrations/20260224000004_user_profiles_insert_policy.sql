-- ============================================================================
-- Migration: Add INSERT RLS policy for user_profiles
-- Purpose: Allow upsert operations from the frontend (upgrade, preferences)
-- ============================================================================

-- Users can insert their own profile (needed for upsert from client)
CREATE POLICY "Users can insert own profile"
    ON user_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
