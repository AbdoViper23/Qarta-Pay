# 11 — Security and Secrets

## What never goes into git

- Private keys, mnemonics, keystore passwords
- Reloadly `client_secret` (test or live), QIE Pass secret keys
- `CODE_ENCRYPTION_KEY`, session/JWT secrets, database URLs with passwords
- Bot tokens (`TELEGRAM_BOT_TOKEN`), hosting tokens
- `CLAUDE.local.md` (private team context)
- Anything under `secrets/`
- Real customer data, gift card codes, logs from production

`.gitignore` covers these (created 17 Nov 2026). CI runs `gitleaks` on every push. If a secret is ever committed: rotate it immediately, then remove it; rewriting history is not enough.

## Where secrets live

| Secret | Local dev | Production |
|--------|-----------|------------|
| Reloadly test creds | `apps/api/.env` | — |
| Reloadly live creds | never on laptops | hosting provider's secret store |
| `QUOTE_SIGNER_KEY`, `FULFILLER_KEY` | throwaway dev keys in `apps/api/.env` | hosting provider's secret store |
| Deployer key | Foundry encrypted keystore (`cast wallet import`) | same, on one team member's machine |
| Treasury key (used by `SweepTreasury.s.sol`) | testnet/anvil keys only | Foundry encrypted keystore `qarta-treasury` on one team member's machine; never in the backend or any `.env` |
| Owner key | hardware/cold wallet | hardware/cold wallet |
| DB URL, encryption key, session secret | `apps/api/.env` | hosting provider's secret store |

Each workspace has its own `.env.example` (`apps/api/`, `apps/web/`, `contracts/`) listing every variable name with a dummy value; the root `.env.example` only points to them. Keep them in sync whenever a variable is added.

Non-secret config added for the QIE integrations (add to `.env.example` when the workspaces are scaffolded): API `ORACLE_MAX_AGE_S`, `QIEDEX_WQIE_QUSDC_PAIR`, `DEX_ORACLE_MAX_DEVIATION_BPS`, `DEX_MIN_RESERVE_QUSDC`, `DEX_PRICE_CHECK_ENABLED`, `FULFIL_CUTOFF_BEFORE_TIMEOUT_S` (see `05-BACKEND.md`), `RELOADLY_ENV` (`sandbox` or `live`; the smoke script runs only with `sandbox`), `RELOADLY_SMOKE_PHONE`, `RELOADLY_SMOKE_COUNTRY`, `RELOADLY_SMOKE_GIFTCARD_COUNTRY`, `RELOADLY_SMOKE_EMAIL` (inputs of the sandbox smoke script); `WEB_ORIGIN`, `RELOADLY_ORDER_EMAIL`, `SUPPLIER` (`fake` for local runs only; refused on mainnet), `SUPPLIER_POLL_MAX_S`, `PRICE_CACHE_MS`, `WORKER_POLL_MS`, `INDEXER_POLL_MS`, `FULFILLER_MIN_BALANCE_WEI`, `SUPPLIER_MIN_BALANCE_USD`, `QIE_REVERSE_RESOLVER`, `QIE_NAME_REGISTRY_B`, `QUSDC_ADDRESS`/`QIE_USD_FEED`/`QIEDEX_WQIE_QUSDC_PAIR`/`WQIE_ADDRESS` (API overrides for testnet mocks), `DEV_DB_PORT` (local embedded Postgres); web `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`; web `NEXT_PUBLIC_QIEDEX_SWAP_URL`; sweep script `SWEEP_AMOUNT_WEI`, `SWEEP_MAX_SLIPPAGE_BPS`, `SWEEP_GAS_RESERVE_WEI`, `SWEEP_MAX_ORACLE_AGE_S`, `TREASURY_ADDRESS`, `QIEDEX_ROUTER`, `WQIE_ADDRESS`, `QUSDC_ADDRESS`, `QIE_USD_FEED` (see `04-SMART-CONTRACTS.md`); deploy script `QUOTE_SIGNER_ADDRESS`, `FULFILLER_ADDRESS`, `OWNER_ADDRESS`, `MAX_ORACLE_AGE_S`, `ORACLE_TOLERANCE_BPS`, `ORACLE_GUARD_ENABLED`, `REFUND_TIMEOUT_S`, `DEPLOY_MOCKS`; fork tests `FORK_BLOCK`. None of them is a secret.

## Treasury sweep rules

- The agent may run `SweepTreasury.s.sol` only as a fork simulation (no `--broadcast`). A human broadcasts on mainnet after reading the simulation output.
- `minOut` is always derived from the oracle price, never from the router's quote alone.
- The sweep sends only from `treasury` to `treasury`. It never touches `QartaCheckout` or escrowed funds.

## Key roles (least privilege)

| Key | Hot? | Power | If leaked |
|-----|------|-------|-----------|
| `owner` | cold | configure, pause | full control → keep offline |
| `deployer` | used once | deploys, then hands ownership to `owner` | nothing after handover |
| `quoteSigner` | hot | signs prices | under-priced sales, bounded by caps and the oracle guard; rotate via `owner` |
| `fulfiller` | hot | settle → treasury, refund → payer | can refund or settle early, cannot steal; rotate via `owner` |
| `treasury` | warm | holds revenue; signs the QIEDex sweep (human-run) | loss of revenue held → sweep regularly |

Use five different addresses. Never reuse the deployer as signer or fulfiller.

## Rules for the coding agent

- Do not read, print, echo, log or copy the contents of `.env`, `.env.local`, `.env.production`, `secrets/**` or any keystore. If a value is needed to proceed, ask the human to set it and continue with the variable **name**.
- Use only test credentials and testnet/anvil keys in commands you run. Never run a command that broadcasts to **mainnet** or calls the **live** Reloadly API; prepare the exact command and hand it to the human.
- Never hard-code an address that holds funds or any credential in source; read from config.
- Never put secrets or personal data in test fixtures; scrub recorded supplier responses (phone numbers, emails, codes).
- When adding a new secret: add its name to `.env.example` with a dummy value and document it here.
- Do not weaken a security check to make a test pass.

The repo ships `.claude/settings.json` with deny rules for the secret paths as a second line of defence.

## Application security checklist

- [ ] All external input validated with zod; phone numbers normalised with `libphonenumber-js`
- [ ] Rate limits on quote creation and auth endpoints
- [ ] Gift card codes: AES-256-GCM at rest, revealed only to the entitled wallet after SIWE, never logged, never in URLs
- [ ] SIWE: nonce single-use, domain and chain ID checked, short session lifetime
- [ ] CORS restricted to the production web origin
- [ ] Fulfil only on confirmed, exactly-matching `OrderPaid` events
- [ ] Idempotent handlers; DB status preconditions on every transition
- [ ] Supplier balance and per-wallet/global caps enforced server-side
- [ ] Webhooks treated as hints until signature verification is implemented
- [ ] Dependencies pinned with a lockfile; `pnpm audit` in CI
- [ ] Contract: tests + invariants green; `slither` run and findings triaged; ownership transferred to cold wallet; source verified
- [ ] Admin actions (pause, limits) documented in a runbook in `CLAUDE.local.md` or a private doc

## Privacy

We store wallet addresses, recipient phone numbers and order details. Store the minimum, mask phone numbers in public endpoints and logs (`+234••••5678`), and publish a privacy policy before public launch.
