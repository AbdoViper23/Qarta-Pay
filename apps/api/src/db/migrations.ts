/**
 * Database migrations, applied in array order by `migrate()`. They live in code (not .sql files
 * read at runtime) so a bundled serverless function carries them. Never edit an applied entry;
 * append a new one. `name` is what `schema_migrations` records.
 */
export const migrations: readonly { name: string; sql: string }[] = [
  {
    name: '001_init.sql',
    sql: `
-- Qarta Pay schema. Amounts are integers in base units (numeric(78,0) fits any uint256).
-- Status changes are UPDATE ... WHERE status = <expected>, so a transition happens at most once.

create table orders (
  id                    text primary key,            -- 0x + 64 hex, also the on-chain orderId
  status                text not null check (status in (
                          'QUOTED', 'EXPIRED', 'PAID', 'FULFILLING', 'DELIVERED', 'SETTLED',
                          'REFUND_PENDING', 'REFUNDED', 'NEEDS_REVIEW')),
  kind                  text not null check (kind in ('AIRTIME', 'GIFT_CARD')),
  payer                 text not null,               -- lowercase 0x address
  pay_token             text not null,               -- 0x000…0 for native QIE
  pay_amount            numeric(78, 0) not null,
  usd_amount            numeric(78, 0) not null,     -- 6 decimals, what the user pays in USD terms
  supplier_cost_usd     numeric(78, 0) not null,     -- 6 decimals, what the supplier charges us
  quote_expiry          timestamptz not null,
  country_code          text not null,
  operator_id           integer,
  product_id            integer,
  recipient_phone       text,                        -- E.164 digits; never returned by public endpoints
  supplier_amount       text not null,               -- decimal string sent to the supplier
  face_value            text not null,               -- what the recipient gets, for display
  face_currency         text not null,
  product_name          text not null,
  recipient_wallet      text not null,               -- who may reveal a gift card code
  paid_tx_hash          text,
  paid_block            bigint,
  paid_at               timestamptz,                 -- block time of OrderPaid = contract paidAt
  supplier_attempted_at timestamptz,                 -- set BEFORE the supplier call is made
  supplier_tx_id        text,
  supplier_status       text,
  code_ciphertext       text,                        -- AES-256-GCM, see src/codes.ts
  delivered_at          timestamptz,
  settle_tx_hash        text,
  refund_tx_hash        text,
  refunded_by_payer     boolean not null default false,
  review_reason         text,
  attempts              integer not null default 0,
  next_attempt_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index orders_work_idx on orders (status, next_attempt_at);
create index orders_payer_idx on orders (payer, created_at desc);

create table indexer_cursor (
  id          text primary key,
  last_block  bigint not null
);

create table wallet_profile (
  wallet           text primary key,
  qie_name         text,
  name_checked_at  timestamptz not null
);

create table auth_nonce (
  nonce       text primary key,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);
`,
  },
  {
    name: '002_job_lease.sql',
    sql: `
-- One row per background job. A runner owns a job while expires_at is in the future, so on a
-- serverless host where any request may run the indexer and worker, only one does at a time.
create table job_lease (
  name        text primary key,
  holder      text not null,
  expires_at  timestamptz not null
);
`,
  },
  {
    name: '003_free_orders.sql',
    sql: `
-- A wallet's first orders carry no Qarta fee. The flag is set when the quote is made.
alter table orders add column fee_waived boolean not null default false;
`,
  },
];
