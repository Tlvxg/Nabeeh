-- ============================================================================
-- Migration: Add preference columns to user_profiles
-- Purpose: email_alerts_enabled toggle + theme_preference (light/dark)
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'light'
    CHECK (theme_preference IN ('light', 'dark'));
