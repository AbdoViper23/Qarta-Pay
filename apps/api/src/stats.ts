import type { Db } from './db/pool';
import { formatUnitsPlain } from './money';

/** Public traction numbers (docs/05-BACKEND.md). Each one can be recomputed from contract events. */
export async function readStats(db: Db) {
  const row = (
    await db.query<{
      settled: string;
      volume: string;
      payers: string;
      repeat_payers: string;
      active_7d: string;
      refunded: string;
      paid_total: string;
      median_delivery_s: string | null;
    }>(`
      with paid as (select * from orders where paid_tx_hash is not null)
      select
        (select count(*) from paid where status = 'SETTLED')::text as settled,
        (select coalesce(sum(usd_amount), 0) from paid where status = 'SETTLED')::text as volume,
        (select count(distinct payer) from paid)::text as payers,
        (select count(*) from (select payer from paid group by payer having count(*) >= 2) r)::text as repeat_payers,
        (select count(distinct payer) from paid where paid_at > now() - interval '7 days')::text as active_7d,
        (select count(*) from paid where status = 'REFUNDED')::text as refunded,
        (select count(*) from paid)::text as paid_total,
        (select percentile_cont(0.5) within group (order by extract(epoch from delivered_at - paid_at))
           from paid where delivered_at is not null)::text as median_delivery_s
    `)
  ).rows[0]!;
  const paidTotal = Number(row.paid_total);
  return {
    ordersSettled: Number(row.settled),
    volumeUsd: formatUnitsPlain(BigInt(row.volume), 6),
    uniquePayingWallets: Number(row.payers),
    repeatWallets: Number(row.repeat_payers),
    activeWallets7d: Number(row.active_7d),
    refundRate: paidTotal === 0 ? 0 : Number(row.refunded) / paidTotal,
    medianDeliverySeconds:
      row.median_delivery_s === null ? null : Math.round(Number(row.median_delivery_s)),
  };
}
