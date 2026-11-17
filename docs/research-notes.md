# Research Notes

All findings are dated **17 Nov 2026**. Raw chain output is in `probe-results.md`; this file gives the answer, the source and a confidence label for each open item.

Labels: **VERIFIED** (confirmed by our own call or an official source), **THIRD-PARTY** (credible but not official or not re-tested), **STILL UNKNOWN**.

## Summary of what changes the plan

1. **The QIE/USD oracle is slow.** It has no heartbeat; gaps between updates reach 23 hours. The placeholder `maxOracleAge` / `ORACLE_MAX_AGE_S` of 900 s would block almost every native-QIE sale.
2. **The QIEDex pool is thin and off-price.** About $8.8k of liquidity; it trades 5.1% below the oracle. The 300 bps cross-check would refuse every QIE quote today, and the sweep's 100 bps slippage limit would abort every sweep.
3. **In-tx swap is NO-GO.**
4. **QUSDC supply is about 9,022 tokens.** Native QIE will be the main way users pay; the QIE path cannot be treated as secondary.
5. **The `.qie` reverse resolver is stale.** `resolve(address)` works only for wallets set by QIE's admin key (last in June 2026). Name display needs a second call, `userDomain(address)` on Registry B, and still shows nothing for wallets whose only name is in Registry A.
6. **AI-assisted development is allowed and encouraged** (hackathon FAQ), and a **demo video is mandatory**.

---

## 2.1 QIE chain

| Item | Answer | Source | Confidence |
|------|--------|--------|------------|
| QUSDC `decimals()` | 6 | `cast call` (probe §2) | VERIFIED |
| QUSDC `symbol()` | `QUSDC` | `cast call` | VERIFIED |
| QUSDC EIP-2612 permit | No. `DOMAIN_SEPARATOR()` and `nonces(address)` revert; the verified source has no permit | `cast call`; `https://mainnet.qie.digital/api/v2/smart-contracts/0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5` | VERIFIED |
| QUSDC transfer behaviour | Plain OpenZeppelin v5.1 ERC-20. No fee on transfer, no blacklist, no pause. `VAULT_ROLE` can mint and can burn from any address | verified source on the explorer | VERIFIED |
| QUSDC total supply | 9,022.13 QUSDC | `totalSupply()` | VERIFIED |
| QIE/USD feed `decimals()` | 8 | `cast call` | VERIFIED |
| QIE/USD feed update interval | No heartbeat. 24 updates in 5.3 days, median gap about 3 h, max 23 h 12 min, min 3 min. Unchanged during a 25-minute watch | `getRoundData` for rounds 20215–20239 (probe §3) | VERIFIED |
| Feed update mechanism | Single owner key calls `updateAnswer(int256)` | verified source on the explorer | VERIFIED |
| EIP-1559 | `baseFeePerGas` present (1 gwei); `eth_maxPriorityFeePerGas` answers | `eth_getBlockByNumber` | VERIFIED at RPC level; a real type-2 transaction is untested |
| Block time | 3.63 s (100-block average) | block timestamps; explorer `/api/v2/stats` says 3.626 s | VERIFIED |
| `eth_getLogs` max range | 10,000 blocks. Error above that: `maximum [from, to] blocks distance: 10000` | `eth_getLogs` | VERIFIED |
| RPC rate limits | None documented, none hit at about 1 req/s. Every request takes 3–7 s from our location; one call hung over 60 s | timing of calls | THIRD-PARTY (our observation; no official figure) |
| PUSH0 / EVM version | PUSH0 executes on mainnet and testnet in `eth_call`. TSTORE (`0x5d`) is "not defined". Shanghai level, no Cancun | `eth_call` with init code (probe §1) | VERIFIED by simulation. A real testnet deployment is not done (needs a funded key) |
| Official statement on EVM version | None found. The docs say only "fully compatible with the EVM"; the Hardhat example uses `solidity: "0.8.20"` with no `evmVersion` | `https://docs.qie.digital/developer-docs/smart-contract-deployment/deploy-using-hardhat` (docs MCP) | STILL UNKNOWN (official); measured answer above |

