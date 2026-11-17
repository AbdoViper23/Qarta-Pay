# 12 — Status and Handoff

Read this first if you are picking the project up, human or agent. It says where the work stands, what was decided, and what is blocked on whom. Update it at the end of every working session.

Last updated: **17 Nov 2026** (end of Step 1).

## Where we are

| Plan step (`09-PLAN.md`) | State |
|--------------------------|-------|
| Day 0 human tasks | **Not done yet.** See "Waiting on a human" below |
| Step 1 — scaffold and probe | **Done**, except the items that need credentials or a funded key (listed below) |
| Step 2 — contract + sweep script | **In progress** (approved 17 Nov 2026). See "Step 2 progress" below |
| Steps 3–7 | Not started |

## Step 2 progress (17 Nov 2026, session stopped mid-step)

Done and committed:
- `contracts/src/QartaCheckout.sol` with the oracle guard, per-token `totalEscrowed`, owner `rescue` limited to non-escrowed funds, immutable `refundTimeout` (30 min – 7 days), `renounceOwnership` disabled, `hashQuote` view.
- Mocks: `MockERC20` (6 decimals), `MockAggregatorV3`, `MockRouter`.
- `contracts/test/QartaCheckout.t.sol`: 66 unit and fuzz tests pass.
- OpenZeppelin pinned to **5.1.0**: 5.6 uses `mcopy` (Cancun), which QIE does not support.

Still to do in Step 2, in this order:
1. Invariant test (handler with ghost sums: balance and `totalEscrowed` per token equal the sum of `Paid` orders; an order leaves `Paid` once).
2. `script/SweepTreasury.s.sol` (logic in a function taking a params struct), unit tests against the mocks, `test/fork/SweepTreasury.t.sol`.
3. Fork test for `QartaCheckout`: real QUSDC payment, real feed (warp to just after `updatedAt`, the feed can be over 24 h old).
4. `script/Deploy.s.sol`; anvil rehearsal of pay → settle, pay → refund, one native pay rejected by the guard.
5. Export the ABI from `contracts/out` to `packages/shared`, add the `Quote` EIP-712 types and one fixed digest vector asserted in Foundry and vitest.
6. Record in `04-SMART-CONTRACTS.md` the deviations: immutable `refundTimeout`, `totalEscrowed`, `rescue`, zero-amount rejection, OZ 5.1.0. Update the README integrations rows. Try `slither`.
7. Testnet deploy needs a funded key (human).

## What exists in the repo

| Path | What it is |
|------|------------|
| `docs/probe-results.md` | Raw results of every on-chain probe, with the commands |
| `docs/research-notes.md` | Every researched item with answer, source and confidence label |
| `docs/10-OPEN-QUESTIONS.md` | What is still open; §F lists the decisions taken after the probe |
| `packages/shared/config/*.json` | Chain config and contract addresses (mainnet confirmed on-chain; testnet empty until mocks are deployed) |
| `packages/shared/src/` | viem chain definitions, zod-validated address book, ABIs for the functions we use |
| `packages/shared/abi/` | ABIs as collected: two verified ones from the explorer, and hand-assembled signatures for the unverified QIEDex and QIE ID contracts |
| `contracts/` | Foundry project (solc 0.8.24, `paris`, OpenZeppelin v5.6 and forge-std v1.17 installed through pnpm, no git submodules). Holds a toolchain test and a mainnet fork test. **No `QartaCheckout` yet** |
| `contracts/script/probe.sh` | The read-only mainnet probe checklist as one script |
| `apps/api/` | Fastify skeleton with `/healthz`, Reloadly endpoint config, fixture scrubber, and the sandbox smoke script |
| `apps/web/` | Next.js skeleton (placeholder page). No wallet code, no Tailwind yet |
| `.github/workflows/ci.yml` | lint + typecheck + tests, Foundry build + unit tests, gitleaks |

## How to run what exists

```bash
export PATH="$PATH:$HOME/.foundry/bin"     # Foundry is installed there; fish: fish_add_path ~/.foundry/bin
pnpm install
pnpm lint && pnpm typecheck && pnpm test   # pnpm test also runs the Foundry unit tests
cd contracts && forge test --match-path "test/fork/*" --fork-url https://rpc1mainnet.qie.digital
bash contracts/script/probe.sh             # read-only mainnet probe
pnpm --filter api smoke:reloadly           # needs apps/api/.env with sandbox credentials
```

State at the end of Step 1: lint clean, typecheck clean, 19 TypeScript tests pass, 2 Foundry unit tests pass, 4 mainnet fork tests pass. The Reloadly smoke script has **not** been run against the sandbox (no credentials yet); it was only checked to refuse when `RELOADLY_ENV` is not `sandbox`. gitleaks has not been run locally (not installed); it runs in CI once the repo is on GitHub. CI itself has never run. A fresh clone was checked by hand on 17 Nov 2026: `pnpm install --frozen-lockfile`, lint, typecheck, tests, `forge build` and `next build` pass.

