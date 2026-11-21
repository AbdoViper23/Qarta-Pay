# 12 — Status and Handoff

Read this first if you are picking the project up, human or agent. It says where the work stands, what was decided, and what is blocked on whom. Update it at the end of every working session.

Last updated: **22 Nov 2026**.

## Where we are

| Plan step (`09-PLAN.md`) | State |
|--------------------------|-------|
| Step 1 — scaffold and probe | Done. Reloadly sandbox run 21 Nov 2026: gift cards end to end, airtime catalog; airtime top-up still to record |
| Step 2 — contract + sweep script | Code and tests done. **Deployed and verified on testnet** (19 Nov, `probe-results.md` §7). Waits for: team review of the contract and sweep script |
| Step 3 — backend | Tested end to end on anvil and **on testnet** (fake supplier): QUSDC and QIE orders settled, failed delivery refunded on-chain. Waits for: Reloadly sandbox credentials to run it against the real supplier |
| Hosting | **Vercel free plan**, one project `qarta-pay` (web + API as Vercel Services, Neon Postgres), on testnet with the fake supplier until Reloadly sandbox credentials exist. No background loops there: requests and a cron drive the jobs (`13-RUNBOOK.md` §3) |
| Step 4 — frontend | Built; full flow checked against the local stack. Waits for: a non-developer test on a phone, and a test inside QIE Wallet |
| Step 5 — mainnet go-live | Commands ready in `13-RUNBOOK.md`. Waits for: Reloadly live approval and float, wallets, hosting, domain |
| Steps 6–7 — launch, P1, submission | Not started. P1 (cashback, gift to `name.qie`, Telegram bot) is not built |

**The product works end to end on a local chain today:** `pnpm dev:local` starts the chain, contracts, database, API and web app; a quote → pay → deliver → settle run through the HTTP API was checked on 18 Nov 2026.

## What exists in the repo

| Path | What it is |
|------|------------|
| `contracts/` | `QartaCheckout` (escrow + oracle guard), mocks (`MockERC20`, `MockAggregatorV3`, `MockRouter`, `MockPair`), `Deploy.s.sol`, `SweepTreasury.s.sol`, `rehearse.sh`, `probe.sh`; unit, fuzz, invariant and mainnet-fork tests. OpenZeppelin pinned to 5.1.0 (5.6 uses Cancun `mcopy`, which QIE lacks) |
| `apps/api/` | API + indexer + fulfilment worker in one process. See `05-BACKEND.md` "As built". Operator tool `scripts/review.ts`, local DB `scripts/dev-db.ts`, Reloadly sandbox smoke `scripts/reloadly-smoke.ts`, `Dockerfile` |
| `apps/web/` | Storefront. See `06-FRONTEND.md` "As built" |
| `packages/shared/` | Chain config and addresses (`config/*.json`), ABIs (QartaCheckout generated from the build), EIP-712 `Quote` types |
| `scripts/dev-local.sh` | Whole stack locally, no credentials |
| `docs/13-RUNBOOK.md` | Deploy, hosting, operations |
| `docs/research-notes.md`, `docs/probe-results.md` | Evidence for every chain and supplier fact |

## How to check it

```bash
export PATH="$PATH:$HOME/.foundry/bin"
pnpm install && (cd contracts && forge build)
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter contracts test:fork
pnpm dev:local
```

Last full run (18 Nov 2026): lint and typecheck clean; contracts 81 unit/fuzz/invariant tests + 12 fork tests pass; API 54 tests pass (unit + integration on anvil and embedded PostgreSQL); web 7 tests pass and `next build` succeeds.

Not verified yet: the Reloadly client against the real sandbox (only against a fake fetch built from the official OpenAPI spec); the Docker image (Docker is not installed on the dev machine); CI on GitHub (no remote yet); the UI on a phone and in the QIE Wallet browser.

## Facts every contributor must know (details in `research-notes.md`)

