CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('USER', 'ADMIN')),
  membership_status text NOT NULL CHECK (membership_status IN ('TRIAL', 'ACTIVE', 'EXPIRED')),
  membership_expires_at timestamptz,
  trial_approved boolean NOT NULL DEFAULT false,
  trial_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_credentials_username_idx ON admin_credentials(lower(username));

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  marketplace text NOT NULL DEFAULT 'amazon.com' CHECK (marketplace IN ('amazon.com','amazon.ca','amazon.com.mx')),
  zip_code varchar(10),
  scan_depth smallint NOT NULL CHECK (scan_depth BETWEEN 1 AND 3),
  ranking_policy text NOT NULL DEFAULT 'organic-row-after-sponsored-exclusion',
  dimensions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ALTER COLUMN zip_code TYPE varchar(10) USING trim(zip_code);
ALTER TABLE projects ALTER COLUMN zip_code DROP NOT NULL;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_zip_code_check;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_marketplace_check;
ALTER TABLE projects ADD CONSTRAINT projects_marketplace_check CHECK (marketplace IN ('amazon.com','amazon.ca','amazon.com.mx'));

CREATE TABLE IF NOT EXISTS monitor_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  enabled boolean NOT NULL DEFAULT true,
  category text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('OWN', 'COMPETITOR')),
  child_asin char(10) NOT NULL CHECK (child_asin ~ '^[A-Z0-9]{10}$'),
  parent_asin char(10) CHECK (parent_asin IS NULL OR parent_asin ~ '^[A-Z0-9]{10}$'),
  product_name text NOT NULL,
  keyword text NOT NULL,
  normalized_keyword text NOT NULL,
  same_parent_match boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, child_asin, normalized_keyword)
);

CREATE TABLE IF NOT EXISTS rate_configs (
  version text PRIMARY KEY,
  search_page_points integer NOT NULL CHECK (search_page_points >= 0),
  detail_page_points integer NOT NULL CHECK (detail_page_points >= 0),
  rating_subject_points integer NOT NULL CHECK (rating_subject_points >= 0),
  effective_at timestamptz NOT NULL,
  created_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  available_points bigint NOT NULL DEFAULT 0 CHECK (available_points >= 0),
  frozen_points bigint NOT NULL DEFAULT 0 CHECK (frozen_points >= 0),
  consumed_points bigint NOT NULL DEFAULT 0 CHECK (consumed_points >= 0),
  refunded_points bigint NOT NULL DEFAULT 0 CHECK (refunded_points >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS membership_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  source text NOT NULL,
  source_ref text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);

CREATE TABLE IF NOT EXISTS quota_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('TRIAL','PACKAGE','PURCHASE','ADMIN')),
  granted_amount bigint NOT NULL CHECK (granted_amount > 0),
  available_amount bigint NOT NULL CHECK (available_amount >= 0),
  frozen_amount bigint NOT NULL DEFAULT 0 CHECK (frozen_amount >= 0),
  consumed_amount bigint NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0),
  expires_at timestamptz,
  source_ref text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_amount + frozen_amount + consumed_amount <= granted_amount)
);

-- Preserve existing wallet balances when upgrading from v0.1.0. The source
-- reference is per user so rerunning this migration remains idempotent.
INSERT INTO quota_lots(user_id, kind, granted_amount, available_amount, source_ref)
SELECT w.user_id, 'ADMIN', w.available_points, w.available_points, 'migration:wallet-balance:' || w.user_id::text
FROM wallets w
WHERE w.available_points > 0
  AND NOT EXISTS (SELECT 1 FROM quota_lots q WHERE q.user_id = w.user_id)
ON CONFLICT (source_ref) DO NOTHING;

CREATE TABLE IF NOT EXISTS monitor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','PARTIAL','COMPLETED','INCOMPLETE','CANCELLED')),
  progress jsonb NOT NULL,
  estimated_points integer NOT NULL,
  frozen_points integer NOT NULL,
  consumed_points integer NOT NULL DEFAULT 0,
  refunded_points integer NOT NULL DEFAULT 0,
  receipt jsonb NOT NULL,
  error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  effective_date date NOT NULL,
  effective boolean NOT NULL DEFAULT false,
  cancel_requested boolean NOT NULL DEFAULT false,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE monitor_runs ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false;
ALTER TABLE monitor_runs ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS quota_reservations (
  run_id uuid NOT NULL REFERENCES monitor_runs(id) ON DELETE CASCADE,
  quota_lot_id uuid NOT NULL REFERENCES quota_lots(id),
  reserved_amount bigint NOT NULL CHECK (reserved_amount > 0),
  consumed_amount bigint NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0),
  refunded_amount bigint NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  settled_at timestamptz,
  PRIMARY KEY (run_id, quota_lot_id),
  CHECK (consumed_amount + refunded_amount <= reserved_amount)
);

