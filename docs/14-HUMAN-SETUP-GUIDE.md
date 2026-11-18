# 14 — Human setup guide, step by step

Tasks only a person can do (accounts, keys, money, mainnet broadcasts), in the order the work needs them. Written 19 Nov 2026, updated 22 Nov 2026; website screens may change a little.

## First: key rules

- **Run any command that prints a private key or asks for a password in your own terminal.** Do not run it with `!` inside Claude Code: the output lands in the conversation.
- Never paste a key, client secret or password into the chat.
- Safe to share: addresses (`0x…`) and the output of commands that print only status codes.
- Keep Foundry on the PATH: `export PATH="$PATH:$HOME/.foundry/bin"`. In fish: `fish_add_path ~/.foundry/bin`.

---

## 1. Reloadly sandbox credentials

> **Done 21 Nov 2026**: sandbox run recorded (`08-RELOADLY-REFERENCE.md`, "Sandbox run").

**Account**

1. Open https://www.reloadly.com and click **Get API Keys** (or **Sign up**).
2. Fill in the form with the e-mail the project will use and confirm it.
   - Reloadly accepts business and governmental accounts only. Use real details; the sandbox works at once, live approval comes later (task 7).

**Keys**

3. Log in at https://www.reloadly.com/login.
4. Left menu: **Developers** → **API Settings**.
5. Switch the **Live / Sandbox toggle** to **Sandbox**. Live and sandbox keys are different; live keys against the sandbox fail with `CREDENTIAL_VS_ENVIRONMENT_MISMATCH`.
6. Copy **Client ID** and **Client Secret**.

**Put them in the project**

7. From the repo root:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
8. Edit `apps/api/.env`:
   ```
   RELOADLY_ENV=sandbox
   RELOADLY_CLIENT_ID=<Client ID>
   RELOADLY_CLIENT_SECRET=<Client Secret>
   RELOADLY_ORDER_EMAIL=<a mailbox the team controls; Reloadly sends gift card codes there>
   ```
   The file is git-ignored. Protect the order mailbox (2FA): it receives every buyer's codes.

**Try it**

9. Run `pnpm --filter api smoke:reloadly`. It gets tokens, reads balances, finds an operator, sends a test top-up and orders a gift card. Nothing real is delivered in the sandbox.
10. Share the output: it prints step names, HTTP statuses and field names only.

---

## 2. The five wallets

> **Testnet: done 19 Nov 2026** with throwaway wallets (addresses in `CLAUDE.local.md`). For mainnet create **new** wallets with strong passwords, same steps.

| Role | Does | Key lives in |
|------|------|--------------|
| deployer | deploys the contract once | Foundry keystore on your machine |
| treasury | receives revenue, runs the sweep | Foundry keystore on your machine |
| owner | controls the contract (pause, key rotation) | hardware wallet or a well-protected keystore |
| quoteSigner | the API signs prices with it | hosting secret store (Vercel env, sensitive) |
| fulfiller | the API sends settle and refund with it | hosting secret store (Vercel env, sensitive) |

**deployer, treasury, owner** (encrypted keystore; the key is never printed):

```bash
cast wallet new qarta-deployer
cast wallet new qarta-treasury
cast wallet new qarta-owner      # or use a hardware wallet / a separate MetaMask account
```

Each command asks for a password, then prints the **Address**. Keep the password in a password manager; lose it and the wallet is gone.

**quoteSigner, fulfiller** (the API needs the raw key):

```bash
cast wallet new      # no name: prints Address and Private key
```

Run it twice, once per role.

- Testnet: put both keys in `apps/api/.env` (`QUOTE_SIGNER_KEY`, `FULFILLER_KEY`).
- Mainnet: create a **new** pair and put it only in the Vercel env as sensitive variables, never on a laptop.

**Record the addresses** (addresses only): `cp CLAUDE.local.md.template CLAUDE.local.md`, fill in "Wallet addresses". The file is git-ignored. `cast wallet list` shows your keystore names.

---

## 3. Fund the deployer with test QIE and deploy to testnet

