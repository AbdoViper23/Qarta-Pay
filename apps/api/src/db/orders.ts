import type { Address, Hex } from 'viem';
import type { DbClient } from './pool';

/**
 * Order repository. Every status change goes through `transition`, which only updates the row
 * if it is still in one of the expected statuses. That precondition is what makes a duplicate
 * event, a second worker or a restart harmless: the second attempt changes nothing.
 */

export const ORDER_STATUSES = [
  'QUOTED',
  'EXPIRED',
  'PAID',
  'FULFILLING',
  'DELIVERED',
  'SETTLED',
  'REFUND_PENDING',
  'REFUNDED',
  'NEEDS_REVIEW',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderKind = 'AIRTIME' | 'GIFT_CARD';

export interface Order {
  id: Hex;
  status: OrderStatus;
  kind: OrderKind;
  payer: Address;
  payToken: Address;
  payAmount: bigint;
  usdAmount: bigint;
  supplierCostUsd: bigint;
  quoteExpiry: Date;
  countryCode: string;
  operatorId: number | null;
  productId: number | null;
  recipientPhone: string | null;
  supplierAmount: string;
  faceValue: string;
  faceCurrency: string;
  productName: string;
  recipientWallet: Address;
  paidTxHash: Hex | null;
  paidBlock: bigint | null;
  paidAt: Date | null;
  supplierAttemptedAt: Date | null;
  supplierTxId: string | null;
  supplierStatus: string | null;
  codeCiphertext: string | null;
  deliveredAt: Date | null;
  settleTxHash: Hex | null;
  refundTxHash: Hex | null;
  refundedByPayer: boolean;
  /** Quoted without the Qarta fee, as one of the wallet's free orders. */
  feeWaived: boolean;
  reviewReason: string | null;
  attempts: number;
  nextAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Columns that may be written together with a status change. */
export type OrderPatch = Partial<
  Pick<
    Order,
    | 'paidTxHash'
    | 'paidBlock'
    | 'paidAt'
    | 'supplierAttemptedAt'
    | 'supplierTxId'
    | 'supplierStatus'
    | 'codeCiphertext'
    | 'deliveredAt'
    | 'settleTxHash'
    | 'refundTxHash'
    | 'refundedByPayer'
    | 'reviewReason'
    | 'attempts'
    | 'nextAttemptAt'
  >
>;

const COLUMN: Record<keyof OrderPatch, string> = {
  paidTxHash: 'paid_tx_hash',
  paidBlock: 'paid_block',
  paidAt: 'paid_at',
  supplierAttemptedAt: 'supplier_attempted_at',
  supplierTxId: 'supplier_tx_id',
  supplierStatus: 'supplier_status',
  codeCiphertext: 'code_ciphertext',
  deliveredAt: 'delivered_at',
  settleTxHash: 'settle_tx_hash',
  refundTxHash: 'refund_tx_hash',
  refundedByPayer: 'refunded_by_payer',
  reviewReason: 'review_reason',
  attempts: 'attempts',
  nextAttemptAt: 'next_attempt_at',
};

type Row = Record<string, unknown>;

function toOrder(row: Row): Order {
  const date = (value: unknown) => (value === null ? null : (value as Date));
  return {
    id: row.id as Hex,
    status: row.status as OrderStatus,
    kind: row.kind as OrderKind,
    payer: row.payer as Address,
    payToken: row.pay_token as Address,
    payAmount: BigInt(row.pay_amount as string),
    usdAmount: BigInt(row.usd_amount as string),
    supplierCostUsd: BigInt(row.supplier_cost_usd as string),
    quoteExpiry: row.quote_expiry as Date,
    countryCode: row.country_code as string,
    operatorId: row.operator_id as number | null,
    productId: row.product_id as number | null,
    recipientPhone: row.recipient_phone as string | null,
    supplierAmount: row.supplier_amount as string,
    faceValue: row.face_value as string,
    faceCurrency: row.face_currency as string,
    productName: row.product_name as string,
    recipientWallet: row.recipient_wallet as Address,
    paidTxHash: row.paid_tx_hash as Hex | null,
    paidBlock: row.paid_block as bigint | null,
    paidAt: date(row.paid_at),
    supplierAttemptedAt: date(row.supplier_attempted_at),
    supplierTxId: row.supplier_tx_id as string | null,
    supplierStatus: row.supplier_status as string | null,
    codeCiphertext: row.code_ciphertext as string | null,
    deliveredAt: date(row.delivered_at),
    settleTxHash: row.settle_tx_hash as Hex | null,
    refundTxHash: row.refund_tx_hash as Hex | null,
    refundedByPayer: row.refunded_by_payer as boolean,
    feeWaived: row.fee_waived as boolean,
    reviewReason: row.review_reason as string | null,
    attempts: row.attempts as number,
    nextAttemptAt: date(row.next_attempt_at),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export interface NewOrder {
  id: Hex;
  kind: OrderKind;
  payer: Address;
  payToken: Address;
  payAmount: bigint;
  usdAmount: bigint;
  supplierCostUsd: bigint;
  quoteExpiry: Date;
  countryCode: string;
  operatorId: number | null;
  productId: number | null;
  recipientPhone: string | null;
  supplierAmount: string;
  faceValue: string;
  faceCurrency: string;
  productName: string;
  recipientWallet: Address;
  feeWaived?: boolean;
}

export async function insertOrder(db: DbClient, order: NewOrder): Promise<void> {
  await db.query(
    `insert into orders (id, status, kind, payer, pay_token, pay_amount, usd_amount, supplier_cost_usd,
       quote_expiry, country_code, operator_id, product_id, recipient_phone, supplier_amount,
       face_value, face_currency, product_name, recipient_wallet, fee_waived)
     values ($1, 'QUOTED', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
       $18)`,
    [
      order.id.toLowerCase(),
      order.kind,
      order.payer.toLowerCase(),
      order.payToken.toLowerCase(),
      order.payAmount.toString(),
      order.usdAmount.toString(),
      order.supplierCostUsd.toString(),
      order.quoteExpiry,
      order.countryCode,
      order.operatorId,
      order.productId,
      order.recipientPhone,
      order.supplierAmount,
      order.faceValue,
      order.faceCurrency,
      order.productName,
      order.recipientWallet.toLowerCase(),
      order.feeWaived ?? false,
    ],
  );
}

/** Statuses in which a free order counts as used: paid, and not refunded. */
const FREE_ORDER_USED = `('PAID', 'FULFILLING', 'DELIVERED', 'SETTLED', 'NEEDS_REVIEW')`;

/** How many free orders this wallet has paid for (a refunded one gives its slot back). */
export async function freeOrdersUsed(db: DbClient, wallet: string): Promise<number> {
  const result = await db.query<{ n: string }>(
    `select count(*)::text as n from orders
      where payer = $1 and fee_waived and status in ${FREE_ORDER_USED}`,
    [wallet.toLowerCase()],
  );
  return Number(result.rows[0]?.n ?? '0');
}

/**
 * Free orders of the same wallet paid before `order` (earlier block, then lower id). The worker
 * uses it to refund a free order paid after the wallet already used all of its free orders.
 */
export async function freeOrdersPaidBefore(db: DbClient, order: Order): Promise<number> {
  const result = await db.query<{ n: string }>(
    `select count(*)::text as n from orders
      where payer = $1 and fee_waived and id <> $2 and status in ${FREE_ORDER_USED}
        and (paid_block < $3 or (paid_block = $3 and id < $2))`,
    [order.payer.toLowerCase(), order.id.toLowerCase(), (order.paidBlock ?? 0n).toString()],
  );
  return Number(result.rows[0]?.n ?? '0');
}

export async function getOrder(db: DbClient, id: string, forUpdate = false): Promise<Order | null> {
  const result = await db.query(
    `select * from orders where id = $1${forUpdate ? ' for update' : ''}`,
    [id.toLowerCase()],
  );
  const row = result.rows[0] as Row | undefined;
  return row ? toOrder(row) : null;
}

/**
 * Moves an order from one of `from` to `to`, writing `patch` in the same statement.
 * Returns the updated order, or null if the order was not in an expected status (nothing changed).
 */
export async function transition(
  db: DbClient,
  id: string,
  from: readonly OrderStatus[],
  to: OrderStatus,
  patch: OrderPatch = {},
): Promise<Order | null> {
  const sets = ['status = $1', 'updated_at = now()'];
  const values: unknown[] = [to];
  for (const [key, value] of Object.entries(patch) as [keyof OrderPatch, unknown][]) {
    values.push(typeof value === 'bigint' ? value.toString() : value);
    sets.push(`${COLUMN[key]} = $${values.length}`);
  }
  values.push(id.toLowerCase(), [...from]);
  const result = await db.query(
    `update orders set ${sets.join(', ')} where id = $${values.length - 1} and status = any($${values.length}) returning *`,
    values,
  );
  const row = result.rows[0] as Row | undefined;
  return row ? toOrder(row) : null;
}

/** Updates fields without changing the status, only while the order is in `status`. */
export async function patchOrder(
  db: DbClient,
  id: string,
  status: OrderStatus,
  patch: OrderPatch,
): Promise<Order | null> {
  return transition(db, id, [status], status, patch);
}

/**
 * Claims up to `limit` orders that need work, skipping rows another worker holds.
 * Must run inside a transaction; the lock lasts until it commits.
 */
export async function lockWork(db: DbClient, limit: number): Promise<Order[]> {
  const result = await db.query(
    `select * from orders
      where status in ('PAID', 'FULFILLING', 'DELIVERED', 'REFUND_PENDING')
        and (next_attempt_at is null or next_attempt_at <= now())
      order by updated_at
      limit $1
      for update skip locked`,
    [limit],
  );
  return (result.rows as Row[]).map(toOrder);
}

export async function listOrdersByWallet(
  db: DbClient,
  wallet: string,
  limit = 50,
): Promise<Order[]> {
  const result = await db.query(
    `select * from orders where (payer = $1 or recipient_wallet = $1) and status <> 'QUOTED' and status <> 'EXPIRED'
      order by created_at desc limit $2`,
    [wallet.toLowerCase(), limit],
  );
  return (result.rows as Row[]).map(toOrder);
}

/** Marks quotes that were never paid as EXPIRED, `graceSeconds` after their expiry. */
export async function expireQuotes(db: DbClient, graceSeconds: number): Promise<number> {
  const result = await db.query(
    `update orders set status = 'EXPIRED', updated_at = now()
      where status = 'QUOTED' and quote_expiry < now() - make_interval(secs => $1)`,
    [graceSeconds],
  );
  return result.rowCount ?? 0;
}

/** Statuses that count against spending limits: paid or about to be paid, not refunded. */
const COMMITTED = `(status in ('PAID', 'FULFILLING', 'DELIVERED', 'SETTLED', 'REFUND_PENDING', 'NEEDS_REVIEW')
  or (status = 'QUOTED' and quote_expiry > now() and payer <> $EXCLUDE))`;
// A wallet asking for a new price replaces its own earlier unpaid quotes, so those do not count
// against it. If it pays a stale quote anyway, the supplier refuses and the order is refunded.
const NO_WALLET = '0x0000000000000000000000000000000000000000';

/** USD (6 decimals) committed since the start of the current UTC day, for one wallet or all. */
export async function usdCommittedToday(
  db: DbClient,
  wallet?: string,
  excludeQuotesOf?: string,
): Promise<bigint> {
  const result = await db.query<{ total: string | null }>(
    `select coalesce(sum(usd_amount), 0)::text as total from orders
      where ${COMMITTED.replace('$EXCLUDE', '$1')} and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
        ${wallet ? 'and payer = $2' : ''}`,
    wallet
      ? [(excludeQuotesOf ?? NO_WALLET).toLowerCase(), wallet.toLowerCase()]
      : [(excludeQuotesOf ?? NO_WALLET).toLowerCase()],
  );
  return BigInt(result.rows[0]?.total ?? '0');
}

/** Supplier cost (6 decimals) of orders that may still draw on the supplier balance. */
export async function supplierCostReserved(
  db: DbClient,
  excludeQuotesOf?: string,
): Promise<bigint> {
  const result = await db.query<{ total: string | null }>(
    `select coalesce(sum(supplier_cost_usd), 0)::text as total from orders
      where status in ('PAID', 'FULFILLING')
        or (status = 'QUOTED' and quote_expiry > now() and payer <> $1)`,
    [(excludeQuotesOf ?? NO_WALLET).toLowerCase()],
  );
  return BigInt(result.rows[0]?.total ?? '0');
}
