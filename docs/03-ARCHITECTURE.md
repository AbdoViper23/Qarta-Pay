# 03 — Architecture

## Overview

```
┌────────────┐   1 quote req    ┌──────────────────────────────┐
│  Web app   │ ───────────────► │  API (Fastify)               │
│  Next.js   │ ◄─────────────── │  - catalog (cached Reloadly) │
│  wagmi     │   2 signed quote │  - quotes (EIP-712 signer)   │
└─────┬──────┘                  │  - orders, auth (SIWE)       │
      │ 3 pay(quote, sig)       └──────────┬───────────────────┘
      ▼                                    │ Postgres
┌──────────────────┐  4 OrderPaid   ┌──────▼───────────────────┐
│ QartaCheckout    │ ─────────────► │  Indexer (viem getLogs)  │
│ QIE Mainnet 1990 │                └──────┬───────────────────┘
│ escrow           │                       │ 5 enqueue
│                  │  7 settle/refund ┌────▼───────────────────┐   6   ┌──────────┐
│                  │ ◄─────────────── │  Fulfilment worker     │ ────► │ Reloadly │
└──────────────────┘                  └────────────────────────┘ ◄──── │   API    │
                                                                        └──────────┘
```

Single backend process is acceptable for the MVP (API + indexer + worker in one Node service, with DB-backed job state so a restart loses nothing).

## Monorepo layout

```
qarta-pay/
├── CLAUDE.md
├── docs/
├── contracts/            # Foundry
│   ├── src/QartaCheckout.sol
│   ├── src/mocks/        # MockERC20 (6 dec), MockAggregatorV3, MockRouter
│   ├── test/
│   └── script/           # Deploy.s.sol, Probe.s.sol, SweepTreasury.s.sol
├── apps/
│   ├── api/              # Node 22, TypeScript, Fastify, PostgreSQL (pg), viem
│   └── web/              # Next.js (App Router), wagmi, viem, Tailwind
├── packages/
│   └── shared/           # ABI, EIP-712 types, chain config, zod schemas
├── .env.example          # pointer; real examples live in apps/api, apps/web, contracts
└── pnpm-workspace.yaml
```

## Tech choices

| Layer | Choice | Reason |
|-------|--------|--------|
| Contracts | Solidity 0.8.24, Foundry, OpenZeppelin v5 | Fast tests, fork testing against mainnet |
| EVM target | `evm_version = "paris"` | QIE's supported opcode set is undocumented; `paris` avoids PUSH0/Cancun opcodes. Revisit only if confirmed. |
| Backend | Node 22 (`engines >=20`), TypeScript, Fastify, PostgreSQL via `pg` with hand-written SQL migrations, viem, zod | Small, typed, one deployable. Plain SQL keeps the status preconditions (`UPDATE … WHERE status = …`) visible in the code, which is easier to explain in the demo than an ORM. Chosen over Prisma on 18 Nov 2026 |
| Local DB and tests | `embedded-postgres` (a real PostgreSQL binary from npm) | No Docker or system Postgres needed; the integration tests run a real Postgres |
| Frontend | Next.js, wagmi v2, viem, Tailwind | QIE Wallet docs give wagmi/viem examples |
| Hosting | API + Postgres on Railway/Render/Fly; web on Vercel | No ops work |
| Jobs | DB-backed (`orders.status` + `next_attempt_at`), polled by the worker | No Redis needed; crash-safe |

## Order state machine

```
QUOTED ──(quote expires unpaid)──► EXPIRED
  │
  │ OrderPaid event seen, CONFIRMATIONS reached
  ▼
PAID ──► FULFILLING ──┬─ supplier SUCCESSFUL ──► DELIVERED ──(settle tx mined)──► SETTLED
                      │
                      ├─ supplier PROCESSING ──► (poll with backoff, max 30 min)
                      │
                      └─ supplier REFUNDED / hard failure / timeout
                                   ▼
                              REFUND_PENDING ──(refund tx mined)──► REFUNDED
```

Rules:

- **Fulfil only after** the `OrderPaid` event is confirmed on-chain and its `orderId`, `token`, `amount`, `payer` match the stored quote exactly.
- Every transition is a single DB transaction with a status precondition (`UPDATE … WHERE id = ? AND status = ?`). Never fulfil twice.
- The supplier call carries `customIdentifier = orderId`. Before any retry, look the order up at the supplier first.
- If the supplier state is unknown after the max wait, do **not** refund automatically: mark `NEEDS_REVIEW`, alert the operator. Refunding an order that was actually delivered loses money; delivering late is recoverable.
- Fulfilment cutoff: the worker makes no new supplier call after `paidAt + refundTimeout − 45 min`. An order that was paid but never sent to the supplier by then is refunded on-chain. Without this, a late delivery could race the payer's `claimRefund`.
- On-chain safety net: if the backend never settles or refunds, the payer can call `claimRefund(orderId)` after `REFUND_TIMEOUT`. The backend therefore must call `settle` promptly after delivery (it is the only thing that closes that window).

## Data model

As built: `apps/api/src/db/migrations/001_init.sql` (tables `orders`, `indexer_cursor`, `wallet_profile`, `auth_nonce`). Differences from the sketch below: no `DATA` kind yet (data bundles were cut, see `09-PLAN.md`), daily limits are computed from `orders` instead of a `DailyLimit` table, cashback columns are not created until P1, and `orders` also stores `supplier_attempted_at` (written before every supplier call), `delivered_at`, `refunded_by_payer` and `review_reason`.

Original sketch:

```
Order
  id              String  @id        // bytes32 hex, also the on-chain orderId
  status          OrderStatus
  kind            AIRTIME | DATA | GIFT_CARD
  payer           String?             // wallet, lowercased; set at quote time
  payToken        String              // 0x000…0 for native QIE, else QUSDC address
  payAmount       Decimal             // token base units
  usdAmount       Decimal             // 6 decimals, what the user is charged in USD terms
  supplierCostUsd Decimal
  quoteExpiry     DateTime
  // product
  countryCode     String
  operatorId      Int?
  productId       Int?
  recipientPhone  String?
  faceValue       Decimal
  faceCurrency    String
  // chain
  paidTxHash      String?
  paidBlock       Int?
  settleTxHash    String?
  refundTxHash    String?
  // supplier
  supplierTxId    String?
  supplierStatus  String?
  codeCiphertext  String?             // gift card code/PIN, AES-256-GCM
  // gifting
  recipientWallet String?             // who may reveal the code (default: payer)
  attempts        Int      @default(0)
  nextAttemptAt   DateTime?
  createdAt / updatedAt

IndexerCursor   { id, lastProcessedBlock }
CatalogCache    { key, json, fetchedAt }
WalletProfile   { wallet, qieName?, passVerified, passCheckedAt, cashbackAccruedQie, cashbackPaidQie }
DailyLimit      { wallet, day, usdSpent }
```

## Trust model (state it plainly in the README)

- The user trusts the contract for refunds: funds sit in `QartaCheckout` until settled or refunded, and the user can self-refund after the timeout.
- The user trusts Qarta Pay to actually deliver before settling. `settle` is called by the operator's fulfiller key. A malicious operator could settle without delivering; this is the same trust as any shop, reduced by the public on-chain record of every order.
- Qarta Pay trusts Reloadly for delivery and holds a prepaid float there.
- Qarta Pay carries QIE price risk on native-QIE payments between payment and conversion. Mitigations: on-chain oracle guard, QIE quotes priced at the lower of the oracle and the QIEDex pool price, QIEDex price cross-check before quoting, and a regular treasury sweep to QUSDC through QIEDex (`04-SMART-CONTRACTS.md`, `05-BACKEND.md`).

## Environments

| Env | Chain | Supplier | Notes |
|-----|-------|----------|-------|
| local | anvil (optionally forking QIE mainnet) | Reloadly sandbox | mocks for QUSDC/oracle when not forking |
| staging | QIE Testnet (1983) | Reloadly sandbox | deploy mocks; testnet may not have QUSDC, oracle or DEX |
| production | QIE Mainnet (1990) | Reloadly live | small float, limits on |
