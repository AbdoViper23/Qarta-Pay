# 13 — Runbook: deploy and operate

Exact commands for the human steps. Nothing here is run by the coding agent on mainnet (CLAUDE.md). Values in `<angle brackets>` are yours; addresses go in `CLAUDE.local.md`, keys never go in any file.

```bash
export PATH="$PATH:$HOME/.foundry/bin"
cd contracts
```

## 0. Keys (once)

Five different wallets (`docs/11-SECURITY-AND-SECRETS.md`): owner (cold), deployer, quoteSigner, fulfiller, treasury.

```bash
cast wallet import qarta-deployer --interactive    # asks for the private key and a password
cast wallet import qarta-treasury --interactive    # used only by the sweep script
cast wallet import qarta-owner --interactive       # only if the owner is not a hardware wallet
```

The quoteSigner and fulfiller keys go only into the API host's secret store (`QUOTE_SIGNER_KEY`, `FULFILLER_KEY`). Fund the fulfiller with a little QIE for gas (settle/refund cost a fraction of a cent).

## 1. Testnet (chain 1983)

Testnet has no QUSDC, oracle or QIEDex, so the deploy script brings mocks (`DEPLOY_MOCKS=true`).

```bash
# fund the deployer from https://www.qie.digital/faucet first
export QUOTE_SIGNER_ADDRESS=<signer> FULFILLER_ADDRESS=<fulfiller> TREASURY_ADDRESS=<treasury> OWNER_ADDRESS=<owner>
DEPLOY_MOCKS=true forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc1testnet.qie.digital --account qarta-deployer --sender <deployer> --broadcast
```

The output prints `QartaCheckout`, `MockERC20 (QUSDC)`, `MockAggregatorV3 (feed)`, `MockPair (WQIE/QUSDC)`, `mock WQIE address` and the deploy block. Then:

```bash
# verify the source (also tests the Blockscout verifier)
forge verify-contract <QartaCheckout> src/QartaCheckout.sol:QartaCheckout --verifier blockscout \
  --verifier-url https://testnet.qie.digital/api/ --chain-id 1983 --guess-constructor-args
# second step of the ownership handover, from the owner wallet
cast send <QartaCheckout> "acceptOwnership()" --rpc-url https://rpc1testnet.qie.digital --account qarta-owner
# give a test wallet some mock QUSDC (anyone can mint the mock)
cast send <MockERC20> "mint(address,uint256)" <your wallet> 1000000000 --rpc-url https://rpc1testnet.qie.digital --account qarta-deployer
```

API env for testnet: `CHAIN_ID=1983`, `RPC_URLS=https://rpc1testnet.qie.digital`, `CHECKOUT_ADDRESS`, `START_BLOCK=<deploy block>`, `RELOADLY_ENV=sandbox`. The mock addresses come from `packages/shared/config/qie-testnet.json`; set `QUSDC_ADDRESS`, `QIE_USD_FEED`, `QIEDEX_WQIE_QUSDC_PAIR`, `WQIE_ADDRESS` only after a new deploy, until that file is updated. Web: `NEXT_PUBLIC_CHAIN_ID=1983`.

**Current testnet deployment (19 Nov 2026):** `QartaCheckout` `0x07522573bE0C3C7E9A6D48Eda0a38D8408724f62`, `START_BLOCK=9863130`; mocks in `qie-testnet.json` and `docs/probe-results.md` §7. The mock price is $5 per QIE so the faucet's 2 QIE a day can pay for test orders.

### Try it on testnet

```bash
# API on testnet with the fake supplier (until Reloadly sandbox credentials are in apps/api/.env)
cd apps/api && CHAIN_ID=1983 CHECKOUT_ADDRESS=0x07522573bE0C3C7E9A6D48Eda0a38D8408724f62 START_BLOCK=9863130 SUPPLIER=fake pnpm start
# one purchase from a keystore wallet: QUSDC, QIE, or a failed delivery (refund path)
API=http://127.0.0.1:4000 ACCOUNT=qarta-deployer PAY_TOKEN=QUSDC bash scripts/testnet-buy.sh
API=http://127.0.0.1:4000 ACCOUNT=qarta-deployer PAY_TOKEN=QIE bash scripts/testnet-buy.sh
API=http://127.0.0.1:4000 ACCOUNT=qarta-deployer PHONE=08031230000 bash scripts/testnet-buy.sh
# web: apps/web/.env.local with NEXT_PUBLIC_API_URL=http://localhost:4000 and NEXT_PUBLIC_CHAIN_ID=1983, then
pnpm --filter web dev
```

