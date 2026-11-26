# 15 — Roadmap

The public roadmap shown on the landing page and on `/roadmap`. The site reads it from `apps/web/src/lib/roadmap.ts`, which is the source of truth. When you change a phase, change that file and this doc in the same commit.

Phase 1 is what runs today. Later phases are plans with target dates, and the site says so. Last updated 26 Nov 2026.

## 01 Launch — live now

Spend QIE and QUSDC on real products, with every payment held in escrow on QIE Mainnet.

- Mobile airtime
- Gift cards (the code is shown after a wallet signature)
- Escrow and refunds: paid, delivered, then released. If delivery fails the payment is refunded automatically, and after 2 hours the payer can reclaim it.
- QIE-native pricing: an on-chain oracle guard, cross-checked against the QIEDex pool
- QIE Wallet and QIE ID

## 02 Everyday spending — target Q1 2027

- Data bundles (Reloadly Data Bundles API)
- Send to a `.qie` name (QIE ID forward resolution, `07-QIE-REFERENCE.md`)
- Cashback in QIE for `.qie` name holders and QIE Pass verified users
- Telegram receipts
- Telegram Mini App
- More languages, starting with the largest markets we serve

## 03 Bills and automation — target Q2 2027

- Utility bill payments (electricity, TV, internet, water) wherever Reloadly serves them
- Auto top-up: recurring, with a spending cap set by the user
- QIE Pass verified accounts with higher limits

## 04 Platform — target H2 2027

- **Qarta Checkout for QIE apps.** An API and widget that let any QIE app sell top-ups, gift cards and bills, and earn a share of the fee.
- **Rewards and bulk payouts.** Teams and communities send airtime or gift cards to many people at once, funded in QUSDC.
- **Exploring a Qarta token.** We would consider a token only if it gives users real value, such as lower fees or larger cashback, and only once the store has steady usage. No token exists and no sale is planned. A token was an explicit non-goal for the hackathon (`01-PROJECT-BRIEF.md`). Before any token work:
  - the team decides;
  - we get legal advice for the countries we serve;
  - we check the hackathon and QIE rules that apply then.

## Business model, as the roadmap page states it

- Revenue on every order: a fee on top of the product cost, shown before payment (`MARGIN_BPS`, 2% at launch), plus the supplier's wholesale discount.
- No chargebacks: payment is final on-chain before delivery.
- Every product uses the same escrow and checkout, so a new product is mostly catalogue work.
- Revenue settles in QUSDC through QIEDex.
- The stats page shows the public numbers, and each one can be checked on the QIE explorer.
