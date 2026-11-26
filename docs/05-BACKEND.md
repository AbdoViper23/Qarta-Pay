# 05 — Backend

Node 22 + TypeScript + Fastify + PostgreSQL (`pg`, SQL migrations) + viem + zod. One service with three internal modules: **API**, **indexer**, **fulfilment worker**.

## As built (Step 3, 18 Nov 2026)

| Module | File |
|--------|------|
| Config (zod, every env var) | `apps/api/src/config.ts` |
| Orders repository, status transitions with preconditions | `apps/api/src/db/orders.ts`, `apps/api/src/db/migrations.ts` |
| Supplier interface, Reloadly client, fake supplier | `apps/api/src/supplier/` |
| Catalog (`config/catalog.json`: every supplier country minus blocked ones, every USD fixed-price gift card brand) | `apps/api/src/catalog/catalog.ts` |
| Pricing rules, quote service, EIP-712 signing | `apps/api/src/quotes/` |
| Oracle read, QIEDex cross-check, price cache | `apps/api/src/pricing/` |
| `.qie` names | `apps/api/src/identity/qie-name.ts` |
| Indexer | `apps/api/src/indexer/indexer.ts` |
| Fulfilment worker | `apps/api/src/worker/fulfilment.ts` |
| settle / refund sender | `apps/api/src/chain/checkout-writer.ts` |
| SIWE sessions, gift card code encryption | `apps/api/src/auth/siwe.ts`, `apps/api/src/codes.ts` |
| HTTP routes, wiring, loops | `apps/api/src/server.ts`, `apps/api/src/runtime.ts`, `apps/api/src/main.ts` |
| Operator tool for NEEDS_REVIEW | `apps/api/scripts/review.ts` |

Differences from the spec below, each deliberate:

- `POST /v1/quotes` takes `amount` (airtime, in the operator's sender currency, which must be USD) or `unitPrice` (gift card face value), not `faceValue`/`faceCurrency`.
- Supplier cost ignores the supplier's discount, so the cost is never under-estimated. Gift card cost = sender price + `senderFee`.
- Gift card products are sold only if `senderCurrency` is USD and they have fixed denominations; `RANGE` products are skipped until their sandbox behaviour is known.
- Phone numbers are validated with `libphonenumber-js` and sent to Reloadly as E.164 digits without `+` (Reloadly's accepted format is **[UNVERIFIED]** until the sandbox run).
- The indexer also accepts `OrderPaid` for an order already marked `EXPIRED` (the expiry sweep may run before a late-indexed payment; the contract itself refuses expired quotes).
- An `OrderRefunded` by the payer while an order is `FULFILLING` or `DELIVERED` moves it to `NEEDS_REVIEW` with an alert (possible loss).
- Before every settle/refund the worker reads the on-chain escrow status, so a replay never sends a doomed transaction.
- Supplier errors are split in two: an HTTP 4xx other than 401/404/408/429 is a definite rejection (refund); anything else is an unknown outcome (look up, then `NEEDS_REVIEW`).
- After an unconfirmed supplier call, the worker looks the order up by `customIdentifier` (airtime report filter from the official spec; gift card report paged and matched client-side). No record after 2 minutes → `NEEDS_REVIEW`; it never resends.
- `/v1/webhooks/reloadly` is not built (optional; polling covers it).
- `/v1/orders` (history) takes the wallet from the SIWE session, not from a query parameter.

Tests (`pnpm --filter api test`): unit tests for money, pricing, cross-check, names, code encryption, the Reloadly client (fake fetch) and the scrubber; integration tests that deploy the real contract and mocks on anvil, use a real PostgreSQL, and cover: QUSDC airtime happy path, native-QIE gift card with SIWE code reveal, supplier REFUNDED, supplier rejection, network error after the call, crash between supplier call and DB write, unknown outcome, supplier stuck in PROCESSING, fulfilment cutoff, OrderPaid not matching the quote, replay of indexed blocks, QIE price = min(oracle, pool), QIE quotes refused on deviation while QUSDC works, limits, payer self-refund.

## HTTP API (v1)

All responses JSON. Validate every input with zod. Rate-limit by IP and by wallet.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/config` | chain id, contract address, QUSDC address, enabled countries, limits, QIE component addresses for the Powered by QIE page (feed, pair, router, factory, WQIE, reverse resolver, treasury) |
| GET | `/v1/prices` | QIE/USD oracle price + `updatedAt`, QIEDex pool price, deviation in bps, `qieQuotesEnabled` (cached ≤ 15 s) |
| GET | `/v1/identity/:wallet` | primary `.qie` name or `null` (cached 1 h in `WalletProfile`) |
| GET | `/v1/airtime/detect?phone=&country=` | operator auto-detect + allowed amounts (proxied + cached from Reloadly) |
| GET | `/v1/giftcards?country=` | curated gift card products with denominations and our price |
| POST | `/v1/quotes` | create order + signed quote |
| GET | `/v1/orders/:id` | public status (no code, phone masked) |
| GET | `/v1/orders?wallet=` | order history for the authenticated wallet |
| POST | `/v1/auth/nonce`, `/v1/auth/verify` | Sign-In with Ethereum (EIP-4361) → session cookie/JWT |
| GET | `/v1/orders/:id/code` | reveal gift card code; requires session for `recipientWallet` |
| GET | `/v1/stats` | public traction numbers |
| GET | `/healthz` | liveness + supplier balance OK + indexer lag |
| POST | `/v1/webhooks/reloadly` | (optional) supplier status webhook |

### `POST /v1/quotes`

Request:
```json
{
  "kind": "AIRTIME",
  "payer": "0x…",
  "payToken": "QUSDC" ,
  "countryCode": "NG",
  "recipientPhone": "08012345678",
  "operatorId": 341,
  "faceValue": "1000",
  "faceCurrency": "NGN"
}
```
(`GIFT_CARD` uses `productId`, `unitPrice`, optional `recipient` = wallet or `name.qie`.)

Server steps:
1. Check kill switch, country enabled, product in curated catalog.
2. Compute `supplierCostUsd` from fresh catalog data (cache ≤ 10 min).
3. `usdAmount = supplierCostUsd × (1 + MARGIN_BPS/10000)`, rounded up to 6 decimals.
4. Enforce limits (per order, per wallet per day, global per day).
5. Check supplier wallet balance ≥ `supplierCostUsd` + reserve of all currently `PAID`/`FULFILLING` orders. If not, respond `503 temporarily_unavailable`. Never sell what cannot be fulfilled.
6. If paying in QIE: `payAmount = usdAmount / qiePriceUsd × (1 + QIE_SPREAD_BPS/10000)`, rounded up. Read the QIE/USD oracle feed via RPC; refuse if the feed is older than `ORACLE_MAX_AGE_S`. Run the QIEDex price cross-check below; if it fails, respond `503 qie_price_unavailable` and suggest QUSDC. `qiePriceUsd = min(oracle price, QIEDex pool price)` (decided 17 Nov 2026): collected QIE can be converted only at the pool price, which was 5.1% below the oracle, so pricing from the oracle alone would sell below cost. Because the lower price is used, the user pays more QIE, never less, and the on-chain oracle guard still passes.
7. Generate `orderId = keccak256(random 32 bytes)`; store order as `QUOTED`.
8. Sign the EIP-712 `Quote` with `QUOTE_SIGNER_KEY`.

Response: `{ orderId, quote, signature, expiresAt, display: { usd, qie, faceValue, … } }`.

### QIEDex price cross-check (P0)

A second, independent QIE price from the chain's own DEX. It can **veto** a QIE quote, and since 17 Nov 2026 it can also **lower** the price used (`min(oracle, pool)`, step 6 above). It can never raise the price above the oracle.

1. Pair address from config (`QIEDEX_WQIE_QUSDC_PAIR`, recorded in `docs/probe-results.md`). At startup, read `token0()` and `token1()`; they must be exactly {`WQIE_ADDRESS`, `QUSDC_ADDRESS`}. If not, log, alert and treat the check as failing.
2. On each QIE quote (cached ≤ 15 s), read `getReserves()` and map the reserves to WQIE and QUSDC by token order.
3. `dexPriceUsd6 = reserveQusdc × 1e18 / reserveWqie` (QUSDC 6 decimals, WQIE 18 decimals; `bigint` math, no floats).
4. `deviationBps = |dexPriceUsd6 − oraclePriceUsd6| × 10_000 / oraclePriceUsd6`.
5. If `deviationBps > DEX_ORACLE_MAX_DEVIATION_BPS`, refuse the QIE quote.
6. Fail closed: if the pair read reverts, the reserves are zero, or the QUSDC reserve is below `DEX_MIN_RESERVE_QUSDC`, refuse the QIE quote. QUSDC quotes are never affected.
7. `DEX_PRICE_CHECK_ENABLED=false` turns the check off (ops switch, for example if the pool is drained). The on-chain oracle guard still protects QIE payments when it is off.

A manipulated pool can block QIE quotes for a while, or make a QIE quote up to `DEX_ORACLE_MAX_DEVIATION_BPS` more expensive for the user (who can decline or pay in QUSDC). It cannot make Qarta Pay sell below the oracle price. Log every refusal with both prices and alert if refusals last more than 10 minutes.

If the Step 1 probe finds no WQIE/QUSDC pair (`getPair` returns zero) or a pool below `DEX_MIN_RESERVE_QUSDC`, fail-closed would refuse every QIE quote from day one and turn off native-QIE payment. In that case: stop, write it in `10-OPEN-QUESTIONS.md`, and let the team decide between a lower `DEX_MIN_RESERVE_QUSDC` and `DEX_PRICE_CHECK_ENABLED=false`. Turning the check off is a human decision, not an agent default. The treasury sweep (if the router works) and the "Get QUSDC" link still cover QIEDEX.

`ORACLE_MAX_AGE_S` must be ≤ the contract's `maxOracleAge`; otherwise the backend signs quotes that revert at `pay`. Check it by reading `maxOracleAge` (and `refundTimeout`) from the contract on first use, not at startup (`src/chain/contract-limits.ts`): a slow RPC must not stop the API from serving config and catalog. Until the read succeeds, quotes return 503 `chain_unavailable` and the worker does not start deliveries; settle and refund do not wait for it. A config that contradicts the contract keeps quotes refused.

Tests: deviation just below / at / above the threshold, both token orders, zero reserves, reverted read, wrong `token0/token1` at startup, switch off, QUSDC quote unaffected when the check fails.

## Indexer

- viem `getLogs` for `OrderPaid`, `OrderSettled`, `OrderRefunded` on the checkout contract, from `IndexerCursor.lastProcessedBlock + 1` to `head − CONFIRMATIONS`.
- `CONFIRMATIONS` default 2. QIE is a Cosmos-SDK chain with fast finality **[VERIFIED: chain described as Cosmos SDK + EVM]**; exact finality behaviour through the EVM RPC is **[UNVERIFIED]**, hence a small buffer.
- Poll every 2–3 s. Chunk ranges (≤ 1,000 blocks) for catch-up. Rotate across RPC URLs on error (`rpc1`, `rpc2`, `rpc5` mainnet).
- Measured in Step 1 **[VERIFIED: `probe-results.md` §1]**: block time 3.63 s; `eth_getLogs` accepts at most 10,000 blocks per call; each RPC request took 3–7 s from our location, so the real poll interval is bounded by response time. All five hosts `rpc1`…`rpc5` answer.
- On `OrderPaid`: load order; verify `payer`, `token`, `amount` equal the stored quote; `QUOTED → PAID`. A mismatch or unknown `orderId` → log, alert, do not fulfil (the user can self-refund after the timeout; operator should `refund` sooner).
- Set `START_BLOCK` to the contract's deployment block. Keep it paired with the contract address in config, or the indexer will scan from genesis.

## Fulfilment worker

Loop: pick orders where `status IN (PAID, FULFILLING)` and `nextAttemptAt <= now`, lock with `SELECT … FOR UPDATE SKIP LOCKED`.

**Airtime / data**
1. `PAID → FULFILLING`; call `POST /topups-async` with `customIdentifier = orderId`; store `supplierTxId`.
2. Poll `GET /topups/{id}/status` with exponential backoff starting at 5 s, up to 30 min.
3. `SUCCESSFUL` → `DELIVERED` → send `settle(orderId)` → on receipt `SETTLED`.
4. `REFUNDED` (supplier returned our money) → `REFUND_PENDING` → send `refund(orderId)` → `REFUNDED`.
5. Still `PROCESSING` after 30 min, or ambiguous errors → `NEEDS_REVIEW` + alert.
6. Cutoff (both product kinds): before every supplier call or retry, check `now ≤ paidAt + refundTimeout − FULFIL_CUTOFF_BEFORE_TIMEOUT_S`. Past the cutoff, make no new supplier call: if no supplier call was ever sent for the order, go to the refund path; if one was sent and its outcome is unknown, mark `NEEDS_REVIEW`. This stops a late delivery from racing the payer's `claimRefund`.

**Gift cards**
1. `PAID → FULFILLING`; `POST /orders` with `customIdentifier = orderId`.
2. On success fetch the card code/PIN, encrypt with AES-256-GCM (`CODE_ENCRYPTION_KEY`), store ciphertext, → `DELIVERED` → `settle`.
3. On definite failure → refund path. On ambiguous failure (timeout, 5xx) → look the order up at the supplier before any retry; if still unknown → `NEEDS_REVIEW`.

**Transaction sending**: one fulfiller EOA, nonce managed in-process with a mutex; wait for receipt; on stuck tx resubmit with the same nonce. Alert when fulfiller gas balance is low.

## Pricing and limits (env-configurable)

| Var | Default | Meaning |
|-----|---------|---------|
| `MARGIN_BPS` | 200 | markup on supplier cost. 26 Nov 2026 decision: launch at the lowest fee that does not lose money. The supplier discount plus 2% should cover converting revenue back into the Reloadly float; raise it if a refill cycle shows otherwise |
| `QIE_SPREAD_BPS` | 150 | extra on native-QIE quotes |
| `CASHBACK_BPS` | 100 | accrued for eligible wallets (P1) |
| `MAX_ORDER_USD` | 50 | per order |
| `MAX_WALLET_DAILY_USD` | 100 | per wallet, raised for QIE-Pass-verified only (P1) |
| `MAX_GLOBAL_DAILY_USD` | 1000 | circuit breaker |
| `QUOTE_TTL_QUSDC_S` | 600 | |
| `QUOTE_TTL_QIE_S` | 90 | |
| `SALES_PAUSED` | false | kill switch |
| `ORACLE_MAX_AGE_S` | 86400 | refuse QIE quotes when the QIE/USD feed is older; must be ≤ contract `maxOracleAge`. Decided 17 Nov 2026: 86400, because the feed has no heartbeat and gaps reach 23 hours |
| `QIEDEX_WQIE_QUSDC_PAIR` | `0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe` (mainnet, from the probe) | QIEDex pair used by the price cross-check; `token0` = WQIE, `token1` = QUSDC |
| `DEX_ORACLE_MAX_DEVIATION_BPS` | 1500 | max pool-vs-oracle difference, in either direction, before QIE quotes are refused. Decided 17 Nov 2026 (measured that day: 514 bps, pool below oracle) |
| `FULFIL_CUTOFF_BEFORE_TIMEOUT_S` | 2700 | the worker does not start or retry a supplier call later than `paidAt + refundTimeout −` this value; it refunds instead (decided 17 Nov 2026) |
| `DEX_MIN_RESERVE_QUSDC` | 1000000000 (1,000 QUSDC, placeholder) | below this the pool is too thin to trust; QIE quotes refused. Measured reserve on 17 Nov 2026: 4,383.76 QUSDC |
| `DEX_PRICE_CHECK_ENABLED` | true | ops switch for the cross-check; only a human sets it to false |

Add each new variable to `.env.example` (with a dummy value) when the API workspace is scaffolded.

## Identity features

- **QIE ID, reverse (P0)**: resolve `wallet → primary name.qie` with the reverse resolver from `07-QIE-REFERENCE.md` (`resolve(address)`, **[VERIFIED: `probe-results.md` §5]**). The resolver is stale for names registered after mid-2026, so when it returns an empty string, call `userDomain(address)` on Registry B (`0x1D69…f62e`) **[VERIFIED]** before falling back to the short address. A wallet whose only name is in Registry A has no known reverse lookup. Serve it at `GET /v1/identity/:wallet`. Cache it in `WalletProfile.qieName` for 1 h, including "no name". It never gates payments, refunds, limits or code reveal. Its only other use is P1 cashback eligibility, which re-reads the name on-chain at accrual time instead of trusting the cache. If the call fails, return `null` and let the UI show the short address. Validate the returned string before storing or displaying it (non-empty, length ≤ 64, printable characters only). The resolver returns the full name with the suffix (`alice.qie`) and an empty string when the wallet has no primary name **[VERIFIED]**. Both calls return an empty string when they know no name; show the short address.
- **QIE ID, forward (P1)**: resolve `name.qie → address` for gifting. Query both forward registries with `resolver(string) returns (uint256 tokenId, address owner)` (the call the official app uses) or `domainExist(string)` and `domainInfo(string)` (full name including `.qie`); `domainInfo` returns `(string name, address nft, address owner, uint256 registeredAt, uint256 tokenId)` **[VERIFIED by live calls; the registries are not verified on the explorer, see `packages/shared/abi/README.md`]**. Take the current owner from `ownerOf(tokenId)` on the name NFT. Before accepting a gift recipient, check that reverse resolution of the result gives the same name, and show the resolved address to the payer before payment.
- **QIE Pass (P1)**: partner REST API with HMAC auth; needs partner keys (human task). Cache the result in `WalletProfile.passVerified`.
- **Cashback eligibility (P1)**: `isCashbackEligible(wallet) = passVerified || hasPrimaryQieName(wallet)`, where `hasPrimaryQieName` reads the reverse resolver on-chain at accrual time (not the 1 h cache). Implement it as two small checks (`QiePassVerifier`, `QieNameVerifier`) combined with OR, so cashback still ships on the `.qie` check alone if QIE Pass keys do not arrive. Raised limits (`MAX_WALLET_DAILY_USD`) use `passVerified` only, because anyone can buy a `.qie` name.
- **Cashback (P1)**: accrue `usdAmount × CASHBACK_BPS` in QIE terms on `SETTLED` for eligible wallets; pay out in a weekly batch from treasury (script, not automated hot-wallet logic). Show accrued balance in the UI.

## Stats (`/v1/stats`)

Total orders settled, total USD volume, unique paying wallets, repeat wallets (≥ 2 orders), 7-day actives, refund rate, median delivery time. Each number should be reproducible from on-chain events; link to the contract on the explorer.

## Observability

Structured logs (pino) with `orderId` on every line; never log gift card codes, full phone numbers, secrets or signatures. Alerts (Telegram bot message to the team chat is enough): order stuck > 10 min, `NEEDS_REVIEW`, supplier balance below threshold, fulfiller gas low, indexer lag > 60 s, QIE/USD feed older than `ORACLE_MAX_AGE_S`, QIE quotes refused by the QIEDex cross-check for > 10 min.

## Tests

- Unit: pricing/rounding, limits, quote signing (signature verifies against the contract in an anvil test), state transitions.
- Integration: anvil + deployed contract + Reloadly sandbox (or recorded fixtures): happy path, supplier refund path, duplicate event delivery, worker crash between supplier call and DB write (must not double-fulfil).