The mock feed goes stale after `MAX_ORACLE_AGE_S` (24 h): QIE quotes stop and the contract rejects QIE payments. Refresh it (anyone may call the mock):

```bash
cast send 0x25998aaDd5992c3480204DE1BBf2e631809c7c77 "setAnswer(int256)" 500000000 --rpc-url https://rpc1testnet.qie.digital --account qarta-deployer
```

Test QUSDC for any wallet: `cast send 0x52259E57Ba961292a23AB4F78D3C815d84030B42 "mint(address,uint256)" <wallet> 100000000 --rpc-url https://rpc1testnet.qie.digital --account qarta-deployer` (100 QUSDC).

QIE Wallet hides testnet until it is enabled in its settings.

## 2. Mainnet (chain 1990) — human only

Checklist before running it: contract reviewed line by line by the team; testnet run done; Reloadly live account approved and funded.

```bash
export QUOTE_SIGNER_ADDRESS=<signer> FULFILLER_ADDRESS=<fulfiller> TREASURY_ADDRESS=<treasury> OWNER_ADDRESS=<owner cold wallet>
export QUSDC_ADDRESS=0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5
export QIE_USD_FEED=0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17
export MAX_ORACLE_AGE_S=86400 ORACLE_TOLERANCE_BPS=1000 ORACLE_GUARD_ENABLED=true REFUND_TIMEOUT_S=7200 DEPLOY_MOCKS=false

# 1. simulate (no --broadcast): read the printed addresses and owner
forge script script/Deploy.s.sol:Deploy --rpc-url https://rpc1mainnet.qie.digital --sender <deployer>
# 2. deploy
forge script script/Deploy.s.sol:Deploy --rpc-url https://rpc1mainnet.qie.digital \
  --account qarta-deployer --sender <deployer> --broadcast
# 3. verify
forge verify-contract <QartaCheckout> src/QartaCheckout.sol:QartaCheckout --verifier blockscout \
  --verifier-url https://mainnet.qie.digital/api/ --chain-id 1990 --guess-constructor-args
# 4. owner accepts from the cold wallet
cast send <QartaCheckout> "acceptOwnership()" --rpc-url https://rpc1mainnet.qie.digital --account qarta-owner
cast call <QartaCheckout> "owner()(address)" --rpc-url https://rpc1mainnet.qie.digital   # must print the cold wallet
```

Then record the address in `packages/shared/config/qie-mainnet.json` (`qartaCheckout`), the README integrations table, and `CLAUDE.local.md` (with the deploy block).

If a broadcast is rejected for the transaction type, add `--legacy`.

## 3. Hosting

### Vercel, free plan (what runs today)

One Vercel project, `qarta-pay`, built from the repo root with `vercel.json` (Vercel Services): `web` (Next.js, `apps/web`) answers `/`, `api` (Fastify, `apps/api/src/vercel.ts`) answers `/api/*`. Same origin, so no CORS. The GitHub repo is connected: every push to `main` deploys production, other branches get preview URLs. Database: Neon (Vercel Marketplace, free), which sets `DATABASE_URL` on the project.

Nothing runs between requests on Vercel, so the API has no loops there (`src/jobs.ts`):
- every GET to the API kicks one pass of indexer → worker → housekeeping (kept alive with `waitUntil`), at most every 4 s per instance; the order page polls while the buyer waits, which drives that order to `SETTLED`;
- a lease row in `job_lease` lets one pass run at a time across all instances (no fulfiller nonce races);
- `GET /api/v1/jobs/run` with `Authorization: Bearer $CRON_SECRET` runs one pass on demand. Vercel's cron calls it once a day (the Hobby limit); `.github/workflows/jobs.yml` calls it every 30 minutes once the GitHub secrets `JOBS_URL` (`https://<domain>/api/v1/jobs/run`) and `CRON_SECRET` are set. An order paid by someone who closed the tab waits for the next pass.