1. **Oracle.** QIE/USD feed has 8 decimals and no heartbeat; gaps between updates reach 23 hours.
2. **QIEDex.** Uniswap V2 fork, fee 0.30%, native-in swap is `swapExactETHForTokens`. The WQIE/QUSDC pool is small (about $8.8k) and traded 5.1% below the oracle.
3. **In-tx swap is NO-GO.** Escrow stays in native QIE.
4. **QUSDC.** 6 decimals, no permit, total supply about 9,022. Most users will pay in native QIE.
5. **QIE ID.** Wallet → name: resolver `resolve(address)`, then registry B `userDomain(address)`. Wallets with a name only in registry A show the short address.
6. **Chain.** Shanghai-level EVM (compile with `paris`), 3.63 s blocks, `eth_getLogs` max 10,000 blocks, public RPC answers in 3–7 s.
7. **Hackathon.** AI-assisted development is encouraged; a demo video and a team presentation are mandatory.

## Decisions taken

17 Nov 2026 (`10-OPEN-QUESTIONS.md` §F): contract `maxOracleAge` 86,400 s and `oracleToleranceBps` 1,000; QIE quotes priced at `min(oracle, pool)`; cross-check threshold 1,500 bps; sweep slippage 700 bps in ~130 QIE chunks; fulfilment cutoff 45 min before `refundTimeout` (2 h); Node 22; in-tx swap NO-GO.

18 Nov 2026 (agent, within "do what you see right"):
- Database access with `pg` and SQL migrations instead of Prisma; `embedded-postgres` for local runs and tests (no Docker on the dev machine).
- Data bundles cut (cut list item 2); airtime and gift cards ship first.
- A fake supplier (`SUPPLIER=fake`) for tests and the local demo; refused on mainnet.
- Unknown supplier outcome after a lookup finds nothing for 2 minutes → `NEEDS_REVIEW` (never resend). Resolved with `pnpm --filter api review`.

## Waiting on a human — in the order the work needs it

Click-by-click instructions for each task: `14-HUMAN-SETUP-GUIDE.md`.

| # | Needed for | Task |
|---|------------|------|
| 1 | Run the backend against the real supplier | Create `apps/api/.env` from `apps/api/.env.example` with Reloadly **test** credentials (`RELOADLY_ENV=sandbox`), then run `pnpm --filter api smoke:reloadly` and send the agent the console output (it prints only status codes and field names). Read the fixtures diff before committing it |
| 2 | ~~Testnet deploy~~ | Done 19 Nov 2026 with throwaway testnet wallets (addresses in `CLAUDE.local.md`). Mainnet needs **new** wallets with strong passwords |
| 3 | Web on testnet | Open the web app against the testnet API in a browser wallet and buy once (`13-RUNBOOK.md` §1, "Try it on testnet") |
| 4 | Step 2 sign-off | Read `contracts/src/QartaCheckout.sol` and `contracts/script/SweepTreasury.s.sol` line by line; the team must be able to explain them in the demo |
| 5 | Step 4 sign-off | Try the flow on a phone; open the site inside the QIE Wallet app and report whether it connects |
| 6 | Go-live | Email `sales@reloadly.com` (Platform Client approval), get live credentials, fund the float |
| 7 | Go-live | Hosting: managed Postgres, API container, Vercel for the web, a domain (`13-RUNBOOK.md` §3) |
| 8 | Go-live | Mainnet deploy, verify, `acceptOwnership` from the cold wallet (`13-RUNBOOK.md` §2) |
| 9 | Submission | GitHub repo (public before submission), register the team, demo video, team presentation |
| 10 | Any time | Ask QIE: oracle update frequency, pool liquidity, canonical `.qie` reverse lookup; Reloadly: webhook signature scheme |
| 11 | P1 | QIE Pass partner account at `https://getpass.qie.digital`, copy its docs |

## Next step for whoever continues

1. As soon as item 1 above is done: run the smoke script, fix any Reloadly field the real responses contradict (the client's zod schemas will say), record fixtures, then run the API against the sandbox on testnet.
2. Testnet is deployed and `packages/shared/config/qie-testnet.json` holds the addresses. Re-run `scripts/testnet-buy.sh` after any backend change that touches the chain. If QIE quotes on testnet say the oracle is stale, refresh the mock feed (`13-RUNBOOK.md` §1).
3. P1 in plan order once go-live is done: cashback (`.qie` eligibility first), gift to `name.qie` (forward lookup is ready in `07-QIE-REFERENCE.md`), Telegram receipts.
