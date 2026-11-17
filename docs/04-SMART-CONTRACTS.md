# 04 — Smart Contracts

One contract: `QartaCheckout`. Keep it small, readable and fully tested. It holds user money.

## Responsibilities

1. Accept payment in QUSDC or native QIE against a quote signed by the backend.
2. Hold the payment in escrow per order.
3. Release to treasury on `settle`, or return to payer on `refund`.
4. Let the payer reclaim funds after a timeout if neither happened.
5. Sanity-check native-QIE payments against the QIE/USD oracle (P0, owner switch).
6. (P1, only on GO) Optionally swap native QIE to QUSDC through QIEDex inside the payment.

Outside the contract, a Foundry script converts treasury QIE to QUSDC through QIEDex (P0, see "Treasury sweep" below). It does not touch escrowed funds.

## Roles

| Role | Held by | Can do |
|------|---------|--------|
| `owner` | cold wallet | set signer/fulfiller/treasury/oracle/limits, pause, rescue stray tokens (never escrowed funds) |
| `quoteSigner` | backend key A | nothing on-chain; its signature authorises a price |
| `fulfiller` | backend key B (hot, holds a little QIE for gas) | `settle`, `refund` |
| `treasury` | separate wallet | receives settled funds |

Use OpenZeppelin `Ownable2Step`, `Pausable`, `ReentrancyGuard`, `SafeERC20`, `EIP712`, `ECDSA`.

## Quote (EIP-712)

```solidity
struct Quote {
    bytes32 orderId;     // random 32 bytes from backend, unique
    address payer;       // must equal msg.sender
    address token;       // address(0) = native QIE, else allowed ERC-20 (QUSDC)
    uint256 amount;      // token base units (QUSDC: 6 decimals [VERIFIED on-chain]; QIE: 18)
    uint256 usdAmount;   // 6 decimals; used for the oracle check and events
    uint64  expiry;      // unix seconds
}
```

Domain: `name = "QartaCheckout"`, `version = "1"`, `chainId`, `verifyingContract`.

## Storage

```solidity
enum Status { None, Paid, Settled, Refunded }
struct Escrow { address payer; address token; uint256 amount; uint64 paidAt; Status status; }
mapping(bytes32 => Escrow) public orders;
mapping(address => bool) public allowedToken;   // QUSDC = true
uint64  public refundTimeout;                   // default 2 hours
```

## Functions

```solidity
function pay(Quote calldata q, bytes calldata sig) external payable nonReentrant whenNotPaused;
function settle(bytes32 orderId) external onlyFulfiller nonReentrant;
function refund(bytes32 orderId) external onlyFulfiller nonReentrant;
function claimRefund(bytes32 orderId) external nonReentrant;   // payer only, after refundTimeout
```

`pay` checks, in this order:

1. `block.timestamp <= q.expiry`
2. `q.payer == msg.sender`
3. `orders[q.orderId].status == Status.None`
4. signature recovers to `quoteSigner`
5. token rules:
   - native: `q.token == address(0)` and `msg.value == q.amount`
   - ERC-20: `allowedToken[q.token]` and `msg.value == 0`
6. oracle guard for native payments when `oracleGuardEnabled`, see below
7. write escrow (effect)
8. ERC-20 only (interaction, after the escrow is written): `safeTransferFrom(msg.sender, address(this), q.amount)`; measure the balance before and after and require the received amount equals `q.amount` (guards against fee-on-transfer surprises). A revert here undoes the escrow write.
9. emit event

The order above was corrected on 17 Nov 2026: the first draft transferred the token before writing the escrow, which broke checks-effects-interactions.

`settle`: status must be `Paid` → set `Settled` → transfer to `treasury`.
`refund`: status must be `Paid` → set `Refunded` → transfer to `payer`.
`claimRefund`: `msg.sender == payer`, status `Paid`, `block.timestamp >= paidAt + refundTimeout` → refund.

Follow checks-effects-interactions. Native transfers use `call` with the result checked. `refund` and `claimRefund` must never be blocked by `pause` (users can always get money out).

## Events

