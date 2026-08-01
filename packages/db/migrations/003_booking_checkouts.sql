CREATE TABLE IF NOT EXISTS booking_checkouts (
  booking_id uuid PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('prepared', 'awaiting_user_action', 'confirmed', 'failed')),
  external_reference text,
  final_price jsonb,
  seats jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_action text,
  handoff_url text,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
