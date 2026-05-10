-- ============================================================================
-- Migration: user_watchlist table with RLS policies
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