Decision: `evm_version = "paris"` stays. Solidity 0.8.24 is fine.

Consequences:

- Indexer catch-up chunks of ≤ 1,000 blocks (as planned) are well inside the 10,000 limit.
- With 3–7 s per RPC request, a 2–3 s poll interval is not reachable. Poll as fast as responses allow and send requests to several RPC hosts.
- Official docs list five mainnet RPC hosts (`rpc1`…`rpc5`); all five answered.

## 2.2 Explorer

| Item | Answer | Source | Confidence |
|------|--------|--------|------------|
| Explorer software | Blockscout v7.0.2 on mainnet and testnet | `GET /api/v2/config/backend-version` | VERIFIED |
| Etherscan-compatible API | Yes: `/api?module=contract&action=getabi&address=…` returns the ABI | curl | VERIFIED |
| Blockscout REST API | Yes: `/api/v2/smart-contracts/{address}`, `/api/v2/addresses/{address}`, `/api/v2/transactions/{hash}/logs` | curl | VERIFIED |
| ABIs obtained | QUSDC and the QIE/USD feed (both verified). Saved in `packages/shared/abi/` | explorer API | VERIFIED |
| ABIs not available | QIEDex router, factory, pair, WQIE, reverse resolver, both name-registry implementations: none is verified | explorer API | VERIFIED (that they are missing) |
| `forge verify-contract` command | `forge verify-contract <addr> src/QartaCheckout.sol:QartaCheckout --verifier blockscout --verifier-url https://mainnet.qie.digital/api/ --chain-id 1990` (testnet: `https://testnet.qie.digital/api/`, `--chain-id 1983`). This is the standard Blockscout form and the API is live | Foundry docs form + live API check | THIRD-PARTY: not run yet. Needs a deployed contract (funded testnet key) |

For the unverified contracts, `packages/shared/abi/README.md` lists the function signatures that were confirmed by live calls. They are hand-assembled, not published ABIs.

## 2.3 QIEDex

| Item | Answer | Source | Confidence |
|------|--------|--------|------------|
| Router is a Uniswap V2 fork | Yes. Its 24 selectors are exactly the `Router02` set; `factory()`, `WETH()`, `getAmountsOut` answer | `cast selectors`, `cast call` | VERIFIED |
| Native wrapper getter | `WETH()` (not renamed), returns WQIE | `cast call` | VERIFIED |
| Exact-native-in swap function | `swapExactETHForTokens(uint256,address[],address,uint256)` | read-only `eth_call` on mainnet and a real swap on an anvil fork | VERIFIED |
| Exact-out variant | `swapETHForExactTokens` selector `0xfb3bdb41` is present | `cast selectors` | VERIFIED (presence); not executed |
| WQIE/QUSDC pair | `0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe`; `token0` = WQIE, `token1` = QUSDC | `getPair`, `token0()`, `token1()` | VERIFIED |
| Reserves | 29,826.14 WQIE and 4,383.76 QUSDC (about $8.8k total) | `getReserves()` | VERIFIED |
| Swap fee | 0.30% | `getAmountsOut` reproduced exactly with the 997/1000 formula at four sizes | VERIFIED |
| Pool price vs oracle | $0.146976 vs $0.154942: pool is 514 bps below | bigint math on reserves and feed | VERIFIED |
| $10 swap | receive 9.947442 QUSDC; 53 bps shortfall incl. fee; pool price moves 45 bps | `getAmountsOut` + math | VERIFIED |
| $50 swap | receive 49.289826 QUSDC; 143 bps shortfall incl. fee; pool price moves 223 bps | `getAmountsOut` + math | VERIFIED |
| Protocol fee switch | `feeTo()` is the zero address | `cast call` | VERIFIED |
| Anvil fork of QIE mainnet | Works | fork swap succeeded, 120,109 gas | VERIFIED |
| "Get QUSDC" deep link | The swap site's JS reads URL parameters `tokenA`, `tokenB` and `tab`. Which page uses them and the accepted values are untested | bundle of `https://www.swap.dex.qie.digital/swap` | THIRD-PARTY. Keep the plain link until a human tests it in a browser |

