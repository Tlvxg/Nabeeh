-- AI-generated risk notes (NabeehNotes) + email alert deduplication / threading.
--
-- risk_notes is append-only (history kept) so the dashboard can show the
-- AI narrative tied to a specific risk_metrics snapshot, even after
-- risk_metrics rows are pruned (we only keep the latest 2 per stock).
--
-- sent_alerts records every email Resend successfully accepted, so subsequent
-- alerts for the same (user, symbol) can set RFC-5322 In-Reply-To / References
-- headers and Gmail/Apple-Mail collapses them into a single thread instead of
-- piling up old notifications.

CREATE TABLE IF NOT EXISTS risk_notes (
  id              BIGSERIAL PRIMARY KEY,
  stock_id        BIGINT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overall_score   NUMERIC(6,2) NOT NULL,
  prev_score      NUMERIC(6,2),
  headline_ar     TEXT NOT NULL,
  paragraphs_ar   JSONB NOT NULL,        -- string[]
  watch_points_ar JSONB NOT NULL,        -- string[]
  source          TEXT NOT NULL CHECK (source IN ('ai','fallback')),
  model_used      TEXT,
  raw_input       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_notes_stock_recent
  ON risk_notes (stock_id, computed_at DESC);

ALTER TABLE risk_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risk_notes public read"
  ON risk_notes FOR SELECT
  USING (true);


CREATE TABLE IF NOT EXISTS sent_alerts (
  id                     BIGSERIAL PRIMARY KEY,
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_id               BIGINT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  symbol                 TEXT NOT NULL,
  risk_note_id           BIGINT REFERENCES risk_notes(id) ON DELETE SET NULL,
  message_id             TEXT NOT NULL,
  resend_email_id        TEXT,
  thread_root_message_id TEXT NOT NULL,
  score_at_send          NUMERIC(6,2) NOT NULL,
  prev_score_at_send     NUMERIC(6,2),
  sent_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sent_alerts_user_symbol
  ON sent_alerts (user_id, symbol, sent_at DESC);

ALTER TABLE sent_alerts ENABLE ROW LEVEL SECURITY;
-- No policies: only service-role writes/reads via backend pipeline.
