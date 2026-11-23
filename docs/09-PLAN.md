# 09 — Build Plan (17 Nov → 30 Nov 2026)

14 days. Order of work is chosen so that the riskiest unknowns are resolved first and a mainnet purchase works by **25 Nov**, leaving five days for real users.

Legend: [agent] = coding agent, [human] = human on the team.

## Day 0 (17 Nov) — human tasks that block everything else [human]

Start these today; several have waiting time.

- [ ] Register the team on `hackathon.qie.digital`.
- [ ] Create a Reloadly account; copy **test** credentials; email `sales@reloadly.com`: who we are, hackathon project, reselling airtime and gift cards to end users paying in crypto, expected small volume, ask what they need from us to go live.
- [ ] Post the questions from `10-OPEN-QUESTIONS.md` §A in the QIE Telegram and email `info@qie.digital`.
- [ ] Request QIE Pass partner API keys (sandbox + production).
- [ ] Create wallets: `owner` (cold), `deployer`, `quoteSigner`, `fulfiller`, `treasury`. Record **addresses only** in `CLAUDE.local.md`. Import `treasury` into a Foundry encrypted keystore (`cast wallet import qarta-treasury --interactive`) for the sweep script.
- [ ] Find a wallet address that owns a primary `.qie` name (a team member can buy one at `https://id.qie.digital/`); the agent needs it to probe the reverse resolver.
- [ ] Get testnet QIE from the faucet for `deployer` and one test user wallet.
- [ ] Buy a small amount of mainnet QIE and QUSDC for testing (≈ $20–30).
- [ ] Buy the domain; create Vercel + backend hosting + Postgres projects; create the private GitHub repo (make it public before submission).
- [x] Decide launch countries: every country Reloadly lists, minus sanctioned ones (23 Nov 2026).

## Step 1 (17–18 Nov) — scaffold and probe [agent]

Status 17 Nov 2026: done, except the sandbox run of the Reloadly script (waits for test credentials) and the testnet PUSH0 / `forge verify-contract` checks (wait for a funded testnet key). See `12-STATUS.md`.

1. Monorepo scaffold (`pnpm`, workspaces, TypeScript strict, ESLint, Prettier, CI running lint + typecheck + tests + gitleaks).
2. `contracts/` Foundry project, OpenZeppelin v5, `evm_version = "paris"`.
3. Run the probe checklist in `07-QIE-REFERENCE.md`; write results to `docs/probe-results.md`; update the `[UNVERIFIED]` items in the docs with real answers.
4. Reloadly sandbox smoke script: token → balance → auto-detect a number → async top-up → status; gift card products → order → fetch code. Save responses as fixtures.