```solidity
event OrderPaid(bytes32 indexed orderId, address indexed payer, address indexed token, uint256 amount, uint256 usdAmount);
event OrderSettled(bytes32 indexed orderId);
event OrderRefunded(bytes32 indexed orderId, address indexed to, uint256 amount, bool byPayer);
```

## Why approve + pay (and not permit)

QUSDC does not implement EIP-2612 `permit`: `DOMAIN_SEPARATOR()` and `nonces(address)` both revert, and the verified source is a plain OpenZeppelin v5.1 ERC-20 **[VERIFIED: `probe-results.md` §2]**. The flow is the two-step `approve` then `pay`; there is no `payWithPermit`.

## P0 — Oracle guard (QIE Oracle)

QIE price feeds are AggregatorV3-compatible (`latestRoundData()`, `decimals()`). **[VERIFIED: QIE Oracle docs]** QIE/USD feed address is in `07-QIE-REFERENCE.md`.

For native payments:

```
(, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
require(answer > 0);
require(block.timestamp - updatedAt <= maxOracleAge);
uint256 paidUsd6 = q.amount * uint256(answer) / 10**feedDecimals / 1e12;   // 18-dec QIE → 6-dec USD
require(paidUsd6 * 10_000 >= q.usdAmount * (10_000 - oracleToleranceBps));
```

- `feedDecimals`: read with `decimals()` at deploy time. The QIE/USD feed returns 8 **[VERIFIED: `probe-results.md` §3]**.
- Update frequency: the docs say "every few minutes", but the feed has no heartbeat. Measured over rounds 20215–20239 (11–16 Nov 2026): median gap about 3 hours, longest gap 23 h 12 min, largest step between rounds +8.5% **[VERIFIED: `probe-results.md` §3]**. A `maxOracleAge` near 900 s would reject almost every native payment. **Decided 17 Nov 2026 (team):** deploy with `maxOracleAge` = 86,400 s and `oracleToleranceBps` = 1,000 (`10-OPEN-QUESTIONS.md` §F). With these values the guard is a floor against a wildly wrong quote; it does not prove the price is fresh. Make `maxOracleAge` and `oracleToleranceBps` owner-configurable, and add an owner switch `oracleGuardEnabled` so a stale feed cannot halt sales.
- The guard protects against a leaked or buggy quote signer selling at a wildly wrong QIE price. It is a floor, not the pricing source.
- The guard is P0. Deploy to mainnet with `oracleGuardEnabled = true`. The owner turns it off only if the feed is stale for longer than `maxOracleAge` in production; record every toggle in the runbook. QUSDC payments never read the oracle.
- Storage: `address public oracle; uint8 public oracleDecimals; uint32 public maxOracleAge; uint16 public oracleToleranceBps; bool public oracleGuardEnabled;`. Setters are `onlyOwner` and emit an event. Revert with custom errors `OracleStale()`, `OracleBadAnswer()`, `PriceBelowOracle()`.
- On testnet use `MockAggregatorV3`; the fork test reads the real QIE/USD feed.

## P0 — Treasury sweep via QIEDex (`contracts/script/SweepTreasury.s.sol`)

Goal: convert native QIE that `settle` sent to `treasury` into QUSDC through the QIEDex router. This removes price risk and gives a real, explorer-visible QIEDEX integration. It does not depend on the in-tx swap GO/NO-GO decision, because a batched, human-run sweep can tolerate thinner liquidity than a per-order swap.

It is a Foundry script, not contract code. It runs from the `treasury` wallet's encrypted keystore and never touches `QartaCheckout` or escrowed funds.

Inputs (env, no defaults that hold funds):

| Var | Meaning |
|-----|---------|
| `SWEEP_AMOUNT_WEI` | QIE to swap in this run. Sweep in chunks small enough that one chunk moves the pool price < 1%: at the reserves measured on 17 Nov 2026 that is at most about 130 QIE (about $20). |
| `SWEEP_MAX_SLIPPAGE_BPS` | Max shortfall vs the oracle price, default 700 (decided 17 Nov 2026: the pool traded 514 bps below the oracle, plus the 0.30% fee) |
| `SWEEP_GAS_RESERVE_WEI` | QIE left in treasury for gas; the script aborts if the swap would go below it |
| `SWEEP_MAX_ORACLE_AGE_S` | Max feed age the script accepts, default 86,400 (decided 17 Nov 2026; measured feed gaps reach 23 hours) |
| `TREASURY_ADDRESS` | sender and recipient of the swap |
| `QIEDEX_ROUTER`, `WQIE_ADDRESS`, `QUSDC_ADDRESS`, `QIE_USD_FEED` | from `07-QIE-REFERENCE.md`, confirmed by the probe |

