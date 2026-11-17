# 10 — Open Questions and Human Tasks

Update this file as answers arrive. When an item is resolved, move the answer into the relevant doc and tick it here.

## A. Ask the QIE team (Telegram `t.me/HovRonQiblockchain`, `info@qie.digital`)

- [x] Is AI-assisted development (e.g. coding agents) allowed? **Answered by the site FAQ (17 Nov 2026): "Yes, AI-assisted development is encouraged. Teams must fully understand and maintain their code and be able to explain architecture to judges."** See `02-HACKATHON.md`.
- [ ] What are the thresholds of the traction milestones? (The FAQ says "any 3 traction milestones within 90 days"; no numbers are published.)
- [x] Is a demo video required for 3.0? **Yes: the FAQ lists a demo video, documentation and a team presentation as mandatory.**
- [ ] Any required README or documentation format? Which of the three published judging-criteria lists is the one judges use?
- [ ] Team size limit? Country restrictions for prize payout? Is the prize paid in QIE tokens (as the terms say) at the USD value on payout day?
- [x] QIEDex router: is it a Uniswap V2 fork? **Measured: yes (Router02 selectors, 0.30% fee), see `probe-results.md` §4.** Still worth asking QIE to verify the source on the explorer.
- [ ] QIEDex: the WQIE/QUSDC pool holds only about $8.8k and traded 5.1% below the oracle price on 17 Nov 2026. Is more liquidity planned? Is there a deeper route to a stablecoin?
- [ ] QIE ID: official ABI or docs for forward and reverse resolution of `.qie` names? (We found working calls by probing, see `probe-results.md` §5, but nothing is published or verified.)
- [ ] QIE ID: which call is the canonical address → name lookup? The reverse resolver `0x76ec…171E` has not been written since 4 Jun 2026 and returns an empty string for new registrants. `userDomain(address)` on Registry B works, but Registry A has no equivalent, so wallets with a name only in Registry A cannot be reverse-resolved.
- [ ] QIE Pass: how do we get partner keys (sandbox + production) quickly for the hackathon? Is there a claim that simply says "KYC verified"? (The integration docs moved behind a login at `https://getpass.qie.digital/dashboard/docs`.)
- [ ] Oracle: what is the deviation threshold of the QIE/USD feed, and can it get a heartbeat? **Measured: no heartbeat; gaps up to 23 h 12 min; not on testnet** (`probe-results.md` §3). Ask QIE to update at least hourly during the hackathon.
- [x] Which EVM version does the chain support? **Measured: Shanghai (PUSH0 yes, Cancun no); EIP-1559 base fee present.** No official statement found.
- [ ] Recommended RPC for production dApps and its rate limits? Public RPC requests took 3–7 s each from our location. (`eth_getLogs` max range measured: 10,000 blocks.)
- [x] Is QUSDC available on testnet? Does QUSDC support EIP-2612 permit? **Measured: not on testnet (empty code); no permit.**
- [ ] Which countries have the most active QIE holders? (drives the launch catalog)
- [ ] Will the team help announce a "spend QIE" launch to the community?

## B. Ask Reloadly (`sales@reloadly.com`)

- [ ] Can a pre-incorporation hackathon team operate a live account as a Platform Client at low volume? What documents are required?
- [ ] Any restrictions on selling to end users who pay in crypto?
- [ ] Which gift card brands prohibit resale or crypto-funded purchase?
- [ ] Webhook signature scheme; idempotency behaviour of `customIdentifier`.
- [ ] Commission/discount tiers for our launch countries.

If Reloadly says no: fall back to Bitrefill's partner program (Business API is by application, not self-service) or DingConnect. The `Supplier` interface in the backend exists for this.

## C. Technical unknowns the agent resolves in Step 1 (probe)

Probe run on 17 Nov 2026. Evidence: `probe-results.md`; sources and confidence: `research-notes.md`.

- [x] QUSDC `decimals()` → 6
- [x] QIE/USD feed `decimals()` → 8. Real update interval → no heartbeat, median gap about 3 h, max 23 h 12 min
- [x] Router answers `factory()` / `WETH()` / `getAmountsOut` → yes. WQIE/QUSDC pair `0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe`, reserves 29,826 WQIE / 4,384 QUSDC
- [x] Pair `token0()` / `token1()` → WQIE / QUSDC. Reserve is above `DEX_MIN_RESERVE_QUSDC`. **But** the pool is 514 bps away from the oracle, above the 300 bps threshold → team decision in §F
- [x] Reverse resolver return format → full `alice.qie`; empty string when it knows no name
- [x] Router exact-native-in swap function → `swapExactETHForTokens`, confirmed by a swap on an anvil fork. The sweep can ship; its slippage limit needs a team decision (§F)
- [x] In-tx swap → **NO-GO** ($50 swap moves the pool price 2.23%)
- [x] `resolve(address)` returns a name for a known wallet → yes for resolver-era wallets (`0xfde4…0fde` → `molivo.qie`), **but empty for wallets registered recently**. Fallback found: `userDomain(address)` on Registry B. Still not covered: wallets whose only name is in Registry A (question in §A). P0 name display ships with the two-call read and the short-address fallback. Forward lookup → `resolver(string)` / `domainInfo(string)` on both registries (no verified ABI on the explorer; signatures from the official app bundle and live calls)
- [ ] Does the QIEDex swap page accept token query parameters for a "Get QUSDC" deep link? The site's JS reads `tokenA`, `tokenB` and `tab`; untested. Needs a human to try it in a browser. Default stays the plain link.
- [x] PUSH0 → executes in `eth_call` on mainnet and testnet (a real testnet deployment still needs a funded key). EIP-1559 → base fee present. Block time → 3.63 s
- [ ] Explorer verification API works with `forge verify-contract --verifier blockscout` → explorer is Blockscout v7.0.2 and the API is live; the command itself is not run yet (needs a funded testnet key)
- [ ] Reloadly: operator fields, list-by-country path, gift card code path and order statuses are confirmed from Reloadly's official OpenAPI repos. Still open, all need sandbox credentials: current status response shape, PIN field name, duplicate `customIdentifier` behaviour, sandbox behaviour for `REFUNDED`, gift card `RANGE` behaviour. Webhook signature scheme: not found anywhere public
- [ ] QIE Wallet on mobile: in-app browser with an injected provider? WalletConnect? Not answered by any public source → needs a human test on a phone

