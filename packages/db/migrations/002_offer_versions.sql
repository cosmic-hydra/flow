ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS offers_booking_current_score_idx
  ON offers(booking_id, is_current, score DESC);