Steps:

1. Read the QIE/USD feed. Abort if `answer <= 0` or the feed is older than `SWEEP_MAX_ORACLE_AGE_S`.
2. `oracleOut = amount × answer / 10**feedDecimals / 1e12` (18-dec QIE → 6-dec QUSDC, rounded down).
3. `minOut = oracleOut × (10_000 − SWEEP_MAX_SLIPPAGE_BPS) / 10_000`. `minOut` is bound to the oracle, not to the router's own quote, so a skewed pool cannot set its own floor.
4. Call `getAmountsOut(amount, [WQIE, QUSDC])`. If the router's quote is below `minOut`, abort with a message ("pool is off-price; use a smaller chunk or wait"). Send nothing.
5. Call the router's exact-native-in swap with `minOut`, path `[WQIE, QUSDC]`, recipient `treasury`, deadline `now + 300 s`. The function is `swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)` **[VERIFIED: read-only `eth_call` on mainnet and a swap on an anvil fork, `probe-results.md` §4]**.
6. Log QIE and QUSDC balances before and after.

Running it:

```bash
# 1. Simulation on a mainnet fork (agent may run this; nothing is broadcast)
forge script script/SweepTreasury.s.sol --fork-url $QIE_MAINNET_RPC --sender $TREASURY_ADDRESS -vvvv
# 2. Mainnet (human only, after reviewing the simulation output)
forge script script/SweepTreasury.s.sol --rpc-url $QIE_MAINNET_RPC --account qarta-treasury --broadcast
```

