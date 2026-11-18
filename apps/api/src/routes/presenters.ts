import type { Order } from '../db/orders';
import { maskPhone } from '../log';
import { formatUnitsPlain } from '../money';

/** Public view of an order: no code, phone masked, amounts as decimal strings. */
export function presentOrder(order: Order) {
  const native = order.payToken === '0x0000000000000000000000000000000000000000';
  return {
    id: order.id,
    status: order.status,
    kind: order.kind,
    payer: order.payer,
    payToken: native ? 'QIE' : 'QUSDC',
    payAmount: formatUnitsPlain(order.payAmount, native ? 18 : 6),
    usdAmount: formatUnitsPlain(order.usdAmount, 6),
    productName: order.productName,
    faceValue: order.faceValue,
    faceCurrency: order.faceCurrency,
    countryCode: order.countryCode,
    recipient: order.recipientPhone ? maskPhone(order.recipientPhone) : order.recipientWallet,
    hasCode: order.codeCiphertext !== null,
    paidTxHash: order.paidTxHash,
    settleTxHash: order.settleTxHash,
    refundTxHash: order.refundTxHash,
    refundedByPayer: order.refundedByPayer,
    quoteExpiry: order.quoteExpiry.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}
