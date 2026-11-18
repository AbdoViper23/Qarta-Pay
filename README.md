# Qarta Pay

**Spend QIE and QUSDC on real things.** Mobile airtime and digital gift cards, paid on-chain on QIE Mainnet, delivered in seconds, with the payment held in an escrow contract until delivery.

Built for **QIE Hackathon 3.0** ("Build the Company, not the Demo").

## Why it is different

- **First place to spend native QIE**, the chain's own coin, on everyday things.
- **On-chain escrow.** Crypto gift-card shops are usually "pay us and trust us". Here the payment waits in `QartaCheckout`; it goes to the shop only after delivery, is refunded automatically if delivery fails, and the buyer can take it back alone after 2 hours if the shop does nothing.
- **QIE-native price protection.** Every native-QIE payment is checked on-chain against the QIE Oracle; quotes use the lower of the oracle and the QIEDex pool price and pause if the two disagree.
- **Identity-aware.** `.qie` names instead of hex addresses.
- **Verifiable traction.** Every order is a contract event; the stats page links to the contract.

## How it works

```
 Web app (Next.js, wagmi)        API (Fastify, PostgreSQL, viem)           Reloadly
 ───────────────────────          ───────────────────────────────           ────────
 1. ask for a price  ───────────► sign an EIP-712 quote (oracle/QIEDex price, limits)
 2. pay(quote, sig) ─► QartaCheckout (QIE Mainnet, escrow)
                                  3. indexer sees OrderPaid, checks it matches the quote
                                  4. worker delivers ─────────────────────► top-up / gift card
                                  5. delivered → settle()  │  failed → refund()
 6. order page: status, explorer links, gift card code (after a wallet signature)
```

Failure rules that protect money: no supplier call is ever repeated blindly (each carries `customIdentifier = orderId` and is looked up first), an unknown supplier outcome stops for a human (`NEEDS_REVIEW`) instead of refunding, and no delivery starts after the cutoff that would let it race the buyer's self-refund. Details: `docs/03-ARCHITECTURE.md`, `docs/05-BACKEND.md`.

### Trust model

- The buyer trusts the contract for refunds: funds sit in `QartaCheckout` until settled or refunded, and the buyer can self-refund after the timeout.
- The buyer trusts Qarta Pay to deliver before settling (the fulfiller key can only send an order's funds to the treasury or back to the buyer).
- The owner key can pause new payments and rotate keys, but can never move escrowed funds or block refunds.

## QIE integrations

Each component is also shown live in the app on the **Powered by QIE** page (`/powered-by-qie`). Keep this table and that page in sync. Addresses are QIE Mainnet (1990).

| Component | What it does for the user | Code | Contract address |
|-----------|---------------------------|------|------------------|
| QIE Mainnet — `QartaCheckout` escrow | Payment held until delivery; automatic refund on failure; self-refund after 2 h | `contracts/src/QartaCheckout.sol` | TBD after mainnet deploy |
| QIE Wallet | Connect and pay with the chain's own wallet, listed first (EIP-6963 `me.qiewallet`, `window.qie`) | `apps/web/src/lib/wagmi.ts`, `apps/web/src/components/WalletButton.tsx` | — |
| QIE (native coin) | Pay with QIE directly | `contracts/src/QartaCheckout.sol` (`pay`, native branch), `apps/api/src/quotes/pricing.ts` (`qieAmount`) | native coin |
| QIE Stable Coin (QUSDC) | Pay at a stable price; default pay token | `contracts/src/QartaCheckout.sol` (`pay`, ERC-20 branch), `apps/web/src/components/Checkout.tsx` | `0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5` |
| QIE ID (`.qie` names) | Your `.qie` name instead of a hex address in the wallet chip and order history | `apps/api/src/identity/qie-name.ts`, `apps/web/src/components/WalletButton.tsx` | reverse resolver `0x76ec8ed377cC0d36D1B48027ac7892Ec6799171E`, then registry `0x1D69d75AD7b77b91C3760F84faC52E651710f62e` (`userDomain`) |
| QIE Oracle | Every native-QIE payment is checked on-chain against the QIE/USD feed, so a faulty quote cannot sell at a wildly wrong price | `contracts/src/QartaCheckout.sol` (`_checkAgainstOracle`), `apps/api/src/pricing/oracle.ts` | QIE/USD feed `0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17` |
| QIEDEX — price cross-check | QIE quotes use the lower of oracle and pool price and pause if they disagree by more than 15% | `apps/api/src/pricing/qiedex-check.ts` | WQIE/QUSDC pair `0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe` |
| QIEDEX — treasury sweep | Revenue in QIE is converted to QUSDC on QIEDex with an oracle-bound minimum (escrowed funds are never touched) | `contracts/script/SweepTreasury.s.sol` | router `0x08cd2e72e156D8563B4351eb4065C262A9f553Ef` |
| QIEDEX — Get QUSDC | One tap to the QIEDex swap page when the QUSDC balance is short | `apps/web/src/components/GetQusdcLink.tsx` | — (link) |
| QIE Pass (P1, not built yet) | Cashback and higher limits for verified users | — | — (off-chain partner API) |

## Run it

Everything runs locally with no credentials and no real money (local chain, mock tokens, fake supplier):

```bash
pnpm install
cd contracts && forge build && cd ..
pnpm dev:local          # anvil + contracts + PostgreSQL + API + web; prints a demo wallet key
```

Then open `http://localhost:3000`, add the network `http://127.0.0.1:8545` (chain id 31337) to your wallet and import the printed demo key (an anvil test key, worthless elsewhere).

Checks:

```bash
pnpm lint && pnpm typecheck && pnpm test     # TypeScript + Foundry unit/fuzz/invariant tests
pnpm --filter contracts test:fork            # against a QIE Mainnet fork (read-only)
pnpm --filter contracts rehearse             # pay→settle, pay→refund, oracle-guard rejection on anvil
```

Deploying to testnet/mainnet and operating the service: `docs/13-RUNBOOK.md`. Current status and open items: `docs/12-STATUS.md`.

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
| 13 | `docs/13-RUNBOOK.md` | Deploy (testnet, mainnet), hosting, daily operations, treasury sweep |
| 14 | `docs/14-HUMAN-SETUP-GUIDE.md` | Step-by-step guide (Arabic) for the human tasks: accounts, wallets, faucet, hosting, submission |
| — | `docs/research-notes.md`, `docs/probe-results.md` | Evidence: researched answers with sources, and raw on-chain probe output |

Agent instructions live in `CLAUDE.md`. Private, uncommitted context lives in `CLAUDE.local.md` (create it from `CLAUDE.local.md.template`). The first prompt to give Claude Code is in `KICKOFF-PROMPT.md`.

## Fact labels used in these docs

- **[VERIFIED]** — read from an official page or doc on 15–17 Nov 2026 (source noted).
- **[THIRD-PARTY]** — taken from another team's public repo or a blog; plausible, must be checked on-chain or in sandbox before relying on it.
- **[UNVERIFIED]** — an assumption or recalled from memory. Confirm before building on it. All of these are also listed in `docs/10-OPEN-QUESTIONS.md`.
