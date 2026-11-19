# CLAUDE.md — Qarta Pay

Qarta Pay is a storefront on **QIE Mainnet** where users pay in QUSDC or native QIE for mobile airtime, data bundles and gift cards. Payment goes into an escrow contract (`QartaCheckout`); the backend fulfils through the Reloadly API, then settles on-chain, or refunds if delivery fails. It is an entry for QIE Hackathon 3.0. **Submission deadline: 30 Nov 2026, 23:59 CET.** The goal is first place and real users, so a working, safe mainnet purchase flow beats any extra feature.

## Read before coding

0. `docs/12-STATUS.md` — where the work stands today, decisions taken, what is blocked on whom. Update it at the end of every session. `docs/13-RUNBOOK.md` has the deploy and operations commands.
1. `docs/09-PLAN.md` — what to build next and when a step counts as done
2. `docs/03-ARCHITECTURE.md` — system design and the order state machine
3. The doc for the area you are touching: `04` contracts, `05` backend, `06` frontend
4. `docs/07-QIE-REFERENCE.md` and `docs/08-RELOADLY-REFERENCE.md` — addresses, endpoints, known quirks. `docs/research-notes.md` and `docs/probe-results.md` hold the evidence behind them.
5. `docs/02-HACKATHON.md` — rules that constrain how we build
6. `CLAUDE.local.md` if it exists — private team context (wallet addresses, account status, answers received). It is not in git.

## How facts are labelled

Docs tag facts as `[VERIFIED]`, `[THIRD-PARTY]` or `[UNVERIFIED]`. Before building on anything not `[VERIFIED]`, check it yourself (on-chain call, sandbox call, or the official doc) and update the doc with the result. Do not guess an ABI, an endpoint path or a contract address; if you cannot confirm it, stop and say so. `docs/10-OPEN-QUESTIONS.md` tracks everything unresolved; keep it current.

## Repo layout

```
contracts/         Foundry — QartaCheckout, mocks, tests, scripts (OpenZeppelin and forge-std come from pnpm, not git submodules)
apps/api/          Fastify + PostgreSQL (pg, SQL migrations) + viem — API, indexer, fulfilment worker
apps/web/          Next.js + wagmi — storefront
packages/shared/   ABI, EIP-712 types, chain config (config/*.json), zod schemas
docs/              specs and references
```

## Commands

```bash
export PATH="$PATH:$HOME/.foundry/bin"   # forge, cast, anvil
pnpm install
pnpm lint && pnpm typecheck
pnpm test                               # all workspaces: Foundry unit tests, API unit + integration (anvil + embedded Postgres; needs `forge build` first), web
cd contracts && forge build && forge test -vvv --no-match-path "test/fork/*"   # unit, fuzz, invariant
pnpm --filter contracts test:fork        # mainnet fork tests, pinned to FORK_BLOCK (default 11961896)
pnpm --filter contracts rehearse         # pay->settle, pay->refund, guard rejection on a local anvil
pnpm --filter contracts export-abi       # regenerate packages/shared/src/abi/qartaCheckout.ts after contract changes
cd contracts && forge script script/SweepTreasury.s.sol:SweepTreasury --fork-url $QIE_MAINNET_RPC --sender $TREASURY_ADDRESS -vvvv   # simulation only; mainnet --broadcast is human-only
bash contracts/script/probe.sh          # read-only mainnet probe checklist
pnpm --filter api dev                   # needs apps/api/.env (test creds)
pnpm --filter api smoke:reloadly        # Reloadly SANDBOX smoke test; records scrubbed fixtures
pnpm dev:local                          # whole stack on this machine: anvil + mocks + Postgres + API (fake supplier) + web
pnpm --filter api db:dev                # embedded PostgreSQL for local dev (no Docker); prints DATABASE_URL
pnpm --filter api review list           # orders in NEEDS_REVIEW; see docs/13-RUNBOOK.md
API=http://127.0.0.1:4000 PAY_TOKEN=QUSDC bash scripts/testnet-buy.sh   # one testnet purchase through a running API (testnet only)
pnpm --filter web dev
```

Update this section when commands change.

## Rules that are specific to this project

**Money safety**
- The contract and the fulfilment worker move real money. Every change there needs tests for the failure paths, not just the happy path.
- Fulfil only after a confirmed `OrderPaid` event whose `orderId`, `payer`, `token` and `amount` exactly match the stored quote.
- Never fulfil an order twice. State transitions are DB updates with a status precondition; supplier calls carry `customIdentifier = orderId`; look the order up at the supplier before retrying.
- When the supplier outcome is unknown, do not auto-refund and do not auto-retry blindly: mark `NEEDS_REVIEW` and alert. Refunding a delivered order loses money.
- Refund paths (`refund`, `claimRefund`) must keep working while the contract is paused.
- Do not weaken or delete a check or a test to make something pass. If a test is wrong, explain why before changing it.

**Mainnet and live systems**
- You may run commands against anvil, QIE **testnet** (1983) and the Reloadly **sandbox**.
- Do not broadcast transactions to QIE **mainnet** (1990) and do not call the **live** Reloadly API. Prepare the exact command, explain what it does, and hand it to the human.
- Read-only mainnet RPC calls (`cast call`, fork tests) are fine.

**Secrets**
- Never read, print or commit `.env`, `.env.local`, `.env.production`, `secrets/**`, keystores, or `CLAUDE.local.md` contents into tracked files. Work with variable names; ask the human to set values.
- New env var → add it to that workspace's `.env.example` (`apps/api/`, `apps/web/`, `contracts/`) with a dummy value and to `docs/11-SECURITY-AND-SECRETS.md`.
- Logs must not contain gift card codes, full phone numbers, signatures or credentials.

**Hackathon constraints**
- All code is written fresh in this repo. Do not copy code from other hackathon projects or from existing gift-card/top-up products. Standard libraries as dependencies are fine.
- Team members must be able to explain every part in a live demo: prefer simple, readable code over clever code; keep the contract small.
- Keep the README's "QIE integrations" table accurate: component → what it does for the user → file path → contract address. Keep the in-app Powered by QIE page in sync with it. When code for an integration lands or moves, update both in the same commit.
- Bonus scoring rewards multiple QIE integrations. P0 ships QIE Wallet, QIE/QUSDC, QIE ID (name display), QIEDEX (price cross-check, treasury sweep, Get QUSDC link) and Oracles (on-chain guard). Do not cut or stub any of them to save time; follow the cut list in `docs/09-PLAN.md`.
- No fake traction: no scripts that generate wallets or self-purchases on mainnet.

**Engineering conventions**
- TypeScript strict; no `any` in money or state-machine code. Validate external input and supplier responses with zod.
- Amounts: `bigint` for token base units, decimal strings at API boundaries, never floats. QUSDC and USD amounts use 6 decimals; QIE uses 18. Round prices **up**, payouts **down**.
- Solidity 0.8.24, `evm_version = "paris"`, OpenZeppelin v5, custom errors, NatSpec on external functions, checks-effects-interactions.
- Config (addresses, limits, margins, enabled countries) comes from env/config files, not constants scattered in code.
- Small commits with clear messages. Run lint, typecheck and tests before saying a task is done, and report what you ran and what you could not verify.

## Scope discipline

P0 items in `docs/01-PROJECT-BRIEF.md` come first, in the order of `docs/09-PLAN.md`. Do not start a P1 item until the step's "Done when" is met. If something in the plan turns out to be impossible or wrong (for example the QIEDex router does not behave as assumed), stop, write what you found in `docs/10-OPEN-QUESTIONS.md`, and propose the smallest change of plan.