> **Done 19 Nov 2026**: contract on testnet and verified; addresses in `13-RUNBOOK.md` §1. Only needed again for a redeploy.

**Add QIE Testnet to MetaMask**: network selector → **Add network** → **Add a network manually**:

- Network name: `QIE Testnet`
- RPC URL: `https://rpc1testnet.qie.digital`
- Chain ID: `1983`
- Currency symbol: `QIE`
- Block explorer: `https://testnet.qie.digital`

**Faucet**: https://www.qie.digital/faucet → **Connect** with MetaMask → paste the deployer address → **Request Test Coins**. Arrives in about a minute; limit 2 QIE a day, plenty since testnet gas is almost free. Check with `cast balance <deployer> --rpc-url https://rpc1testnet.qie.digital --ether`.

**Deploy**: the commands are in `13-RUNBOOK.md` §1 (deploy, verify, `acceptOwnership`, fund the fulfiller).

---

## 4. Contract review (needed for the demo)

Judges will ask, and someone on the team must explain it with confidence. Read in this order:

1. `contracts/src/QartaCheckout.sol`: `pay`, then `settle` / `refund` / `claimRefund`, then `_checkAgainstOracle`.
2. `docs/04-SMART-CONTRACTS.md`, **Implementation notes**: why each decision was taken.
3. `contracts/script/SweepTreasury.s.sol`: `plan` (every check before sending).

Be able to answer:

- Who can move the money of a paid order, and to where?
- What happens if the backend dies completely? (`claimRefund` after two hours)
- What does the oracle guard protect against?
- Why can the owner not take escrowed funds? (`rescue` stops at `totalEscrowed`)

---

## 5. GitHub and hosting

> **Done 22 Nov 2026**: private GitHub repo, Vercel project `qarta-pay` (web + API as Vercel Services, Neon Postgres), https://qarta-pay.vercel.app. Details in `13-RUNBOOK.md` §3.

- Every push to `main` deploys production. Env changes need a redeploy (`vercel redeploy <deployment-url> --environment production`).
- Add or change a secret: `vercel env add <NAME> --environment production --sensitive --force` (it asks for the value).
- Optional: repository secrets `JOBS_URL` (`https://qarta-pay.vercel.app/api/v1/jobs/run`) and `CRON_SECRET` (same value as on Vercel) under GitHub **Settings** → **Secrets and variables** → **Actions**, so `.github/workflows/jobs.yml` runs the background jobs every 30 minutes.
- Before submission: GitHub **Settings** → **General** → **Danger Zone** → **Change visibility** → **Public**.
- Optional: custom domain under Vercel **Project** → **Settings** → **Domains**; then update `WEB_ORIGIN`.

---

## 6. Phone and QIE Wallet test

1. Install **QIE Wallet** from the App Store or Google Play and create a test wallet.
2. Enable **testnet** in its settings (chain 1983 is hidden until then).
3. Find **Browser** or **dApps** in the app and open the site.
4. Report: does the app have a browser? Does **Connect wallet** list **QIE Wallet**? Did it connect (screenshot if not)?
5. Also hand a phone to a non-developer, do not help, and note where they get stuck.

---

## 7. Reloadly live

Reselling to end users makes us a Platform Client; Reloadly's terms ask us to contact sales first. Send this to `sales@reloadly.com` (fill in the `< >` parts):

```
Subject: Platform Client onboarding – Qarta Pay (QIE Hackathon 3.0, deadline 30 Nov)

Hello Reloadly team,

We are building Qarta Pay, a web store where users pay with crypto (QIE and QUSDC on the
QIE blockchain) for mobile airtime and digital gift cards, delivered through the Reloadly
API. Each payment is held in an on-chain escrow contract and refunded automatically if
delivery fails. We clearly tell users that Reloadly is a third-party provider.

Our sandbox integration is complete and tested end to end for both products: airtime
top-ups (async top-up, status, transaction lookup) and gift cards (order, status, card
codes). We use your customIdentifier on every order and never resend an order without
looking it up first.

We would like to go live as a Platform Client at small volume: expected under
$2,000/month at launch, single orders capped at $50. The project is an entry in the QIE
Blockchain Hackathon, with a submission deadline of 30 November 2026, so a quick answer
would help us a lot.

Could you tell us:
1. What you need from us to approve live access as a Platform Client?
2. Whether there are restrictions on crypto-funded purchases or on specific gift card
   brands or countries?
3. Whether the account wallet can be funded with crypto, and the minimum amount?

Company / team: <name>, <country>
Contact: <name>, <email>, <phone>
Reloadly account email: <your account email>
Website: https://qarta-pay.vercel.app

Thank you,
<name>
```

