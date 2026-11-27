import type { Alerter } from '../alerts';
import { ChainStatus, type CheckoutWriter } from '../chain/checkout-writer';
import type { ContractLimits } from '../chain/contract-limits';
import { encryptCodes } from '../codes';
import type { AppConfig } from '../config';
import { freeOrdersPaidBefore, lockWork, patchOrder, transition, type Order } from '../db/orders';
import { withTransaction, type Db } from '../db/pool';
import type { Logger } from '../log';
import { SupplierRejectedError, type DeliveryRef, type Supplier } from '../supplier/types';

/** How long a worker holds an order it picked before another tick may pick it again. */
const LEASE_MS = 90_000;
/** How long to wait for a supplier record to appear before calling the outcome unknown. */
const LOOKUP_GRACE_MS = 2 * 60_000;

const later = (ms: number) => new Date(Date.now() + ms);

/**
 * Moves paid orders to delivery and settles or refunds them on-chain
 * (state machine in docs/03-ARCHITECTURE.md). Rules that protect money:
 *   - every status change has a status precondition, so nothing happens twice;
 *   - `supplierAttemptedAt` is written BEFORE the supplier call, so a crash in between is
 *     detected and the order is looked up at the supplier instead of being sent again;
 *   - an unknown supplier outcome ends in NEEDS_REVIEW, never in an automatic refund or retry;
 *   - no supplier call starts after the fulfilment cutoff, so a late delivery cannot race
 *     the payer's claimRefund;
 *   - before settle or refund, the on-chain escrow status is read, so a replay is harmless.
 */
export class FulfilmentWorker {
  constructor(
    private readonly db: Db,
    private readonly supplier: Supplier,
    private readonly writer: CheckoutWriter,
    private readonly config: AppConfig,
    private readonly contractLimits: () => Promise<ContractLimits>,
    private readonly log: Logger,
    private readonly alerter: Alerter,
  ) {}

  /** Picks a batch of due orders, leases them, then processes each. Returns how many it processed. */
  async tick(batch = 10): Promise<number> {
    const orders = await withTransaction(this.db, async (client) => {
      const locked = await lockWork(client, batch);
      for (const order of locked) {
        await patchOrder(client, order.id, order.status, { nextAttemptAt: later(LEASE_MS) });
      }
      return locked;
    });
    for (const order of orders) {
      try {
        await this.process(order);
      } catch (error) {
        // An unexpected error leaves the order where it is; the lease expires and it is retried.
        this.log.error({ orderId: order.id, err: error }, 'worker step failed');
      }
    }
    return orders.length;
  }

  async process(order: Order): Promise<void> {
    switch (order.status) {
      case 'PAID':
        return this.startDelivery(order);
      case 'FULFILLING':
        return this.followDelivery(order);
      case 'DELIVERED':
        return this.settle(order);
      case 'REFUND_PENDING':
        return this.refund(order);
      default:
        return;
    }
  }

  /**
   * Last moment a supplier call may start for this order. Needs the contract refundTimeout,
   * so it throws while the chain is unreachable; the order then stays PAID and is retried.
   */
  async cutoff(order: Order): Promise<Date> {
    const { refundTimeoutSeconds } = await this.contractLimits();
    const paidAt = order.paidAt ?? order.createdAt;
    return new Date(
      paidAt.getTime() + (refundTimeoutSeconds - this.config.FULFIL_CUTOFF_BEFORE_TIMEOUT_S) * 1000,
    );
  }

