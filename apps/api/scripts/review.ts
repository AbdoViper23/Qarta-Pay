/**
 * Operator tool for orders in NEEDS_REVIEW (docs/12-STATUS.md, runbook).
 *
 *   pnpm --filter api review list
 *   pnpm --filter api review show <orderId>
 *   pnpm --filter api review delivered <orderId> [supplierTxId]   # you confirmed at the supplier that it WAS delivered
 *   pnpm --filter api review refund <orderId>      # you confirmed at the supplier that it was NOT delivered
 *
 * "delivered" moves the order to DELIVERED (the worker then settles on-chain);
 * "refund" moves it to REFUND_PENDING (the worker then refunds on-chain).
 * Check the supplier dashboard first: refunding a delivered order loses money.
 */
import { z } from 'zod';
import { getOrder, transition } from '../src/db/orders';
import { createPool } from '../src/db/pool';
import { maskPhone } from '../src/log';

const [command, orderId] = process.argv.slice(2);
const db = createPool(z.string().min(1).parse(process.env.DATABASE_URL));

try {
  if (command === 'list') {
    const rows = await db.query(
      `select id, kind, product_name, usd_amount, supplier_tx_id, supplier_status, review_reason, updated_at
         from orders where status = 'NEEDS_REVIEW' order by updated_at`,
    );
    if (rows.rowCount === 0) console.log('No orders need review.');
    for (const row of rows.rows) console.log(JSON.stringify(row));
  } else if (command === 'show' && orderId) {
    const order = await getOrder(db, orderId);
    if (!order) throw new Error('no such order');
    console.log({
      ...order,
      recipientPhone: order.recipientPhone && maskPhone(order.recipientPhone),
      codeCiphertext: order.codeCiphertext ? '[stored]' : null,
    });
  } else if (
    command === 'delivered' &&
    orderId &&
    (await getOrder(db, orderId))?.kind === 'GIFT_CARD'
  ) {
    // A gift card is only delivered once the buyer can see its code: hand it back to the worker,
    // which reads the supplier status, fetches and encrypts the code, then settles.
    const order = (await getOrder(db, orderId))!;
    const supplierTxId = process.argv[4] ?? order.supplierTxId;
    if (!supplierTxId)
      throw new Error(
        'pass the supplier transaction id: review delivered <orderId> <supplierTxId>',
      );
    const done = await transition(db, orderId, ['NEEDS_REVIEW'], 'FULFILLING', {
      supplierTxId,
      supplierAttemptedAt: new Date(),
      reviewReason: 'resolved by operator: delivered, fetching code',
      nextAttemptAt: null,
    });
    console.log(
      done
        ? `Order ${orderId} -> FULFILLING; the worker will fetch the code and settle.`
        : 'Order is not in NEEDS_REVIEW; nothing changed.',
    );
  } else if ((command === 'delivered' || command === 'refund') && orderId) {
    const to = command === 'delivered' ? 'DELIVERED' : 'REFUND_PENDING';
    const done = await transition(db, orderId, ['NEEDS_REVIEW'], to, {
      reviewReason: `resolved by operator: ${command}`,
      nextAttemptAt: null,
      ...(command === 'delivered' ? { deliveredAt: new Date() } : {}),
    });
    console.log(
      done
        ? `Order ${orderId} -> ${to}. The worker will finish it on-chain.`
        : 'Order is not in NEEDS_REVIEW; nothing changed.',
    );
  } else {
    console.log('usage: review list | show <orderId> | delivered <orderId> | refund <orderId>');
    process.exitCode = 1;
  }
} finally {
  await db.end();
}