No answer in two days: send the same to `tickets@reloadly.com` or open a ticket from the dashboard.

**After approval**

- Dashboard: toggle **Live** → **Developers** → **API Settings** → copy the live keys into the Vercel env only (`vercel env add … --sensitive`), set `RELOADLY_ENV=live`, redeploy.
- Fund the wallet from the dashboard: card, bank transfer, or crypto (minimum $50). Start with $100–300.

---

## 8. Mainnet (after everything above)

1. Buy real QIE and withdraw it to the **deployer address on the QIE Mainnet network itself**.
   - Not wQIE on Ethereum or BNB: that is another token on another chain. If the exchange asks for the network, pick QIE (chain 1990).
   - About $5 of QIE covers the deploy. Send some to the fulfiller for gas.
2. For testing, buy a little QUSDC at https://www.swap.dex.qie.digital/swap.
3. Run `docs/13-RUNBOOK.md` §2 in order: simulate, deploy, verify, `acceptOwnership`.
4. Share the `QartaCheckout` address and deploy block; the agent updates the config, README and the Vercel env for mainnet.
5. Place a few small real orders: a top-up to your own number in QUSDC, a gift card in QIE, and one with a wrong number to see the refund.

---

## 9. Telegram alerts (optional)

1. In Telegram open **@BotFather** → `/newbot` → pick a name → copy the **token**.
2. Create a team group, add the bot, send any message in the group.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and find `"chat":{"id":-100…}`: that is the chat id.
4. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to the Vercel env and redeploy.

---

## 10. Hackathon registration and submission

**Register now**: https://hackathon.qie.digital → **Register Now** → e-mail → OTP code → create the team account.

**Submit** (internal deadline 30 Nov, 18:00 CET): **Sign In** → submission form:

- GitHub repository: the repo URL, after making it Public
- Live demo URL: https://qarta-pay.vercel.app or the custom domain
- Deployed contract address: `QartaCheckout` on mainnet
- Track: **Commerce & Real World**

Screenshot the confirmation.

**Video (required), 2–3 minutes**: screen recording (OBS, or the phone's recorder):

- the problem (15 s)
- a real mainnet purchase from a phone (60 s)
- escrow and refund on the explorer (30 s)
- the Powered by QIE page (30 s)
- Stats page numbers (15 s)

Upload to YouTube as **Unlisted** and add the link to the README.

**Presentation (required)**: ask the agent for a deck.

---

## 11. Questions for the QIE team

Send to https://t.me/HovRonQiblockchain and `info@qie.digital`:

```
Hi QIE team, we are building Qarta Pay for Hackathon 3.0 (spend QIE/QUSDC on airtime and
gift cards, on-chain escrow). Three technical questions:
1. The QIE/USD oracle (0x3Bc6…3D17) sometimes goes 20+ hours without an update. Can it be
   updated at least hourly, or is there a deviation threshold we should know?
2. The WQIE/QUSDC pool on QIEDex is small (~$8.8k) and trades ~5% below the oracle.
   Is more liquidity planned?
3. What is the official way to resolve an address to its primary .qie name? The reverse
   resolver 0x76ec…171E returns "" for recently registered names.
Thank you!
```

Paste any answer into `CLAUDE.local.md`.

---

## 12. QIE Pass (P1, after launch)

1. https://getpass.qie.digital → create a partner account.
2. Open **Dashboard** → **Docs** and copy the whole page (auth, endpoints, claims) into a text file for the agent; it is behind a login.
3. Request sandbox and production keys from the same dashboard or from the QIE team.