**In-tx swap: NO-GO.** The decision rule needs a $50 order to move the price under 1%; it moves the pool price 2.23%.

Effects on P0 items:

- **Price cross-check.** The pair reads work and the reserve (4,384 QUSDC) is above the 1,000 QUSDC placeholder. But the measured deviation is 514 bps against a 300 bps threshold, so every QIE quote would be refused right now. The explorer's CoinGecko price ($0.15485) agrees with the oracle, so the pool is the one that is off. Team decision needed: see `10-OPEN-QUESTIONS.md` §F.
- **Treasury sweep.** The router works, so the sweep can ship. With `SWEEP_MAX_SLIPPAGE_BPS = 100` measured against the oracle it would abort today (the pool pays about 5.4% less than the oracle price for small sizes). Team decision needed.
- **Value of collected QIE.** Revenue in QIE can only be converted at the pool price, which is 5% under the oracle price. Pricing QIE quotes from the oracle alone would overvalue what we receive by about 5–6%, more than the 4% margin.

## 2.4 QIE ID

| Item | Answer | Source | Confidence |
|------|--------|--------|------------|
| Official developer docs | None found. `docs.qie.digital` mentions "the QIE Domains registry" once, with no ABI or address | docs MCP search | STILL UNKNOWN |
| Reverse resolution | `resolve(address)` on `0x76ec…171E` returns the full name, for example `"molivo.qie"`. `defaultDomain(address)` returns the same | `cast call` (probe §5) | VERIFIED |
| Return format | Includes the `.qie` suffix. Empty string when there is no primary name; no revert | `cast call` | VERIFIED |
| Owning a name ≠ having a primary name | Two wallets that registered names on 16 Nov 2026 resolve to `""` | `cast call` | VERIFIED |
| Who writes the resolver | Setter `0x484a49da(address,bytes)`. The last 50 calls all came from the contracts' owner key; latest on 4 Jun 2026. The resolver is not updated for new names | explorer transaction list | VERIFIED (observation) |
| Reverse fallback | `userDomain(address) returns (string)` on Registry B returns the wallet's default name, including for new registrants the resolver misses. Registry A has no such function | ABI inside the official app bundle (`https://id.qie.digital/assets/index-Bte7PtYR.js`) + `cast call` | VERIFIED |
| Wallets with a name only in Registry A | No working reverse lookup found (`userDomains(address,uint256)` reverts) | `cast call` | STILL UNKNOWN |
| User-facing "set default" | The app's ABI has `setDefault(uint256 tokenID_, address currencyAddress_, bool isFree_)`; target contract not traced | app bundle | THIRD-PARTY |
| Forward lookup | `domainInfo(string)` on each registry, with the full `name.qie`. Returns a struct `(string name, address nft, address owner, uint256 registeredAt, uint256 tokenId)`. `domainExist(string)` tells which registry holds the name | `cast call` on both registries | VERIFIED |
| Both registries | A name is in exactly one of A or B. The resolver lists B at index 0 and A at index 1 | `cast call` | VERIFIED |
| Verified registry ABI | Not available. Registry B's *proxy* is verified, but its implementation is not | explorer API | VERIFIED (that it is missing) |
| `resolver(string)` | Returns `(uint256 tokenId, address owner)`; this is the call the official app uses for name → address | app bundle ABI + `cast call` on both registries | VERIFIED |
| Name NFT | `0x9aab56e7727af53A3131985BFB16d845319b7bdc`; `ownerOf(tokenId)` gives the current owner | `cast call` | VERIFIED |

Effect on P0 name display: read in this order: `resolve(address)` on the resolver, then `userDomain(address)` on Registry B, then the short address. This covers resolver-era wallets and every wallet with a name in Registry B. It does **not** cover a wallet whose only name is in Registry A; recent registrations go to both registries, so some real users will see a short address although they own a name. The team's demo wallet must be checked with both calls before the demo. Question added to `10-OPEN-QUESTIONS.md` §A.

## 2.5 QIE Pass

