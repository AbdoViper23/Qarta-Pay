import { qartaCheckoutAbi } from '@qarta/shared';
import { encodeFunctionData, type Address, type Hex } from 'viem';
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
      const { publicClient, fulfiller, chain } = this.clients;
      const call = {
        address: this.checkout,
        abi: qartaCheckoutAbi,
        functionName,
        args: [orderId],
        account: fulfiller.account,
      } as const;
      // Fails with the contract's revert reason before anything is signed.
      await publicClient.simulateContract(call);
      // Sign the transaction ourselves with explicit gas, fees and nonce. viem's own prepare
      // step asks the node for eth_fillTransaction, and QIE nodes (testnet and mainnet) answer
      // it with the intrinsic gas only (~21,500): every settle/refund ran out of gas
      // (docs/probe-results.md, 19 Nov 2026).
      // The estimate takes the bare address: given a local account, viem estimates through
      // eth_fillTransaction too.
      const [gas, fees, nonce] = await Promise.all([
        publicClient.estimateContractGas({ ...call, account: fulfiller.account.address }),
        publicClient.estimateFeesPerGas(),
        publicClient.getTransactionCount({
          address: fulfiller.account.address,
          blockTag: 'pending',
        }),
      ]);
      const signed = await fulfiller.account.signTransaction({
        type: 'eip1559',
        chainId: chain.id,
        to: this.checkout,
        data: encodeFunctionData({ abi: qartaCheckoutAbi, functionName, args: [orderId] }),
        gas: (gas * 13n) / 10n,
        maxFeePerGas: fees.maxFeePerGas * 2n,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        nonce,
      });
      const hash = await publicClient.sendRawTransaction({ serializedTransaction: signed });
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
