import { qartaCheckoutAbi } from '@qarta/shared';
import type { Address, Hex } from 'viem';
import type { Clients } from './clients';

/** On-chain escrow status, as in QartaCheckout.Status. */
export const ChainStatus = { None: 0, Paid: 1, Settled: 2, Refunded: 3 } as const;

/**
 * Reads escrow state and sends settle / refund from the fulfiller key. Transactions are sent
 * one at a time (a promise chain acts as a mutex), each waited on until mined, so the nonce
 * is always the next one and two sends never race.
 */
export class CheckoutWriter {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly clients: Clients,
    private readonly checkout: Address,
  ) {}

  async chainStatus(orderId: Hex): Promise<number> {
    const [, , , , status] = await this.clients.publicClient.readContract({
      address: this.checkout,
      abi: qartaCheckoutAbi,
      functionName: 'orders',
      args: [orderId],
    });
    return status;
  }

  async refundTimeoutSeconds(): Promise<number> {
    return Number(
      await this.clients.publicClient.readContract({
        address: this.checkout,
        abi: qartaCheckoutAbi,
        functionName: 'refundTimeout',
      }),
    );
  }

  async maxOracleAgeSeconds(): Promise<number> {
    return Number(
      await this.clients.publicClient.readContract({
        address: this.checkout,
        abi: qartaCheckoutAbi,
        functionName: 'maxOracleAge',
      }),
    );
  }

  async fulfillerBalance(): Promise<bigint> {
    return this.clients.publicClient.getBalance({
      address: this.clients.fulfiller.account.address,
    });
  }

  settle(orderId: Hex): Promise<Hex> {
    return this.send('settle', orderId);
  }

  refund(orderId: Hex): Promise<Hex> {
    return this.send('refund', orderId);
  }

  private send(functionName: 'settle' | 'refund', orderId: Hex): Promise<Hex> {
    const run = async () => {
      const { request } = await this.clients.publicClient.simulateContract({
        address: this.checkout,
        abi: qartaCheckoutAbi,
        functionName,
        args: [orderId],
        account: this.clients.fulfiller.account,
      });
      const hash = await this.clients.fulfiller.writeContract(request);
      const receipt = await this.clients.publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
      });
      if (receipt.status !== 'success') throw new Error(`${functionName} reverted in ${hash}`);
      return hash;
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