  private async startDelivery(order: Order): Promise<void> {
    // A wallet can hold several free quotes at once. Only its first FREE_ORDERS_PER_WALLET paid
    // ones are delivered at the free price; a later one is refunded before anything is delivered.
    if (
      order.feeWaived &&
      (await freeOrdersPaidBefore(this.db, order)) >= this.config.FREE_ORDERS_PER_WALLET
    ) {
      await transition(this.db, order.id, ['PAID'], 'REFUND_PENDING', {
        reviewReason: 'free order limit already used by this wallet',
        nextAttemptAt: null,
      });
      return;
    }

    if (Date.now() >= (await this.cutoff(order)).getTime()) {
      await transition(this.db, order.id, ['PAID'], 'REFUND_PENDING', {
        reviewReason: 'fulfilment cutoff passed before delivery started',
        nextAttemptAt: null,
      });
      await this.alerter.send(
        `cutoff:${order.id}`,
        `Order ${order.id} missed the fulfilment cutoff; refunding`,
      );
      return;
    }

    // Record the attempt first. If we crash after the supplier call, this is how we know.
    const claimed = await transition(this.db, order.id, ['PAID'], 'FULFILLING', {
      supplierAttemptedAt: new Date(),
      attempts: order.attempts + 1,
      nextAttemptAt: later(5_000),
    });
    if (!claimed) return;

    let ref: DeliveryRef;
    try {
      ref = await this.callSupplier(claimed);
    } catch (error) {
      if (error instanceof SupplierRejectedError) {
        // Refused before anything happened: nothing was delivered, refund the user.
        await transition(this.db, order.id, ['FULFILLING'], 'REFUND_PENDING', {
          supplierStatus: 'REJECTED',
          reviewReason: error.message.slice(0, 300),
          nextAttemptAt: null,
        });
        return;
      }
      // Unknown outcome: keep FULFILLING without a transaction id; the next step looks it up.
      this.log.warn({ orderId: order.id, err: error }, 'supplier call outcome unknown');
      await patchOrder(this.db, order.id, 'FULFILLING', { nextAttemptAt: later(30_000) });
      return;
    }
    const updated = await patchOrder(this.db, order.id, 'FULFILLING', {
      supplierTxId: ref.transactionId,
      supplierStatus: ref.status,
      nextAttemptAt: later(5_000),
    });
    if (updated) await this.applyStatus(updated, ref);
  }

  private callSupplier(order: Order): Promise<DeliveryRef> {
    if (order.kind === 'AIRTIME') {
      if (!order.operatorId || !order.recipientPhone)
        throw new Error('airtime order without operator or phone');
      return this.supplier.sendTopup({
        customIdentifier: order.id,
        operatorId: order.operatorId,
        amount: order.supplierAmount,
        countryCode: order.countryCode,
        phone: order.recipientPhone,
      });
    }
    if (!order.productId) throw new Error('gift card order without product');
    return this.supplier.orderGiftCard({
      customIdentifier: order.id,
      productId: order.productId,
      countryCode: order.countryCode,
      unitPrice: order.supplierAmount,
    });
  }

  private async followDelivery(order: Order): Promise<void> {
    const startedAt = order.supplierAttemptedAt ?? order.updatedAt;
    const elapsed = Date.now() - startedAt.getTime();

    if (!order.supplierTxId) {
      // We do not know whether the supplier received the call. Look it up; never resend blindly.
      let found: DeliveryRef | null;
      try {
        const since = new Date(startedAt.getTime() - 60 * 60_000);
        found =
          order.kind === 'AIRTIME'
            ? await this.supplier.findTopup(order.id, since)
            : await this.supplier.findGiftCardOrder(order.id, since);
      } catch (error) {
        this.log.warn({ orderId: order.id, err: error }, 'supplier lookup failed');
        if (elapsed > this.config.SUPPLIER_POLL_MAX_S * 1000) {
          return this.review(order, 'supplier lookup kept failing after an unconfirmed call');
        }
        await patchOrder(this.db, order.id, 'FULFILLING', { nextAttemptAt: later(60_000) });
        return;
      }
      if (!found) {
        if (elapsed < LOOKUP_GRACE_MS) {
          await patchOrder(this.db, order.id, 'FULFILLING', { nextAttemptAt: later(30_000) });
          return;
        }
        return this.review(order, 'supplier call outcome unknown and no supplier record found');
      }
      const updated = await patchOrder(this.db, order.id, 'FULFILLING', {
        supplierTxId: found.transactionId,
        supplierStatus: found.status,
      });
      if (updated) await this.applyStatus(updated, found);
      return;
    }

    let ref: DeliveryRef;
    try {
      ref =
        order.kind === 'AIRTIME'
          ? await this.supplier.getTopup(order.supplierTxId)
          : await this.supplier.getGiftCardOrder(order.supplierTxId);
    } catch (error) {
      this.log.warn({ orderId: order.id, err: error }, 'supplier status read failed');
      ref = { transactionId: order.supplierTxId, status: 'PROCESSING' };
    }
    await this.applyStatus(order, ref);
  }