Project env (Production and Preview): every variable of `apps/api/.env.example` that has no default, plus `DB_POOL_MAX=3`, `CRON_SECRET`, `NEXT_PUBLIC_API_URL=/api`, `NEXT_PUBLIC_CHAIN_ID`, `ENABLE_EXPERIMENTAL_COREPACK=1` (so Vercel uses the repo's pnpm 12) and `WEB_ORIGIN=https://<production domain>` (Sign-In checks it). After changing env, redeploy (`vercel --prod` or push). `vercel build` checks the whole build locally.

```bash
vercel env ls                                   # names only
vercel --prod                                   # deploy the working tree to production
vercel logs <deployment-url>                    # function logs
curl https://<domain>/api/healthz
```

Limits of the free plan: functions stop after 300 s (the job lease is 310 s), cron once a day. Upgrade path if traffic grows: run `apps/api/src/main.ts` (loops) on any container host and keep the web on Vercel.

### Long-running host (alternative)

| Piece | Where | Settings |
|-------|-------|----------|
| PostgreSQL | any managed Postgres (Railway, Render, Neon, Supabase) | copy its URL into `DATABASE_URL` |
| API (API + indexer + worker, one process) | Railway / Render / Fly with `apps/api/Dockerfile`, built from the repo root | every variable of `apps/api/.env.example`, as secrets; one instance only; `CRON_SECRET` empty |
| Web | Vercel, root directory `apps/web` | `NEXT_PUBLIC_API_URL=<API URL>`, `NEXT_PUBLIC_CHAIN_ID=1990`, `NEXT_PUBLIC_QIEDEX_SWAP_URL` |

The API migrates the database on start. Set `WEB_ORIGIN` to the exact web URL (CORS and Sign-In use it). Start with `MAX_ORDER_USD=10` and raise it as the float grows.

Mainnet API values: `CHAIN_ID=1990`, `RPC_URLS=https://rpc1mainnet.qie.digital,https://rpc2mainnet.qie.digital,https://rpc5mainnet.qie.digital`, `CHECKOUT_ADDRESS`, `START_BLOCK`, `RELOADLY_ENV=live` with the live credentials. The QIE addresses come from `packages/shared/config/qie-mainnet.json`; leave their overrides empty.

## 4. Daily operations

| Task | How |
|------|-----|
| Pause sales (keeps refunds working) | API: `SALES_PAUSED=true` and restart. Contract (stronger): owner calls `cast send <QartaCheckout> "pause()" --account qarta-owner --rpc-url …` |
| Health | `GET /healthz` (indexer lag, supplier balance), alerts in the Telegram chat (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) |
| Orders needing a human | `pnpm --filter api review list`, check the order at the supplier (Reloadly dashboard, search the order id as custom identifier), then `review delivered <id>` or `review refund <id>`. Never refund an order the supplier delivered |
| Top up the Reloadly float | Reloadly dashboard → wallet. Alerts fire below `SUPPLIER_MIN_BALANCE_USD` |
| Fulfiller gas | Send QIE to the fulfiller address. Alerts fire below `FULFILLER_MIN_BALANCE_WEI` |
| Treasury sweep QIE → QUSDC | below |
| Oracle feed stale for long | QIE quotes stop by themselves (`ORACLE_MAX_AGE_S`); QUSDC keeps working. Owner may `setOracleGuardEnabled(false)` only if needed; record every toggle here |
| Rotate a leaked signer or fulfiller | owner: `setQuoteSigner(<new>)` / `setFulfiller(<new>)`, then update the API secret and restart |

### Treasury sweep

```bash
export TREASURY_ADDRESS=<treasury> QIEDEX_ROUTER=0x08cd2e72e156D8563B4351eb4065C262A9f553Ef \
  WQIE_ADDRESS=0x0087904D95BEe9E5F24dc8852804b547981A9139 QUSDC_ADDRESS=0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5 \
  QIE_USD_FEED=0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17 \
  SWEEP_AMOUNT_WEI=130000000000000000000 SWEEP_GAS_RESERVE_WEI=1000000000000000000 SWEEP_MAX_SLIPPAGE_BPS=700
# simulate on a fork and read the planned min out
forge script script/SweepTreasury.s.sol:SweepTreasury --fork-url https://rpc1mainnet.qie.digital --sender $TREASURY_ADDRESS -vvvv
# broadcast
forge script script/SweepTreasury.s.sol:SweepTreasury --rpc-url https://rpc1mainnet.qie.digital \
  --account qarta-treasury --sender $TREASURY_ADDRESS --broadcast
```

Chunks of about 130 QIE move the pool under 1%. If the script aborts with `SweepPoolOffPrice`, the pool is too far below the oracle: wait or use a smaller chunk.
