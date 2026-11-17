# 02 — Hackathon Context (QIE Hackathon 3.0)

Sources: `https://hackathon.qie.digital/` and `https://hackathon.qie.digital/terms`, read 15–17 Nov 2026. **[VERIFIED]** unless marked.

## Dates

| Event | Date |
|-------|------|
| Development period | 1 Aug – 30 Nov 2026 |
| **Submission deadline** | **30 Nov 2026, 23:59 CET** (= 1 Dec 00:59 Cairo time) |
| Demo week (live demos + judging) | 1–5 Dec 2026 |
| Winners + phase-1 payout | 10 Dec 2026 |
| Traction milestone window | 90 days after winning |

Internal freeze: **30 Nov 18:00 CET**. Nothing risky ships after that.

## Theme

"Build the Company, not the Demo." Judges want a product launched to real users on **QIE Mainnet** that keeps running after the event.

## Hard requirements

- Deployed on **QIE Mainnet** ("Mainnet only"). Testnet is for development only.
- Submission form needs: **GitHub repository**, **live demo URL**, **deployed contract address**, **track**.
- The site FAQ lists the mandatory items: "mainnet deployment, open-source smart contracts, live public app, public repository, demo video, documentation, and team presentation". Judges "verify contracts, transactions, deployment, and frontend connectivity on QIE Mainnet". **[VERIFIED: FAQ in the site's JS bundle, 17 Nov 2026]**
- Terms also require: original work created during the hackathon period, a working demo, source on GitHub, "comprehensive documentation", no IP violations.
- One project per team. Participants 18+, with a valid QIE wallet address.
- Launch to real users and show traction within 90 days.

## Track

Submit under **Commerce & Real World** (merchant payments, invoicing, ticketing, POS, supply chain, subscriptions). Alternative if organizers advise: DeFi & Financial Infrastructure (payments).

## Prizes

$17,000 total: 1st $5,000, 2nd $3,000, 3rd $2,000; $500 per track winner; Most Traction $2,500; Community Choice $1,000; Best Student Team $1,000.

- 50% paid on 10 Dec; 50% after meeting **any 3** traction milestones within 90 days (wallet growth, transaction volume, recurring users, merchants, monthly active usage, revenue). Thresholds are not published.
- The terms page says prizes are paid **in QIE tokens**.

We are aiming at 1st place **and** Most Traction. Every engineering decision should favour "real users can complete a real purchase on mainnet" over extra features.

## Judging criteria

The official sources give three different lists:

- Site FAQ (weights) **[VERIFIED: FAQ in the site's JS bundle, 17 Nov 2026]**: Innovation 30%, Technical Quality 25%, User Experience 15%, Mainnet Integration 15%, Business Potential 15%.
- Home page (no weights): originality & innovation; real-world usefulness; product quality & UX; QIE ecosystem integration; user adoption potential.
- Terms page (25% each): innovation and creativity; technical implementation and quality; potential impact and real-world applicability; presentation and demonstration quality.

Build for the union of all three; when in doubt, use the FAQ weights. **Bonus scoring** for integrating multiple QIE components: QIE Wallet, QIE ID, QIEDEX, Oracles (the page also lists QIE Stable Coin and QIE Pass as ecosystem components).

## Zero-tolerance disqualification rules

1. Forked or recycled code from previous hackathons or existing projects.
2. Projects copied from Ethereum or other blockchain hackathons.
3. Simple clones without meaningful differentiation.
4. AI-generated projects with minimal developer contribution.
5. Projects without a working demo or deployment.

No appeals.

### What this means for how we build

- Write every contract and service from scratch in this repo. Standard audited libraries (OpenZeppelin, viem, wagmi) are dependencies, not forks; that is normal. Do not copy code from other hackathon repos, including the QIE winners referenced in `07-QIE-REFERENCE.md` (use them only as a source of addresses and facts to verify).
- Rule 4: the FAQ answers this **[VERIFIED: FAQ in the site's JS bundle, 17 Nov 2026]**: "Yes, AI-assisted development is encouraged. Teams must fully understand and maintain their code and be able to explain architecture to judges." So: humans on the team review, understand and can explain every part of the code in the live demo; the git history should reflect the real development process; do not misrepresent how the code was written.
- Rule 3: keep the differentiators from `01-PROJECT-BRIEF.md` visible in the product and the README.
- Rule 5: the live demo URL must work during demo week with real mainnet purchases. Keep the supplier wallet funded and monitoring on.

## Traction integrity

Do not create fake wallets, bot transactions or wash volume. Everything is visible on the explorer, the organizers have strict rules, and it would be dishonest. Traction comes from real purchases only.

## Previous winners (for calibration, not for copying)

- 2025 edition: YesNo Markets (prediction markets), Enoobs (digital identity), NeuroCred (AI).
- Hackathon 2 (2026): 1st Qantara, 3rd Fluenci (Stripe-style subscriptions settled in qUSDC, integrates QIE ID / QIE Pass / QIEDex), top five included RemitChain (remittances). Judges praised deep ecosystem integration and a thoughtful security model.

Pattern: practical payment/identity products with deep QIE integration win.

## Official channels

- Telegram (most active): `https://t.me/HovRonQiblockchain`
- Discord: `https://discord.com/invite/8DD4kSHBvr` (inactive at time of writing)
- Support email: `info@qie.digital` (footer shows `hello@qie.digital`; use both)
- Docs: `https://docs.qie.digital`

## Submission checklist

- [ ] Team registered at `hackathon.qie.digital` (email OTP → team account)
- [ ] Contract deployed on mainnet (chain 1990) and verified on `mainnet.qie.digital`
- [ ] Live demo URL (production domain, HTTPS)
- [ ] Public GitHub repo with real commit history
- [ ] README: what it is, architecture diagram, contract addresses, which QIE components are integrated and where in the code, how to run, traction numbers, team
- [ ] Demo video (2–3 min) — mandatory according to the FAQ
- [ ] Team presentation ready for demo week (mandatory according to the FAQ)
- [ ] Smart contract source is public (mandatory: "open-source smart contracts")
- [ ] Public stats page with on-chain-verifiable numbers
- [ ] Submitted before 30 Nov 18:00 CET (internal deadline)