**Done when:** `docs/probe-results.md` exists with:
- QUSDC decimals; oracle decimals + freshness; PUSH0 answer
- QIE ID reverse resolver: does `resolve(address)` return the name for the known wallet? (If not: write it in `10-OPEN-QUESTIONS.md`, ask QIE for the ABI, and try the verified forward registry's ABI on the explorer for a reverse function.)
- QIEDex WQIE/QUSDC pair: address from `getPair`, `token0()`/`token1()`, `getReserves()` (needed for the P0 price cross-check)
- QIEDex router: answers `factory()`, `getAmountsOut`, and the exact name of its exact-native-in swap function (needed for the P0 sweep)
- In-tx swap **GO/NO-GO** per the decision rule in `04-SMART-CONTRACTS.md` (decides only the P1 in-tx swap)

The sandbox script passes.

## Step 2 (18–20 Nov) — contract + sweep script [agent]

1. `QartaCheckout` per `04-SMART-CONTRACTS.md`, P0 functions including the **oracle guard** (owner-configurable tolerance and max age, owner switch `oracleGuardEnabled`).
2. Full unit + fuzz/invariant tests, including every oracle-guard case listed in `04`; fork tests against mainnet for QUSDC and the real QIE/USD feed.
3. `script/SweepTreasury.s.sol` (QIEDex treasury sweep) with unit tests against `MockRouter` + `MockAggregatorV3` and `test/fork/SweepTreasury.t.sol` against the real router.
4. Deploy script; deploy to **testnet** with mocks; export ABI and addresses to `packages/shared`.

**Done when:** `forge test` green incl. fork tests; the sweep fork test swaps on the real QIEDex router and the treasury receives ≥ `minOut` QUSDC (or, if the router failed the probe, the finding and the manual-UI fallback are written in `10-OPEN-QUESTIONS.md`); testnet address recorded; a manual `pay → settle` and `pay → refund` executed on testnet with `cast`, plus one native `pay` rejected by the oracle guard.

- [ ] [human] Review the contract line by line. This is the part the team must be able to explain in the demo.
- [ ] [human] Review the sweep script and its fork simulation output. It moves treasury money on mainnet.

## Step 3 (20–22 Nov) — backend [agent]

Status 18 Nov 2026: built and tested on anvil with the fake supplier (`05-BACKEND.md` "As built"). Not yet run on testnet with the Reloadly sandbox: needs the testnet deploy and sandbox credentials.

1. Database schema + migrations (built with `pg` + SQL, see `05-BACKEND.md` "As built").
2. Reloadly client (typed, token cache, retries with idempotent lookups).
3. Catalog endpoints with caching and the curated list.
4. `POST /v1/quotes` with pricing, limits, balance check, EIP-712 signing.
5. QIE price path: oracle read with max age + **QIEDex price cross-check** (pair reserves vs oracle, `DEX_ORACLE_MAX_DEVIATION_BPS`, fail closed); `GET /v1/prices`.
6. `GET /v1/identity/:wallet` (`.qie` reverse resolution, cached in `WalletProfile`).
7. Indexer; fulfilment worker; settle/refund sender.
8. Integration tests (anvil + sandbox fixtures) including crash/duplicate scenarios; unit tests for the cross-check cases listed in `05`.

**Done when:** on testnet + sandbox, a scripted run does quote → pay → delivered → settled, and a forced supplier failure ends in an on-chain refund, with no manual steps. A QIE quote is refused when the (mocked) pool price is off by more than the threshold, while a QUSDC quote still succeeds. A fork read of the real WQIE/QUSDC pair returns a deviation value. `/v1/identity` returns the name for the known `.qie` wallet on a fork. (If the Step 1 probe failed for the pair or the resolver, the fallback from `05` is implemented and recorded in `10-OPEN-QUESTIONS.md` instead.)

## Step 4 (21–24 Nov, overlaps step 3) — frontend [agent]

Status 18 Nov 2026: built; full flow checked against the local stack (`pnpm dev:local`). Not yet tested by a non-developer on a phone.

1. Wallet connect (QIE Wallet first, then MetaMask), network switch/add.
2. Wallet chip and history header show the `.qie` name (short address fallback).
3. Airtime flow, gift card flow, checkout, order status with live timeline, history.
4. QIE pay option disabled with a reason when `qieQuotesEnabled = false`; "Get QUSDC" link to QIEDex next to the balance and at checkout when the balance is short.
5. SIWE session + reveal code.
6. `claimRefund` button for timed-out orders.
7. Stats, How-it-works and **Powered by QIE** pages.

**Done when:** a non-developer completes both flows on a phone against testnet without help. The Powered by QIE page shows live oracle and QIEDex prices and every address with a working explorer link.

## Step 5 (24–25 Nov) — mainnet go-live (soft launch)

- [ ] [human] Fund Reloadly live wallet with a small float ($100–300) once sales has answered.
- [ ] [agent] Prepare the mainnet deploy command (`oracleGuardEnabled = true`); [human] runs it, transfers ownership to the cold wallet, verifies source on the explorer.
- [ ] [agent] Production deploy of API and web with live env vars; limits low (`MAX_ORDER_USD=10`).
- [ ] [human] Team dogfood: every member makes real purchases (airtime to own phone, one gift card), in QUSDC and in QIE. Test a refund on purpose.
- [ ] [human] First mainnet treasury sweep: run the fork simulation, then broadcast a small chunk with `--account qarta-treasury`. Record the tx hash for the README and the demo.
- [ ] [agent] Fill the README "QIE integrations" table with the mainnet `QartaCheckout` address and real file paths.
- [ ] [agent] Fix what breaks. Alerts wired to the team chat.

**Done when:** 10+ real mainnet orders settled, 1 real refund, zero stuck orders, contract verified, 1 real native-QIE order passed the on-chain oracle guard, 1 real QIEDex sweep tx (or the manual-UI fallback documented), Powered by QIE page live.

## Step 6 (26–29 Nov) — public launch + P1

Traction ([human], starts 26 Nov morning):
- Announce in the QIE Telegram and X with a 30-second screen recording.
- Ask the QIE team to pin/retweet (they benefit from "first place to spend QIE").
- Launch promo funded from margin (e.g. first top-up cashback), within limits.
- Collect feedback in a public group; answer every message quickly.

P1 features ([agent]), in this order, each shippable alone:
1. Cashback: eligibility = QIE Pass verified **or** owns a primary `.qie` name; accrual + UI. Ship on the `.qie` check alone if QIE Pass keys have not arrived; add `QiePassVerifier` when they do. Raised limits stay Pass-only.
2. Gift to `name.qie` (forward resolution, with the reverse check from `05`).
3. QIEDex in-tx swap **only if** the Step 1 probe returned GO.
4. Telegram receipts bot.

Each day: raise limits gradually if no incidents; top up the Reloadly float; [human] sweep treasury QIE → QUSDC with `SweepTreasury.s.sol`.

## Step 7 (29–30 Nov) — submission

- [ ] README final (see checklist in `02-HACKATHON.md`), architecture diagram, "QIE integrations" table (component → what it does for the user → file path → contract address), checked against the code and the Powered by QIE page.
- [ ] Demo video: problem (15 s) → live purchase on mainnet from a phone (60 s) → escrow/refund + explorer (30 s) → QIE integrations via the Powered by QIE page: `.qie` name, oracle guard, QIEDex cross-check + sweep tx, Get QUSDC (30 s) → traction numbers (15 s).
- [ ] Repo public; no secrets in history (`gitleaks detect`).
- [ ] **Freeze 30 Nov 18:00 CET.** Submit the form: repo, live URL, contract address, track. Screenshot the confirmation.

## Demo week (1–5 Dec)

- Keep float funded, alerts on, someone on call during the demo slot.
- Rehearse the live purchase; have a recorded fallback.
- Be ready to explain: the escrow trust model, what happens on every failure path, exactly where each QIE component is used, how AI tools were used and what the team wrote and reviewed.

## Cut list (if behind schedule, drop in this order)

No QIE integration is cut before data bundles.

1. Telegram bot
2. Data bundles (keep plain airtime) — **cut on 18 Nov 2026**: airtime and gift cards ship first; data bundles need operator-specific plan handling
3. QIEDex in-tx swap (QIEDEX stays covered by the sweep, cross-check and Get QUSDC link)
4. Cashback payout (keep eligibility + accrual display)
5. Gift-to-`name.qie` (QIE ID stays covered by name display)

Never cut: escrow + refund paths, limits, stats page, tests on the contract.

Never cut for schedule reasons: oracle guard, `.qie` name display, QIEDex price cross-check, treasury sweep script, Get QUSDC link, Powered by QIE page. If a Step 1 probe shows one of them cannot work (resolver, pair or router does not behave as documented), follow the fallback written in `04`/`05` and record it in `10-OPEN-QUESTIONS.md`; that is not a cut.

If QIE Pass keys never arrive, that is not a cut: cashback eligibility runs on the `.qie` check alone.