| Item | Answer | Source | Confidence |
|------|--------|--------|------------|
| `https://qiepass.qie.digital/integration-docs` | Now a `301` redirect to `https://id.qie.digital/verify`. Inside that app, `/integration-docs` is an external link to `https://getpass.qie.digital/dashboard/docs` | curl headers; JS bundle of `id.qie.digital` | VERIFIED |
| `https://getpass.qie.digital/dashboard/docs` | Redirects to `https://getpass.qie.digital/auth/login`. The integration docs are behind a partner login | curl | VERIFIED |
| Auth scheme, headers, string-to-sign, endpoints, bodies, claims, production URL, key issuance | Not readable without an account | — | STILL UNKNOWN |
| Docs MCP (`docs.qie.digital`) | No QIE Pass content | docs MCP search | VERIFIED (that it is missing) |

**Needs human:** create a partner account at `https://getpass.qie.digital`, open Dashboard → Docs, and copy the page. What we need from it: the auth headers and the exact string to sign; the four endpoints (create verification request, get request status, claim and verify credentials, get available claims) with request and response bodies; the list of claims (is there a plain "KYC verified" claim?); sandbox and production base URLs; how keys are issued.

The older facts in `07-QIE-REFERENCE.md` (sandbox URL `did-stapi.qie.digital`, `pk_test_` / `pk_live_` prefixes) could not be re-confirmed today.

## 2.6 QIE Wallet

| Item | Answer | Source | Confidence |
|------|--------|--------|------------|
| Platforms | Android, iOS and a Chrome extension | structured data on `https://www.qiewallet.me` | VERIFIED |
| Browser extension provider | EIP-6963 `me.qiewallet`, `window.qie`; the guide covers websites and links to the Chrome Web Store for install | `https://docs.qie.digital/qie-wallet-integration-guide-for-websites` (docs MCP) | VERIFIED |
| Mobile in-app browser that injects the provider | Not stated anywhere we could read. The site lists "Ecosystem dApps" inside the wallet, which suggests one, but that is not proof | `qiewallet.me`, web search, docs MCP | STILL UNKNOWN |
| WalletConnect | No mention on the site, in the docs or in search results | same | STILL UNKNOWN |

**Needs human:** install QIE Wallet on a phone, look for a dApp browser, open any site that calls `eth_requestAccounts`, and report whether a provider is injected. Also check for a WalletConnect scan option. Until then the frontend plan in `06-FRONTEND.md` stands (injected provider; MetaMask mobile as the fallback on phones).

## 2.7 Reloadly

Sources: Reloadly's own OpenAPI repositories on GitHub (`github.com/Reloadly/reloadly-airtime-documentation` and `github.com/Reloadly/reloadly-giftcard-documentation`, branch `main`, folder `openapi/`) and `support.reloadly.com`. The repositories were last updated in 2022–2023, so each field must still be checked against a sandbox response. No sandbox call has been made: credentials are not set yet.

