# Qarta Pay

**Spend QIE and QUSDC on real things.** Mobile airtime, data bundles and digital gift cards, paid on-chain on QIE Mainnet, delivered in seconds, with funds held in escrow until delivery.

Built for **QIE Hackathon 3.0** ("Build the Company, not the Demo"). Submission deadline: **30 Nov 2026, 23:59 CET**.

## QIE integrations

Each QIE component is also shown live in the app on the **Powered by QIE** page (`/powered-by-qie`). Keep this table and that page in sync.

Status: planned. Only the scaffold exists so far, so the file paths are the planned locations; replace them with real paths (and line numbers where useful) as code lands. Addresses are QIE Mainnet (1990); re-check each on `https://mainnet.qie.digital` before use.

| Component | What it does for the user | File path | Contract address |
|-----------|---------------------------|-----------|------------------|
| QIE Mainnet — `QartaCheckout` escrow | Payment is held by a contract until delivery; automatic refund on failure; self-refund after timeout | `contracts/src/QartaCheckout.sol` | TBD after mainnet deploy |
| QIE Wallet | Connect and pay with the chain's own wallet, listed first | `apps/web/src/lib/wagmi.ts` | — (injected provider, EIP-6963 `me.qiewallet`) |
| QIE (native coin) | Pay with QIE directly, no exchange needed | `contracts/src/QartaCheckout.sol` (`pay`, native branch) | native coin |
| QIE Stable Coin (QUSDC) | Pay with a stable price; default pay token | `contracts/src/QartaCheckout.sol` (`pay`, ERC-20 branch), `apps/web/src/components/checkout/` | `0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5` |
| QIE ID (`.qie` names) | See your `.qie` name instead of a hex address (P1: send a gift card to `name.qie`) | `apps/api/src/identity/qie-name.ts`, `apps/web/src/components/WalletChip.tsx` | reverse resolver `0x76ec8ed377cC0d36D1B48027ac7892Ec6799171E`, then `userDomain` on registry `0x1D69d75AD7b77b91C3760F84faC52E651710f62e` (the resolver is stale for new names); P1 forward lookup on registries `0x26cCB3fABd6db18834987134d715Ba2346CE7223` and `0x1D69d75AD7b77b91C3760F84faC52E651710f62e` |
| QIE Oracle | QIE prices are bounded by the on-chain QIE/USD feed (the quote uses the lower of the feed and the QIEDex pool price), and the contract checks every native-QIE payment against it, so a faulty quote cannot settle at a wildly wrong price | `contracts/src/QartaCheckout.sol` (oracle guard), `apps/api/src/pricing/oracle.ts` | QIE/USD feed `0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17` |
| QIEDEX — price cross-check | QIE quotes use the lower of the oracle and the QIEDex pool price, and are refused if the two disagree too much, so users are never quoted off a bad price | `apps/api/src/pricing/qiedex-check.ts` | WQIE/QUSDC pair `0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe`; factory `0x8E23128a5511223bE6c0d64106e2D4508C08398C`; WQIE `0x0087904D95BEe9E5F24dc8852804b547981A9139` |
| QIEDEX — treasury sweep | Revenue collected in QIE is converted to QUSDC on QIEDex, so the shop is not exposed to QIE price swings and can keep paying the supplier for deliveries (escrowed user funds are never touched) | `contracts/script/SweepTreasury.s.sol` | router `0x08cd2e72e156D8563B4351eb4065C262A9f553Ef` |
| QIEDEX — Get QUSDC | One tap to swap for QUSDC on QIEDex when the balance is short | `apps/web/src/components/GetQusdcLink.tsx` | — (link to `https://www.swap.dex.qie.digital/swap`) |
| QIEDEX — in-tx swap (P1, only on GO) | Pay in QIE, escrow held in QUSDC | `contracts/src/QartaCheckout.sol` (`payWithQieSwap`) | router `0x08cd2e72e156D8563B4351eb4065C262A9f553Ef` |
| QIE Pass (P1) | Cashback for verified users (or `.qie` name holders); higher limits for verified users | `apps/api/src/identity/qie-pass.ts` | — (off-chain partner API) |

## Docs map (read in this order)

| # | File | What it covers |
|---|------|----------------|
| 1 | `docs/01-PROJECT-BRIEF.md` | Product, users, scope (P0/P1/P2), business model, differentiation |
| 2 | `docs/02-HACKATHON.md` | Rules, dates, judging, disqualification risks, submission checklist |
| 3 | `docs/03-ARCHITECTURE.md` | System design, order state machine, data model, trust model |
| 4 | `docs/04-SMART-CONTRACTS.md` | `QartaCheckout` spec, EIP-712 quote, tests, deployment |
| 5 | `docs/05-BACKEND.md` | API, indexer, fulfilment worker, pricing, limits |
| 6 | `docs/06-FRONTEND.md` | Screens, wallet connection, UX rules |
| 7 | `docs/07-QIE-REFERENCE.md` | Chain IDs, RPCs, contract addresses, oracle, wallet, QIE ID, QIE Pass |
| 8 | `docs/08-RELOADLY-REFERENCE.md` | Supplier API: auth, airtime, gift cards, statuses, account rules |
| 9 | `docs/09-PLAN.md` | Step-by-step build plan, day by day, with acceptance criteria |
| 10 | `docs/10-OPEN-QUESTIONS.md` | Everything unverified + tasks only a human can do |
| 11 | `docs/11-SECURITY-AND-SECRETS.md` | Key roles, secret handling, what never goes in git |
| 12 | `docs/12-STATUS.md` | Current status, decisions taken, handoff notes, what waits on a human |
| — | `docs/research-notes.md`, `docs/probe-results.md` | Evidence: researched answers with sources, and raw on-chain probe output |

Agent instructions live in `CLAUDE.md`. Private, uncommitted context lives in `CLAUDE.local.md` (create it from `CLAUDE.local.md.template`). The first prompt to give Claude Code is in `KICKOFF-PROMPT.md`.

## Fact labels used in these docs

- **[VERIFIED]** — read from an official page or doc on 15–17 Nov 2026 (source noted).
- **[THIRD-PARTY]** — taken from another team's public repo or a blog; plausible, must be checked on-chain or in sandbox before relying on it.
- **[UNVERIFIED]** — an assumption or recalled from memory. Confirm before building on it. All of these are also listed in `docs/10-OPEN-QUESTIONS.md`.