CREATE TABLE IF NOT EXISTS run_outbox (
  run_id uuid PRIMARY KEY REFERENCES monitor_runs(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  delivered_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rank_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES monitor_runs(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  monitor_item_id uuid NOT NULL REFERENCES monitor_items(id),
  state text NOT NULL CHECK (state IN ('COMPLETED','NOT_FOUND','INCOMPLETE')),
  child_asin char(10) NOT NULL,
  displayed_asin char(10),
  keyword text NOT NULL,
  natural_page smallint,
  natural_row integer,
  natural_column integer,
  natural_ordinal integer,
  match_type text CHECK (match_type IS NULL OR match_type IN ('DIRECT','SAME_PARENT')),
  price_usd numeric(12,2),
  price_amount numeric(12,2),
  price_currency char(3),
  coupon text,
  monthly_sales_text text,
  stock_text text,
  seller text,
  rating numeric(2,1),
  rating_count bigint,
  rating_distribution jsonb,
  note text NOT NULL DEFAULT '',
  observed_at timestamptz,
  audit jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(run_id, monitor_item_id)
);

ALTER TABLE rank_results ADD COLUMN IF NOT EXISTS price_amount numeric(12,2);
ALTER TABLE rank_results ADD COLUMN IF NOT EXISTS price_currency char(3);
UPDATE rank_results SET price_amount = price_usd, price_currency = 'USD' WHERE price_amount IS NULL AND price_usd IS NOT NULL;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('RECHARGE','FREEZE','CONSUME','REFUND','DEDUCT')),
  amount bigint NOT NULL CHECK (amount <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  reference_id text,
  reason text NOT NULL,
  actor_id uuid REFERENCES users(id),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recharge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  requested_points bigint NOT NULL CHECK (requested_points > 0),
  amount_cny numeric(12,2),
  payment_reference text,
  status text NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by uuid REFERENCES users(id),
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE TABLE IF NOT EXISTS api_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  provider text NOT NULL CHECK (provider IN ('OPENAI','GEMINI','DEEPSEEK')),
  kms_ciphertext bytea NOT NULL,
  masked_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','AVAILABLE','UNAVAILABLE','REVOKED')),
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS payment_products (
  code text PRIMARY KEY,
  name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('MEMBERSHIP','QUOTA')),
  amount_cny numeric(12,2) NOT NULL CHECK (amount_cny > 0),
  membership_days integer,
  quota_amount integer,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  product_code text NOT NULL REFERENCES payment_products(code),
  provider text NOT NULL CHECK (provider IN ('ALIPAY','WECHAT')),
  amount_cny numeric(12,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','PAID','CLOSED','REFUNDED','FAILED')),
  provider_trade_no text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('ALIPAY','WECHAT')),
  provider_event_id text NOT NULL,
  order_no text,
  signature_valid boolean NOT NULL,
  payload_digest text NOT NULL,
  processing_status text NOT NULL CHECK (processing_status IN ('RECEIVED','APPLIED','REJECTED')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS cost_center_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('HOSTING','STORAGE','EMAIL','PLATFORM_AI')),
  period char(7) NOT NULL,
  amount_cny numeric(12,2),
  usage_text text NOT NULL,
  provider_status text NOT NULL,
  source_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cost_center_entries DROP CONSTRAINT IF EXISTS cost_center_entries_category_check;
UPDATE cost_center_entries SET category = 'HOSTING' WHERE category = 'CVM';
UPDATE cost_center_entries SET category = 'STORAGE' WHERE category = 'COS';
ALTER TABLE cost_center_entries ADD CONSTRAINT cost_center_entries_category_check CHECK (category IN ('HOSTING','STORAGE','EMAIL','PLATFORM_AI'));

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monitor_items_query_idx ON monitor_items(project_id, enabled, normalized_keyword);
CREATE INDEX IF NOT EXISTS monitor_runs_project_date_idx ON monitor_runs(project_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS rank_results_history_idx ON rank_results(project_id, child_asin, keyword, observed_at DESC);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_date_idx ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS monitor_runs_user_status_idx ON monitor_runs(user_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS run_outbox_pending_idx ON run_outbox(created_at) WHERE delivered_at IS NULL;

INSERT INTO rate_configs(version, search_page_points, detail_page_points, rating_subject_points, effective_at)
VALUES ('rate-v1', 1, 1, 1, now()) ON CONFLICT (version) DO NOTHING;

-- v0.1.1 does not ship provider-specific prices or a public payment flow.
-- Remove only the disabled legacy demo products when no order references them.
DELETE FROM payment_products product
WHERE product.code IN ('membership-30d-100', 'quota-100')
  AND product.enabled = false
  AND NOT EXISTS (SELECT 1 FROM payment_orders orders WHERE orders.product_code = product.code);