| Item | Answer | Source | Confidence |
|------|--------|--------|------------|
| Operator object fields | `id`, `operatorId`, `name`, `bundle`, `data`, `pin`, `supportsLocalAmounts`, `denominationType` (`FIXED` or `RANGE`), `senderCurrencyCode`, `senderCurrencySymbol`, `destinationCurrencyCode`, `destinationCurrencySymbol`, `commission`, `internationalDiscount`, `localDiscount`, `mostPopularAmount`, `minAmount`, `maxAmount`, `localMinAmount`, `localMaxAmount`, `country`, `fx`, `logoUrls`, `fixedAmounts`, `fixedAmountsDescriptions`, `localFixedAmounts`, `localFixedAmountsDescriptions`, `suggestedAmounts`, `suggestedAmountsMap`, `promotions` | `openapi/components/schemas/airtime/auto_detect_an_operator/AutoDetectAnOperatorResponse200.yaml` | VERIFIED (official spec); sandbox re-check pending |
| List operators by country | `GET /operators/countries/{countrycode}` | airtime `openapi/openapi.yaml` | VERIFIED (official spec) |
| Auto-detect | `GET /operators/auto-detect/phone/{phone}/countries/{countryisocode}` | same | VERIFIED |
| Async top-up and status | `POST /topups-async`, `GET /topups/{transactionId}/status` | same | VERIFIED |
| Status response shape | The official spec shows a **flat** object (`transactionId`, `status`, `operatorTransactionId`, `customIdentifier`, `recipientPhone`, `operatorId`, `operatorName`, `requestedAmount`, `deliveredAmount`, `transactionDate`, `pinDetail`, `balanceInfo`, …). `08-RELOADLY-REFERENCE.md` describes a nested `{ status, transaction: { … } }` shape taken from a blog. The two disagree | `TopUpsStatusResponse200.yaml` | STILL UNKNOWN which is current; the zod schema must be written from a sandbox response. The spec lists no status enum for airtime |
| Transaction lookup | `GET /topups/reports/transactions` and `/topups/reports/transactions/{transactionId}` | same | VERIFIED. Whether the list can be filtered by `customIdentifier` is STILL UNKNOWN |
| Gift card code endpoint | `GET /orders/transactions/{transactionId}/cards`. The spec lists `cardNumber` (the redeem code) and a second property named `amount` that is described as "the PIN code"; that name looks like a spec error | giftcard `openapi/openapi.yaml`, `GetARedeemCodeResponse200.yaml` | Path VERIFIED (official spec). PIN field name STILL UNKNOWN: take it from a sandbox response |
| Gift card order status values | `SUCCESSFUL`, `PENDING`, `PROCESSING`, `REFUNDED`, `FAILED`. `FAILED` means the purchase failed and the funds are **not yet** reversed | description of the Transactions tag in giftcard `openapi.yaml` | VERIFIED (official spec) |
| Gift card transaction lookup | `GET /reports/transactions/{transactionId}`. (`GET /orders/{id}` is not in the official spec) | giftcard `openapi.yaml` | VERIFIED |
| Gift card products by country | `GET /countries/{countrycode}/products` | same | VERIFIED |
| Gift card `denominationType` `RANGE` | The product schema has `denominationType` plus `minRecipientDenomination` / `maxRecipientDenomination` / `minSenderDenomination` / `maxSenderDenomination` next to the fixed lists, so range products exist. How `unitPrice` is validated for them is not described | `GetProductByIsoResponse200.yaml` | THIRD-PARTY; test in sandbox |
| Duplicate `customIdentifier` | Airtime spec: "each transaction reference is to be unique. Once a reference has been used for a top-up, it cannot be reused." Gift card spec calls it "a unique reference" | `TopUpsAsyncRequest.yaml`, `OrderAGiftCardRequest.yaml` | THIRD-PARTY: documented, the actual rejection and its error body are untested |
| Sandbox behaviour for `REFUNDED` / failures | Not documented in the specs | — | STILL UNKNOWN; test in sandbox |
| Webhook signature scheme | Not in the public OpenAPI repos; web search returned nothing from Reloadly | — | STILL UNKNOWN. Needs human: open the dashboard webhooks page or `docs.reloadly.com` in a browser. Webhooks stay "a hint to poll" |
| Token lifetime | Live: "60 days (5,184,000 seconds)". Sandbox: "24 hours (86,400 seconds)". The spec example shows `expires_in: 5184000` | `https://support.reloadly.com/locating-your-api-credentials` (page fetched 17 Nov 2026); `AccessTokenResponse200.yaml` | VERIFIED (official). Always trust `expires_in` |
| `docs.reloadly.com/llms.txt`, `developers.reloadly.com/llms.txt` | `403` | curl | — |

Fixtures under `apps/api/test/fixtures/reloadly/` are not created yet. They must be real sandbox responses, so they wait for the credentials.

## 2.8 Competitive check

**On QIE.** No project that sells airtime or gift cards for QIE or QUSDC was found: nothing in web search, and the ecosystem list on `qiewallet.me` (QIEDex, QIE ID, QBots, QIE Lottery, QIE Doodle Game, ENOOBS, QUSDC) has no spending app. Known previous winners are prediction markets, identity, AI, subscriptions (Fluenci) and remittances (RemitChain). Confidence: THIRD-PARTY. There is no public list of Hackathon 3.0 entries, so a competing entry cannot be ruled out.