## D. Business / legal decisions for the team (not for the agent)

- [ ] Operating entity. Reloadly's terms restrict accounts to business entities; decide who signs up and under what name.
- [ ] Jurisdictions. Selling prepaid value for crypto can be regulated; some countries restrict crypto payments for goods. Decide which countries to serve and state it in the Terms of Use. Get proper advice before scaling beyond the hackathon; these docs are not legal advice.
- [ ] Terms of Use + Privacy Policy pages (required for a real launch; we store phone numbers).
- [ ] Refund policy wording (on-chain refund is automatic; what about a wrong phone number entered by the user? Default: not refundable once delivered, and say so before payment).
- [ ] Abuse controls. Gift cards attract fraud and laundering; keep limits low without identity, raise them only for QIE-Pass-verified wallets (a `.qie` name alone qualifies for cashback, not for higher limits).
- [ ] Float size and who funds it; treasury conversion routine; who is on call.
- [ ] Brand usage: gift card brand names/logos come from the supplier feed; do not imply partnership with any brand.

## E. Risks to watch

| Risk | Mitigation |
|------|------------|
| Supplier account frozen during demo week | Contact sales early; keep float small; second supplier application in parallel |
| QIE price moves between payment and conversion | Short QIE quote TTL, spread, oracle guard, QIEDex cross-check, daily QIEDex sweep, in-tx swap only on GO |
| Thin QIEDex liquidity | In-tx swap only on GO (decision rule in `04-SMART-CONTRACTS.md`); sweep in small chunks with an oracle-bound `minOut`; cross-check fails closed (QIE quotes refused, QUSDC unaffected) |
| QIEDex router unverified / not V2-compatible | Sweep falls back to manual swaps in the QIEDex UI; cross-check needs only the pair's V2 reads; Get QUSDC link needs nothing |
| QIE ID resolver wrong or unavailable | Name display falls back to the short address; names never gate payments, refunds or limits (only P1 cashback eligibility, which also accepts QIE Pass) |
| Hot key leak (fulfiller) | It can only settle to treasury or refund to payers; it cannot redirect funds. Rotate via `owner`. |
| Quote signer leak | Could sign under-priced quotes: oracle guard for QIE, per-order and daily caps in the backend, pause switch |
| Double fulfilment | DB status preconditions + `customIdentifier` lookup before retry |
| RPC instability | Multiple RPC URLs, indexer cursor, idempotent handlers |
| Being judged a clone | Lead with escrow, native QIE, identity and oracle integration; cite the differences explicitly |

## F. Decisions after the Step 1 probe (17 Nov 2026)

The probe found facts that the original defaults did not survive. The team accepted the proposals below on 17 Nov 2026; the relevant docs carry the new values.

- [x] **Oracle age.** The QIE/USD feed has no heartbeat; gaps reach 23 h. Decision: contract `maxOracleAge` = 86,400 s (24 h) and `oracleToleranceBps` = 1,000, both still owner-configurable; backend `ORACLE_MAX_AGE_S` = 86,400. The guard stays a floor against a wildly wrong quote; it no longer proves freshness. Still ask QIE for hourly updates (§A).
- [x] **Price source for QIE quotes.** Revenue in QIE converts only on QIEDex, where the price was 5.1% below the oracle, more than the 4% margin. Decision: quote QIE at `min(oracle price, QIEDex pool price)` and keep `QIE_SPREAD_BPS`. The on-chain guard still passes because the user pays more QIE, never less.
- [x] **Cross-check threshold.** Decision: `DEX_ORACLE_MAX_DEVIATION_BPS` = 1,500. QIE quotes are refused when the pool and the oracle differ by more than that in either direction. Fail-closed behaviour is unchanged.
- [x] **Sweep slippage.** Decision: `SWEEP_MAX_SLIPPAGE_BPS` default 700, `SWEEP_MAX_ORACLE_AGE_S` default 86,400, chunks of at most about 130 QIE (about $20), which move the pool price under 1%.
- [x] **Refund race.** Decision: the worker never starts or retries a supplier call after `paidAt + refundTimeout − 45 min` (`FULFIL_CUTOFF_BEFORE_TIMEOUT_S` = 2,700); it refunds instead. `refundTimeout` stays 2 h.
- [x] **Repo hygiene.** Done 17 Nov 2026: `git init`, `.gitignore`, `.env.example`, `.claude/settings.json` deny rules.
- [x] **Node version.** Decision: develop and run CI on Node 22 (installed, current LTS line); `engines` is `>=20` so Node 20 hosts still work.
- [ ] **QUSDC is scarce** (total supply about 9,022). Most users will pay in native QIE. Open: make QIE the default pay token in the UI? Not decided.