**Before committing fixtures recorded by the smoke script, read the diff.** The scrubber removes known secret fields and hides every value of the gift card code response, but Reloadly's field names are not fully confirmed.

## Facts every contributor must know (details in `research-notes.md`)

1. **Oracle.** QIE/USD feed has 8 decimals and no heartbeat; gaps between updates reach 23 hours. One owner key writes it.
2. **QIEDex.** Uniswap V2 `Router02` fork, fee 0.30%, native-in swap is `swapExactETHForTokens`. The WQIE/QUSDC pool is small (about $8.8k) and traded 5.1% below the oracle.
3. **In-tx swap is NO-GO.** Escrow stays in native QIE.
4. **QUSDC.** 6 decimals, no permit, plain ERC-20, total supply about 9,022. Most users will pay in native QIE.
5. **QIE ID.** Read a wallet's name with `resolve(address)` on the resolver, then `userDomain(address)` on Registry B, then fall back to the short address. Wallets with a name only in Registry A cannot be reverse-resolved. Name → address: `resolver(string)` on both registries.
6. **Chain.** Shanghai-level EVM (we compile with `paris`), EIP-1559 base fee present, 3.63 s blocks, `eth_getLogs` max 10,000 blocks, public RPC answers in 3–7 s and sometimes drops a connection. Anvil forks of mainnet work.
7. **Explorer.** Blockscout v7.0.2. QIEDex and QIE ID contracts are not verified.
8. **Testnet** has none of the QIE ecosystem contracts. We deploy our own mocks there.
9. **Hackathon.** AI-assisted development is encouraged; a demo video and a team presentation are mandatory; judging weights are Innovation 30, Technical 25, UX 15, Mainnet Integration 15, Business 15.

## Decisions taken on 17 Nov 2026 (`10-OPEN-QUESTIONS.md` §F)

- Contract: `maxOracleAge` = 86,400 s, `oracleToleranceBps` = 1,000 (owner-configurable).
- Backend: QIE quotes are priced at `min(oracle, QIEDex pool)`; `ORACLE_MAX_AGE_S` = 86,400; `DEX_ORACLE_MAX_DEVIATION_BPS` = 1,500.
- Sweep: `SWEEP_MAX_SLIPPAGE_BPS` = 700, `SWEEP_MAX_ORACLE_AGE_S` = 86,400, chunks of at most about 130 QIE.
- Worker: no new supplier call after `paidAt + refundTimeout − 45 min`; refund instead. `refundTimeout` stays 2 h.
- Tooling: Node 22 (`engines >=20`), TypeScript 6.0 (typescript-eslint does not support 7 yet), pnpm 12.
- In-tx swap: NO-GO.

## Waiting on a human

Ordered by when the work needs it.

| Needed for | Task |
|------------|------|
| Finishing Step 1 | Put Reloadly **test** credentials in `apps/api/.env` (`RELOADLY_ENV=sandbox`, `RELOADLY_CLIENT_ID`, `RELOADLY_CLIENT_SECRET`), then run `pnpm --filter api smoke:reloadly`. It records fixtures and answers the open Reloadly questions (status shape, PIN field name, duplicate `customIdentifier`) |
| Step 2 (testnet deploy, `forge verify-contract` test) | A funded testnet deployer: `cast wallet import qarta-deployer --interactive`, then fund the address from `https://www.qie.digital/faucet` |
| Step 2 | Create `CLAUDE.local.md` from the template with the wallet addresses (owner, deployer, quoteSigner, fulfiller, treasury) |
| Step 2 review | Read the contract and the sweep script line by line |
| Step 3 | Reloadly webhook signature scheme (dashboard → webhooks, or `docs.reloadly.com` in a browser) |
| Step 4 | Test QIE Wallet on a phone: is there an in-app browser that injects a provider? Is there WalletConnect? |
| Step 4 | Open `https://www.swap.dex.qie.digital/swap?tokenA=…&tokenB=…` in a browser and report whether it pre-selects tokens |
| Step 5 | Email `sales@reloadly.com` (Platform Client approval), fund the live float, buy mainnet QIE and QUSDC, run the mainnet deploy |
| P1 (QIE Pass) | Create a partner account at `https://getpass.qie.digital`, open Dashboard → Docs and copy the page (auth, endpoints, claims) |
| Any time | Ask QIE (Telegram / `info@qie.digital`): oracle heartbeat, more pool liquidity, the canonical reverse lookup for `.qie` names, traction-milestone thresholds, team size limit |
| Before submission | Create the GitHub repo and push; register the team on `hackathon.qie.digital`; domain and hosting |

## Next step for whoever continues

Step 2 of `09-PLAN.md`: `QartaCheckout` per `04-SMART-CONTRACTS.md`, with the decided oracle values, plus mocks, the full test list, `SweepTreasury.s.sol` and its fork test. **Do not start it until the team confirms.** Follow the corrected `pay` order in `04-SMART-CONTRACTS.md`: the escrow is written before the ERC-20 transfer, then the received balance is checked.