  private async applyStatus(order: Order, ref: DeliveryRef): Promise<void> {
    const startedAt = order.supplierAttemptedAt ?? order.updatedAt;
    switch (ref.status) {
      case 'SUCCESSFUL':
        return this.markDelivered(order, ref);
      case 'REFUNDED':
        // The supplier returned our money: nothing was delivered.
        await transition(this.db, order.id, ['FULFILLING'], 'REFUND_PENDING', {
          supplierStatus: 'REFUNDED',
          nextAttemptAt: null,
        });
        return;
      case 'PROCESSING': {
        if (Date.now() - startedAt.getTime() > this.config.SUPPLIER_POLL_MAX_S * 1000) {
          return this.review(
            order,
            `supplier still processing after ${this.config.SUPPLIER_POLL_MAX_S}s`,
          );
        }
        const wait = Math.min(5_000 * 2 ** Math.min(order.attempts, 5), 120_000);
        await patchOrder(this.db, order.id, 'FULFILLING', {
          supplierStatus: 'PROCESSING',
          attempts: order.attempts + 1,
          nextAttemptAt: later(wait),
        });
        return;
      }
      default:
        // FAILED (funds not yet reversed) or a status we do not know.
        return this.review(order, `supplier status ${ref.status}`);
    }
  }

  private async markDelivered(order: Order, ref: DeliveryRef): Promise<void> {
    let codeCiphertext: string | null = null;
    if (order.kind === 'GIFT_CARD') {
      try {
        codeCiphertext = encryptCodes(
          await this.supplier.getCardCodes(ref.transactionId),
          this.config.CODE_ENCRYPTION_KEY,
        );
      } catch (error) {
        // Delivered at the supplier but the code cannot be read: never refund, ask a human.
        this.log.warn({ orderId: order.id, err: error }, 'card code fetch failed');
        if (Date.now() - (order.supplierAttemptedAt ?? order.updatedAt).getTime() > 10 * 60_000) {
          return this.review(order, 'gift card delivered but its code could not be read');
        }
        await patchOrder(this.db, order.id, 'FULFILLING', {
          supplierStatus: 'SUCCESSFUL',
          nextAttemptAt: later(30_000),
        });
        return;
      }
    }
    const delivered = await transition(this.db, order.id, ['FULFILLING'], 'DELIVERED', {
      supplierStatus: 'SUCCESSFUL',
      codeCiphertext,
      deliveredAt: new Date(),
      nextAttemptAt: null,
    });
    if (delivered) await this.settle(delivered);
  }

  private async settle(order: Order): Promise<void> {
    try {
      const status = await this.writer.chainStatus(order.id);
      if (status === ChainStatus.Settled) {
        await transition(this.db, order.id, ['DELIVERED'], 'SETTLED');
        return;
      }
      if (status !== ChainStatus.Paid) {
        return this.review(order, `delivered, but the escrow is in on-chain status ${status}`);
      }
      const hash = await this.writer.settle(order.id);
      await transition(this.db, order.id, ['DELIVERED'], 'SETTLED', {
        settleTxHash: hash,
        nextAttemptAt: null,
      });
      this.log.info({ orderId: order.id, txHash: hash }, 'order settled');
    } catch (error) {
      this.log.error({ orderId: order.id, err: error }, 'settle failed');
      await patchOrder(this.db, order.id, 'DELIVERED', {
        attempts: order.attempts + 1,
        nextAttemptAt: later(60_000),
      });
      if (order.attempts >= 3)
        await this.alerter.send(`settle:${order.id}`, `settle keeps failing for ${order.id}`);
    }
  }

  private async refund(order: Order): Promise<void> {
    try {
      const status = await this.writer.chainStatus(order.id);
      if (status === ChainStatus.Refunded) {
        await transition(this.db, order.id, ['REFUND_PENDING'], 'REFUNDED');
        return;
      }
      if (status !== ChainStatus.Paid) {
        return this.review(order, `refund pending, but the escrow is in on-chain status ${status}`);
      }
      const hash = await this.writer.refund(order.id);
      await transition(this.db, order.id, ['REFUND_PENDING'], 'REFUNDED', {
        refundTxHash: hash,
        nextAttemptAt: null,
      });
      this.log.info({ orderId: order.id, txHash: hash }, 'order refunded');
    } catch (error) {
      this.log.error({ orderId: order.id, err: error }, 'refund failed');
      await patchOrder(this.db, order.id, 'REFUND_PENDING', {
        attempts: order.attempts + 1,
        nextAttemptAt: later(60_000),
      });
      if (order.attempts >= 3)
        await this.alerter.send(`refund:${order.id}`, `refund keeps failing for ${order.id}`);
    }
  }

  private async review(order: Order, reason: string): Promise<void> {
    await transition(this.db, order.id, [order.status], 'NEEDS_REVIEW', {
      reviewReason: reason,
      nextAttemptAt: null,
    });
    await this.alerter.send(`review:${order.id}`, `Order ${order.id} needs review: ${reason}`);
  }
}
