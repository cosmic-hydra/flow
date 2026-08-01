CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS api_tokens_user_id_idx ON api_tokens(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
  ON conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content text NOT NULL,
  tool_name text,
  tool_call_id text,
  client_message_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON messages(conversation_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS messages_client_id_idx
  ON messages(conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN (
    'draft', 'scheduled', 'searching', 'options_ready', 'awaiting_approval',
    'approved', 'executing', 'awaiting_user_action', 'booked', 'failed',
    'cancelled', 'expired'
  )),
  intent jsonb NOT NULL,
  automation jsonb NOT NULL,
  selected_offer_id uuid,
  failure_code text,
  failure_message text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_user_updated_idx ON bookings(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);

CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  provider_name text NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  url text,
  start_at timestamptz,
  end_at timestamptz,
  base_price jsonb NOT NULL,
  fees jsonb NOT NULL,
  taxes jsonb NOT NULL,
  savings jsonb NOT NULL,
  final_price jsonb NOT NULL,
  refundable boolean,
  availability integer,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  deals jsonb NOT NULL DEFAULT '[]'::jsonb,
  score double precision NOT NULL DEFAULT 0,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, provider_id, external_id)
);

CREATE INDEX IF NOT EXISTS offers_booking_score_idx ON offers(booking_id, score DESC);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  provider_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'consumed', 'revoked', 'expired')),
  max_charge jsonb NOT NULL,
  offer_fingerprint char(64) NOT NULL,
  valid_until timestamptz NOT NULL,
  execute_not_before timestamptz,
  execute_not_after timestamptz,
  allow_lower_priced_equivalent boolean NOT NULL,
  confirmation_text text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS approvals_booking_status_idx ON approvals(booking_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_approval_per_booking_idx
  ON approvals(booking_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('research_booking', 'refresh_offers', 'execute_booking')),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'leased', 'succeeded', 'failed', 'cancelled')),
  run_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  lease_owner text,
  lease_until timestamptz,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(status, run_at, lease_until);
CREATE INDEX IF NOT EXISTS jobs_booking_idx ON jobs(booking_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency_idx
  ON jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS provider_attempts (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  provider_id text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'denied')),
  coupon_code_hash text,
  request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS provider_attempts_booking_idx
  ON provider_attempts(booking_id, started_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'agent', 'worker', 'provider', 'system')),
  actor_id text NOT NULL,
  action text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_user_created_idx
  ON audit_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_booking_created_idx
  ON audit_events(booking_id, created_at DESC);

