# 01 — Project Brief

## One-liner

Qarta Pay lets anyone holding QIE or QUSDC buy mobile airtime, data bundles and digital gift cards in one on-chain payment, with the money held in escrow until the product is delivered.

## Problem

QIE holders have nowhere to spend the token. Today the only exit is: sell on an exchange, withdraw to a bank, wait, pay fees. In many markets that path is slow, expensive or unavailable. The token has trading utility but no everyday utility.

## Solution

A storefront (web app, mobile-first) where the user:

1. Connects a wallet (QIE Wallet or MetaMask) and sees their `.qie` name.
2. Picks a product: airtime / data for a phone number, or a gift card.
3. Sees a price in QUSDC and in QIE, locked for a short time. The QIE price is the lower of the QIE Oracle price and the QIEDex pool price (decided 17 Nov 2026, `10-OPEN-QUESTIONS.md` §F).
4. Pays with one transaction on QIE Mainnet.
5. Receives the top-up on the phone, or the gift card code in the app, within seconds to minutes.
6. Is refunded on-chain automatically if delivery fails.

## Target users (in launch order)

1. **Existing QIE community members** — already hold QIE, already have a wallet. This is the traction base for the hackathon window.
2. **Freelancers and remote workers paid in crypto** — want to cover daily expenses without off-ramping.
3. **Diaspora senders** — top up a family member's phone abroad.

## User benefits

- Spend crypto directly, no exchange, no bank.
- Delivery in seconds for most operators.
- Funds are escrowed by a contract; if the product is not delivered the user gets the money back without asking anyone.
- Cashback in QIE (P1) for verified users (QIE Pass) or `.qie` name holders.

## Scope

The hackathon gives bonus points for integrating several QIE components (`02-HACKATHON.md`). P0 therefore covers at least one shipped, user-visible use of each of QIE Wallet, QIE/QUSDC, QIE ID, QIEDEX and Oracles. QIE Pass is P1 because it depends on partner keys from QIE; its cashback feature has a `.qie` fallback so it can still ship.

### P0 — must exist to submit (target: live on mainnet by 25 Nov)

- `QartaCheckout` contract on QIE Mainnet: pay with QUSDC or native QIE against a backend-signed quote; escrow; settle; refund; user-claimable refund after timeout.
- **Oracle guard** in `QartaCheckout` (Oracles): native-QIE payments are checked against the QIE/USD feed on-chain. Tolerance and max feed age are owner-configurable. An owner switch can turn the guard off so a stale feed cannot halt sales.
- Backend: catalog, quotes, chain indexer, Reloadly fulfilment, refunds, order status API.
- **QIEDex price cross-check** (QIEDEX): before quoting in QIE, the backend reads the WQIE/QUSDC reserves from the QIEDex pair. It refuses to quote QIE if the pool price differs from the oracle price by more than a configurable threshold, and otherwise prices the quote at the lower of the two. QUSDC quotes are not affected.
- **Treasury sweep script** (QIEDEX): a script converts collected native QIE to QUSDC through the QIEDex router. The team reviews it and tests it on a mainnet fork; a human runs it on mainnet.
- Web app: connect wallet (QIE Wallet listed first), airtime flow (phone → operator auto-detect → amount → pay → status), gift card flow (country → brand → denomination → pay → reveal code), order history.
- **`.qie` name display** (QIE ID): reverse-resolve the connected wallet to its primary `.qie` name and show it in the wallet chip and the order history. If there is no name, or the lookup fails, show the short address.
- **"Get QUSDC" link** (QIEDEX): a link to the QIEDex swap page, shown next to the QUSDC balance, at checkout when the QUSDC balance is too low, and on the Powered by QIE page.
- **"Powered by QIE" page**: each QIE component, what it does for the user, live status (oracle price and age, QIEDex price and deviation) and contract addresses with explorer links.
- Catalog limited by config: a few countries, ~10 gift card brands.
- Risk limits (per order, per wallet per day, global per day) and a pause switch.
- Public stats page (orders, volume, unique wallets) read from chain + DB.

### P1 — strongly improves the score (26–29 Nov)

- Send a gift card to `name.qie` (QIE ID forward resolution).
- Cashback in QIE (QIE Pass). Eligible wallet = QIE Pass verified **or** owns a primary `.qie` name. Raised limits stay QIE-Pass-only.
- In-transaction swap QIE → QUSDC through QIEDex. Ships **only** if the Step 1 probe returns GO under the decision rule in `04-SMART-CONTRACTS.md`. QIEDEX does not depend on it, because the P0 items above already cover QIEDEX.
- Telegram bot for order receipts.

### P2 — only if everything else is solid

- Auto-renew agent (recurring top-ups with a user-set spending cap).
- Utility bill payments.
- Telegram Mini App wrapper.

### Explicit non-goals for the hackathon

- Custody of user balances (no deposits, no internal wallets).
- Fiat on/off-ramp.
- Native mobile apps.
- Own token.

## Business model

- Supplier (Reloadly) sells below face value (commission / discount per operator and brand).
- Qarta Pay adds a configurable margin on top of supplier cost (`MARGIN_BPS`, start at 300–500).
- Part of the margin funds cashback (`CASHBACK_BPS`, start at 100).
- No chargebacks: payment is final on-chain before fulfilment. Chargeback fraud is the main loss source for card-funded gift card sellers; this model does not have it.

## Differentiation (important for judging and for the anti-clone rule)

Crypto-to-gift-card stores exist on other chains (Bitrefill, Cryptorefills; Toppa on Celo is an AI-agent version). Qarta Pay must be visibly a QIE-native product, not a port:

- It is the first place to spend **native QIE**, the chain's own token.
- **On-chain escrow with automatic and user-claimable refunds** — competitors are custodial "pay and trust us".
- Identity-aware: `.qie` names shown in the app and used for gifting; QIE Pass (or a `.qie` name) for cashback eligibility; QIE Pass for higher limits.
- Oracle-guarded pricing on-chain, cross-checked against the QIEDex pool off-chain.
- Revenue is converted to the chain's own stablecoin (QUSDC) through the chain's own DEX (QIEDex).
- Public, on-chain-verifiable traction dashboard.

Do not pitch "AI agent on Telegram" as the core idea. That is Toppa's positioning.

## Success metrics (map to the hackathon's traction milestones)

Wallet growth, transaction count and volume, repeat users (2+ orders), monthly active wallets, revenue (margin earned). Targets for demo week: 100+ unique paying wallets, 300+ orders. Exact milestone thresholds for the second 50% of prize money are not published; see `10-OPEN-QUESTIONS.md`.
