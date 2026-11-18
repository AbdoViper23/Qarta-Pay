import { qartaCheckoutAbi } from '@qarta/shared';
import { parseEventLogs, type Address, type Hex, type Log, type PublicClient } from 'viem';
import type { Alerter } from '../alerts';
import { getOrder, transition } from '../db/orders';
import { withTransaction, type Db } from '../db/pool';
import type { Logger } from '../log';

const CURSOR_ID = 'checkout';
const CHUNK = 1_000n; // QIE RPCs accept up to 10,000 blocks per eth_getLogs

/**
 * Follows QartaCheckout events up to `head - confirmations` and applies them to the DB.
 * Handlers are idempotent: replaying a block range (after a crash) changes nothing.
 */
export class Indexer {
  private readonly blockTimes = new Map<bigint, Date>();

  constructor(
    private readonly db: Db,
    private readonly client: PublicClient,
    private readonly checkout: Address,
    private readonly startBlock: bigint,
    private readonly confirmations: number,
    private readonly log: Logger,
    private readonly alerter: Alerter,
  ) {}

  async lastProcessedBlock(): Promise<bigint> {
    const result = await this.db.query<{ last_block: bigint }>(
      'select last_block from indexer_cursor where id = $1',
      [CURSOR_ID],
    );
    return result.rows[0]?.last_block ?? this.startBlock - 1n;
  }

  /** Processes everything that is confirmed. Returns the number of events handled. */
  async tick(): Promise<number> {
    const head = await this.client.getBlockNumber({ cacheTime: 0 });
    const safe = head - BigInt(this.confirmations);
    let from = (await this.lastProcessedBlock()) + 1n;
    let handled = 0;
    while (from <= safe) {
      const to = from + CHUNK - 1n < safe ? from + CHUNK - 1n : safe;
      const logs = await this.client.getLogs({
        address: this.checkout,
        fromBlock: from,
        toBlock: to,
      });
      const events = parseEventLogs({ abi: qartaCheckoutAbi, logs, strict: true });
      for (const event of events) {
        await this.handle(event);
        handled += 1;
      }
      await this.db.query(
        `insert into indexer_cursor (id, last_block) values ($1, $2)
         on conflict (id) do update set last_block = excluded.last_block`,
        [CURSOR_ID, to.toString()],
      );
      from = to + 1n;
    }
    return handled;
  }

  /** Blocks between the chain head and the last processed block. */
  async lag(): Promise<bigint> {
    return (await this.client.getBlockNumber({ cacheTime: 0 })) - (await this.lastProcessedBlock());
  }

  private async blockTime(blockNumber: bigint): Promise<Date> {
    const cached = this.blockTimes.get(blockNumber);
    if (cached) return cached;
    const block = await this.client.getBlock({ blockNumber });
    const time = new Date(Number(block.timestamp) * 1000);
    if (this.blockTimes.size > 1000) this.blockTimes.clear();
    this.blockTimes.set(blockNumber, time);
    return time;
  }

  private async handle(
    event: ReturnType<typeof parseEventLogs<typeof qartaCheckoutAbi>>[number],
  ): Promise<void> {
    switch (event.eventName) {
      case 'OrderPaid':
        return this.onPaid(event as Log & { args: typeof event.args }, event.args as PaidArgs);
      case 'OrderSettled':
        return this.onSettled(event.args.orderId as Hex, event.transactionHash as Hex);
      case 'OrderRefunded': {
        const args = event.args as { orderId: Hex; byPayer: boolean };
        return this.onRefunded(args.orderId, args.byPayer, event.transactionHash as Hex);
      }
      default:
        return; // admin events are not stored
    }
  }

  private async onPaid(event: Log, args: PaidArgs): Promise<void> {
    const txHash = event.transactionHash as Hex;
    const blockNumber = event.blockNumber as bigint;
    const paidAt = await this.blockTime(blockNumber);
    await withTransaction(this.db, async (client) => {
      const order = await getOrder(client, args.orderId, true);
      if (!order) {
        await this.alerter.send(
          `unknown-order:${args.orderId}`,
          `OrderPaid for unknown order ${args.orderId} in ${txHash}`,
        );
        return;
      }
      if (order.paidTxHash) return; // already handled (replay)
      if (order.status !== 'QUOTED' && order.status !== 'EXPIRED') {
        await this.alerter.send(
          `paid-unexpected:${order.id}`,
          `OrderPaid for ${order.id} in status ${order.status}`,
        );
        return;
      }
      const matches =
        order.payer === args.payer.toLowerCase() &&
        order.payToken === args.token.toLowerCase() &&
        order.payAmount === args.amount &&
        order.usdAmount === args.usdAmount;
      const paid = { paidTxHash: txHash, paidBlock: blockNumber, paidAt };
      if (!matches) {
        // The signature binds these values, so a mismatch means our DB and our quote diverged.
        await transition(client, order.id, ['QUOTED', 'EXPIRED'], 'NEEDS_REVIEW', {
          ...paid,
          reviewReason: 'OrderPaid does not match the stored quote',
        });
        await this.alerter.send(
          `paid-mismatch:${order.id}`,
          `OrderPaid for ${order.id} does not match the quote`,
        );
        return;
      }
      await transition(client, order.id, ['QUOTED', 'EXPIRED'], 'PAID', paid);
      this.log.info({ orderId: order.id, txHash }, 'order paid');
    });
  }

  private async onSettled(orderId: Hex, txHash: Hex): Promise<void> {
    const order = await getOrder(this.db, orderId);
    if (!order || order.status === 'SETTLED') return;
    const done = await transition(this.db, orderId, ['DELIVERED'], 'SETTLED', {
      settleTxHash: txHash,
    });
    if (!done)
      await this.alerter.send(
        `settled-unexpected:${orderId}`,
        `OrderSettled for ${orderId} in status ${order.status}`,
      );
  }

  private async onRefunded(orderId: Hex, byPayer: boolean, txHash: Hex): Promise<void> {
    const order = await getOrder(this.db, orderId);
    if (!order || order.status === 'REFUNDED') return;
    const patch = { refundTxHash: txHash, refundedByPayer: byPayer };
    if (
      await transition(
        this.db,
        orderId,
        ['PAID', 'REFUND_PENDING', 'NEEDS_REVIEW'],
        'REFUNDED',
        patch,
      )
    )
      return;
    // The payer took the money back while the supplier may have delivered: possible loss.
    const reviewed = await transition(
      this.db,
      orderId,
      ['FULFILLING', 'DELIVERED'],
      'NEEDS_REVIEW',
      {
        ...patch,
        reviewReason: byPayer
          ? 'payer claimed a refund while delivery was in progress'
          : 'refunded on-chain during delivery',
      },
    );
    await this.alerter.send(
      `refunded-unexpected:${orderId}`,
      reviewed
        ? `Order ${orderId} was refunded on-chain while in ${order.status}; check the supplier`
        : `OrderRefunded for ${orderId} in status ${order.status}`,
    );
  }
}

interface PaidArgs {
  orderId: Hex;
  payer: Address;
  token: Address;
  amount: bigint;
  usdAmount: bigint;
}