**Toppa (Celo).** THIRD-PARTY (its ERC-8004 agent registration and a project profile on karmahq.xyz).
- An AI agent that sells airtime, data, bill payments and gift cards in 170+ countries.
- Users or other agents pay in cUSD per request through the x402 HTTP payment protocol; Toppa adds a service fee.
- Reached through a web page, a Telegram bot, an API and agent endpoints (MCP, A2A).

**Bitrefill.** VERIFIED for the refund facts (`help.bitrefill.com`, `docs.bitrefill.com/docs/refunds`).
- A custodial web store with an account and an optional prepaid balance ("Store Credit"), many coins and Lightning.
- The user sends crypto to Bitrefill's address; Bitrefill then delivers.
- Refunds are handled by Bitrefill: to store credit at once, or back on-chain in 10 minutes to 24 hours through a "Refund options" step.

**Cryptorefills.** THIRD-PARTY (App Store listing, Trustpilot profile and directory pages found by web search; its own site was not read).
- A company-run web and mobile store for gift cards, eSIMs and mobile top-ups, with about 600 phone networks listed.
- The user pays in crypto (BTC incl. Lightning, ETH, stablecoins) on many networks such as Polygon, Arbitrum, Avalanche, Solana, Tron and Base; the product is sent after the payment confirms.
- It is an ordinary merchant, not an on-chain protocol. Its refund policy was not found.

**Concrete differences of Qarta Pay**
1. Payment is held by a public escrow contract until delivery. The competitors receive the money first and refund at their own discretion.
2. The payer can take the money back alone with `claimRefund` after the timeout. No support ticket.
3. It accepts native QIE and QUSDC on QIE Mainnet; none of the three supports QIE.
4. Native-QIE prices are checked on-chain against the QIE Oracle and off-chain against the QIEDex pool.
5. `.qie` names are shown in the app and (P1) used for gifting.
6. Revenue is converted on QIEDex, and all orders and volume can be recomputed from contract events.
7. It is a storefront with a wallet, not an AI agent (Toppa's positioning).

## 2.9 Hackathon

Source: `https://hackathon.qie.digital/` HTML and its JS bundle (the FAQ array is in the page chunk), and `/terms`, read 17 Nov 2026.

| Item | Answer | Confidence |
|------|--------|------------|
| AI-assisted development | "Yes, AI-assisted development is encouraged. Teams must fully understand and maintain their code and be able to explain architecture to judges." | VERIFIED (FAQ in the site bundle) |
| Judging weights | "Innovation 30%, Technical Quality 25%, User Experience 15%, Mainnet Integration 15%, and Business Potential 15%." The terms page still says four criteria at 25% each | VERIFIED (FAQ). The two pages still disagree |
| Mandatory submission items | "mainnet deployment, open-source smart contracts, live public app, public repository, **demo video**, documentation, and team presentation" | VERIFIED (FAQ) |
| Mainnet | "Testnet-only projects are not eligible. Judges verify contracts, transactions, deployment, and frontend connectivity on QIE Mainnet." | VERIFIED (FAQ) |
| Payout | 50% on 10 Dec 2026; the rest "after meeting **any 3** traction milestones within 90 days". Milestone areas: wallet growth, transaction volume, recurring users, merchants, active monthly usage, revenue. No thresholds published | VERIFIED (FAQ); thresholds STILL UNKNOWN |
| Prize currency | "Prizes will be awarded in QIE tokens" | VERIFIED (terms) |
| Bonus | "Projects that effectively integrate with existing QIE ecosystem components will receive bonus consideration during judging." | VERIFIED (home page) |
| Team size | Not stated in the FAQ, the home page or the terms | STILL UNKNOWN |

Changes against `02-HACKATHON.md`: the AI question is answered; there is a third, weighted set of judging criteria; the demo video and a team presentation are mandatory; source must be open.