Gate (separate from the in-tx swap decision rule below): the sweep ships when the fork test performs a real swap against the QIEDex router and the treasury receives at least `minOut` QUSDC. If the router does not answer `getAmountsOut` or an exact-native-in swap on the fork, the sweep cannot ship. Write the finding in `10-OPEN-QUESTIONS.md`. The treasury then swaps by hand in the QIEDex web UI. QIEDEX is still covered by the price cross-check (it needs only the pair's `getReserves()`, `token0()`, `token1()`) and the "Get QUSDC" link.

## P1 — In-transaction swap via QIEDex (ships only on GO)

Goal: user pays native QIE, contract swaps to QUSDC immediately, escrow is held in QUSDC (removes price risk, adds QIEDex integration).

Known: Router `0x08cd…53Ef`, Factory `0x8E23…398C`, WQIE `0x0087…9139` **[VERIFIED: QIEDex docs]**. The router is **not verified** on the explorer and its ABI is not published **[VERIFIED: explorer API]**. Its bytecode has exactly the 24 selectors of Uniswap V2 `Router02`, and `factory()`, `WETH()`, `getAmountsOut` and `swapExactETHForTokens` behave as in V2 **[VERIFIED: `probe-results.md` §4]**. Swap fee 0.30%. WQIE/QUSDC pair: `0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe` (`token0` = WQIE, `token1` = QUSDC).

**Decision, 17 Nov 2026: NO-GO.** The pool holds about 29,826 WQIE and 4,384 QUSDC. A $50 swap moves the pool price 2.23% and loses 1.43% against the pool price (fee included); the rule below needs under 1%. The pool also trades 5.14% below the oracle. Escrow stays in native QIE. Re-run the probe before reconsidering.

Before writing any swap code, probe on a mainnet fork:

```bash
cast call $ROUTER "factory()(address)" --rpc-url $QIE_RPC
cast call $ROUTER "WETH()(address)"    --rpc-url $QIE_RPC     # may be named differently
cast call $FACTORY "getPair(address,address)(address)" $WQIE $QUSDC --rpc-url $QIE_RPC
cast call $PAIR "getReserves()(uint112,uint112,uint32)" --rpc-url $QIE_RPC
cast call $ROUTER "getAmountsOut(uint256,address[])(uint256[])" 1000000000000000000 "[$WQIE,$QUSDC]" --rpc-url $QIE_RPC
```

Decision rule (in-tx swap only, GO/NO-GO):

- **GO** if the router answers the Uniswap-V2 selectors and the WQIE/QUSDC pool has enough depth that a $50 order moves the price < 1%: implement `payWithQieSwap(Quote q, bytes sig, uint256 minQusdcOut)` using the router's exact-native-in swap (or exact-out, refunding dust), verified by fork tests.
- **NO-GO** otherwise: skip the in-tx swap. Keep escrow in native QIE. Do not put an unverified router in the payment path that the tests cannot fully exercise. NO-GO does not remove QIEDEX from P0: the treasury sweep, the price cross-check and the "Get QUSDC" link stay, each with its own gate described above.

## Price risk on native payments (when not swapping in-tx)

- Short quote expiry for QIE quotes (90 s), longer for QUSDC (10 min).
- Add a volatility buffer to QIE quotes (`QIE_SPREAD_BPS`, start 150).
- Treasury sweep to QUSDC through QIEDex (`SweepTreasury.s.sol`) at least daily during the hackathon.

## Tests (Foundry) — minimum set

Unit:
- pay QUSDC happy path; pay native happy path
- wrong signer; expired quote; replayed `orderId`; `payer != msg.sender`; token not allowed; `msg.value` mismatch; value sent with ERC-20 quote
- settle: only fulfiller; only from `Paid`; funds reach treasury
- refund: only fulfiller; only from `Paid`; funds reach payer
- claimRefund: before timeout reverts; after timeout works; non-payer reverts; after settle reverts
- pause blocks `pay` only; refunds still work while paused
- reentrancy attempt via malicious payer contract on native refund
- oracle guard: stale feed, zero/negative answer, under-priced quote, quote exactly at the tolerance edge, guard disabled (pays without reading the feed), QUSDC payment ignores a broken feed, setters only by owner, refunds still work when the feed reverts
- signature malleability / cross-chain replay (different `chainId`, different contract address)

Sweep script (unit, against `MockRouter` + `MockAggregatorV3`):
- happy path: treasury receives ≥ `minOut` QUSDC
- aborts on stale or non-positive oracle answer
- aborts when the router quote is below the oracle-bound `minOut` (no swap sent)
- aborts when the swap would leave less than `SWEEP_GAS_RESERVE_WEI`
- recipient is always `treasury`

Fuzz / invariant:
- contract balance per token == sum of amounts of orders in `Paid` status
- an order can leave `Paid` only once

Fork (`--fork-url $QIE_MAINNET_RPC`):
- pay with real QUSDC (impersonate a holder with `vm.prank` + `deal`)
- read the real QIE/USD feed; oracle guard accepts a correctly priced native quote and rejects an under-priced one
- `test/fork/SweepTreasury.t.sol` (P0): `vm.deal` QIE to the treasury, run the sweep against the real QIEDex router, assert QUSDC received ≥ `minOut`
- (P1, only on GO) real QIEDex swap inside `payWithQieSwap`

## Deployment

- Testnet first (chain 1983) with mocks for QUSDC and the feed.
- Mainnet (chain 1990): constructor args from env; after deploy, `owner` is transferred to the cold wallet (`Ownable2Step`).
- Use Foundry's encrypted keystore, never a raw private key in a file:
  `cast wallet import qarta-deployer --interactive` then `forge script … --account qarta-deployer`.
- The latest block has `baseFeePerGas` (1 gwei) and `eth_maxPriorityFeePerGas` answers, so EIP-1559 transactions should work **[VERIFIED at RPC level; no real transaction sent yet]**. If a broadcast is rejected, add `--legacy`.
- Verification: the explorer is Blockscout v7.0.2 with the Etherscan-compatible API live at `/api` **[VERIFIED]**. Use
  `forge verify-contract <addr> src/QartaCheckout.sol:QartaCheckout --verifier blockscout --verifier-url https://mainnet.qie.digital/api/ --chain-id 1990` **[UNVERIFIED: command not run yet; test on testnet with `https://testnet.qie.digital/api/` and `--chain-id 1983`]**; fall back to the explorer's manual "verify contract" form with flattened source (`forge flatten`).
- Record addresses in `packages/shared/src/deployments.ts` and in the README.

## Implementation notes (Step 2, 17 Nov 2026)

`contracts/src/QartaCheckout.sol` follows this spec with these additions and choices. Each one is covered by a test.

| Item | What the code does | Why |
|------|--------------------|-----|
| OpenZeppelin version | Pinned to **5.1.0** | 5.6 uses `mcopy` (Cancun), which QIE does not support. 5.1.0 is also what QUSDC on mainnet was built with |
| `refundTimeout` | `immutable`, set in the constructor, must be 30 min – 7 days | The backend's fulfilment cutoff is derived from it; it must not change under live orders |
| `totalEscrowed[token]` | Per-token sum of all `Paid` orders | Lets `rescue` prove it never touches escrow, and backs the invariant test |
| `rescue(token, to, amount)` | Owner may take at most `rescuable(token)` = balance − `totalEscrowed` | Recovers tokens sent by mistake without any path to escrowed funds |
| `amount == 0` | Rejected with `ZeroAmount()` | An empty order would block its `orderId` for nothing |
| Native coin sent without `pay` | Rejected (no `receive`/`fallback`) | Stray QIE can still be forced in; `rescue` handles it |
| Oracle timestamp in the future | Treated as stale (`OracleStale()`) | Avoids an underflow panic and is as untrustworthy as an old answer |
| Oracle guard on with no feed | Constructor and `setOracleGuardEnabled(true)` revert with `OracleNotSet()` | The guard can never be "on" but unable to run |
| `oracleToleranceBps` | At most 5,000 | A typo cannot turn the floor into nothing |
| `renounceOwnership` | Disabled | Without an owner a leaked signer or fulfiller key could never be rotated |
| Signature check | `ECDSA.tryRecover`; malleable high-`s` signatures and wrong lengths fail as `InvalidSignature()` | Covered by tests |
| `hashQuote(q)` | Public view returning the EIP-712 digest | The backend and tests sign exactly what the contract checks |
| `pay` order | Checks → escrow write → ERC-20 transfer → received-balance check → event | Checks-effects-interactions (corrected order above) |

Tests (`forge test`): 66 unit and fuzz tests (`test/QartaCheckout.t.sol`), 3 invariants over random pay/settle/refund/claim/time sequences with `fail_on_revert` (`test/QartaCheckout.invariant.t.sol`), 13 sweep-script tests against the mocks (`test/SweepTreasury.t.sol`), and a fixed EIP-712 vector (`test/QuoteDigest.t.sol`) that `packages/shared/src/eip712.test.ts` also asserts. Fork tests (`pnpm --filter contracts test:fork`, pinned to block 11961896): real QUSDC pay/settle/refund, the real feed accepting a correctly priced and rejecting an under-priced native quote, and the sweep swapping on the real QIEDex router.

At the pinned block a 130 QIE sweep chunk was quoted 584 bps below the oracle, inside the 700 bps default.

`script/rehearse.sh` runs the "Done when" sequence of `09-PLAN.md` Step 2 on a local anvil: pay → settle, pay → refund, an under-priced native pay rejected by the guard, a correctly priced one accepted.

### Slither (0.11, 17 Nov 2026) — 9 findings, all accepted

| Finding | Verdict |
|---------|---------|
| `arbitrary-send-eth` in `_send` | Intended. The recipient is always the treasury, the order's payer, or the owner's `rescue` target |
| `divide-before-multiply` in the oracle guard | Intended. `paidUsd6` is rounded down before the comparison, which errs against the payer by at most $0.000001 |
| `unused-return` on `tryRecover` and `latestRoundData` | Intended. Only the needed fields are read |
| `timestamp` (3) | Intended. Quote expiry, refund timeout and feed age are minutes to hours; validator drift does not matter |
| `cyclomatic-complexity` of `pay` | Accepted. The branches are the listed checks |
| `low-level-calls` in `_send` | Intended. Native transfers use `call` with the result checked |

## Out of scope

Upgradeability (no proxies; redeploy and point the backend at the new address if needed), own token, on-chain cashback.
