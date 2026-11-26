# 07 — QIE Reference

Collected 15–17 Nov 2026. Re-check every address on the explorer before sending funds to it.

## Networks **[VERIFIED: QIE Wallet integration guide, docs.qie.digital]**

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | `1990` (`0x7c6`) | `1983` (`0x7bf`) |
| RPC | `https://rpc1mainnet.qie.digital` … `https://rpc5mainnet.qie.digital` (all five answered on 17 Nov 2026) | `https://rpc1testnet.qie.digital` … `https://rpc6testnet.qie.digital` (list from QIE support, 23 Nov 2026; that day only rpc4 and rpc5 answered, in 8-14 s) |
| Explorer | `https://mainnet.qie.digital` | `https://testnet.qie.digital` |
| Native coin | QIE, 18 decimals. Wallet symbol `QIEV3`, network name "QIEMainnet" (organizers' hackathon Telegram, 26 Nov 2026; older docs said `QIE`) | QIE, 18 decimals, symbol `QIE` |
| Faucet | — | `https://www.qie.digital/faucet` |

The organizers' list of 26 Nov 2026 names the same hosts: mainnet RPC1–RPC5 = rpc1, rpc2, rpc5, rpc4, rpc3; testnet rpc1–rpc6 (rpc1 recommended). On 26 Nov: all five mainnet RPCs answered in about 1 s. On testnet only rpc4 and rpc5 answered: rpc1, rpc2 and rpc6 failed the TLS handshake and rpc3 has no DNS record. `chainid.network` has no entry for 1990 and lists 1983 as "Krown Mainnet", so wallets may warn when adding testnet.

Liveness check, mainnet block 12,175,811 (26 Nov 2026) **[VERIFIED]**:
- The QIEDex router reports `factory()` = the factory above and `WETH()` = WQIE.
- `getPair(WQIE, QUSDC)` returns `0x73a3…4DFe`, holding 28,733 WQIE and 4,553.6 QUSDC (about $9.1k). Its last trade was about 18 minutes before the read.
- `getAmountsOut(1 QIE)` returns 0.158 QUSDC.
- The oracle read $0.1726, updated 19 s before the read, so the pool traded 8.2% below the oracle.
- Gas price was 1.125 gwei.

Older listings with chain IDs `5656` or `9731` are outdated. CoinMarketCap lists a different testnet RPC host; use the one above from the official docs.

`wallet_addEthereumChain` params (mainnet):

```js
{
  chainId: '0x7c6',
  chainName: 'QIE Blockchain Mainnet',
  nativeCurrency: { name: 'QIE', symbol: 'QIE', decimals: 18 },
  rpcUrls: ['https://rpc1mainnet.qie.digital', 'https://rpc5mainnet.qie.digital'],
  blockExplorerUrls: ['https://mainnet.qie.digital'],
}
```

Chain facts: Layer 1 built on Cosmos SDK with EVM compatibility, delegated proof of stake, 80% of gas fees burned, fees quoted around $0.0001 per transaction (project's own figures).

Measured on 17 Nov 2026 **[VERIFIED: `probe-results.md` §1]**:

- EVM level: Shanghai. PUSH0 executes; Cancun opcodes (TSTORE) are "not defined". Verified contracts on the explorer use `berlin` and `paris`. We compile with `paris`.
- EIP-1559: `baseFeePerGas` is present (1 gwei).
- Block time: 3.63 s.
- `eth_getLogs`: at most 10,000 blocks per call.
- RPC rate limits: none published and none hit; every request took 3–7 s from our location.
- Explorer: Blockscout v7.0.2 on mainnet and testnet, with `/api/v2/…` and the Etherscan-compatible `/api?module=…`.
- Testnet has none of the mainnet contracts (QUSDC, feed, router, resolver all return empty code).

## Token and DEX addresses (mainnet) **[VERIFIED: qiedex.qie.digital docs]**

| Contract | Address |
|----------|---------|
| QUSDC (stablecoin, pegged 1:1 to USDC) | `0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5` |
| WQIE (wrapped native) | `0x0087904D95BEe9E5F24dc8852804b547981A9139` |
| QIEDex Router | `0x08cd2e72e156D8563B4351eb4065C262A9f553Ef` |
| QIEDex Factory | `0x8E23128a5511223bE6c0d64106e2D4508C08398C` |
| QIEDex WQIE/QUSDC pair **[VERIFIED: `getPair`]** | `0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe` (`token0` = WQIE, `token1` = QUSDC) |
| wUSDC.eth (bridged USDC) | `0x0e93FAcc0a2cfD418403f3AD3EEfB5C8b2dfAec7` |
| wUSDT.eth (bridged USDT) | `0xCB7bBC584475dce754a918ccD92FF6E0211f3CEE` |
| WETH | `0xAC8d365ECc9074a679f75B3E6b2bbF303e466728` |
| WBNB | `0x9e02ba5dE6d26D5Ca5688Ed3999C6bcF4F3e966E` |

Notes:
- QUSDC decimals: **6** **[VERIFIED: `decimals()`]**. No EIP-2612 permit. Plain OpenZeppelin v5.1 ERC-20, no fee on transfer; `VAULT_ROLE` can mint and burn. Total supply on 17 Nov 2026: about 9,022 QUSDC.
- QUSDC is verified on the explorer; the QIEDex router, factory, pair and WQIE are **not verified** **[VERIFIED: explorer API]**. The docs publish no ABI, fee, or init-code hash.
- The router is a Uniswap V2 `Router02` by its selectors and behaviour; the native wrapper getter is `WETH()`; the exact-native-in swap is `swapExactETHForTokens`; the fee is 0.30% **[VERIFIED: `probe-results.md` §4]**.
- Pool on 17 Nov 2026: 29,826 WQIE and 4,384 QUSDC (about $8.8k). Pool price $0.146976, which was 514 bps below the oracle.
- A different address (`0x775AcF0F…b867`) appears in press material as "wQIE": that is the wrapped QIE on Ethereum/BNB Chain, not on QIE mainnet. Do not use it here.
- QIEDex UI trades through WQIE; pairs are WQIE/token.
- How users get QUSDC: `https://www.stable.qie.digital/`, or swap on QIEDex `https://www.swap.dex.qie.digital/swap`, or bridge USDC from Ethereum/BNB (`https://bridge.qie.digital`).

## QIE Oracle (price feeds, mainnet) **[VERIFIED: QIE Oracle docs — table of assets]**

AggregatorV3-compatible: `latestRoundData()`, `getRoundData(uint80)`, `decimals()`.

| Feed | Address |
|------|---------|
| **QIE / USD** | `0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17` |
| BTC | `0x9E596d809a20A272c788726f592c0d1629755440` |
| ETH | `0x4bb7012Fbc79fE4Ae9B664228977b442b385500d` |
| XRP | `0x804582B1f8Fea73919e7c737115009f668f97528` |
| SOL | `0xe86999c8e6C8eeF71bebd35286bCa674E0AD7b21` |
| XAUt | `0x9aD0199a67588ee293187d26bA1BE61cb07A214c` |
| BNB | `0x775A56117Fdb8b31877E75Ceeb68C96765b031e6` |

- Decimals: **8** **[VERIFIED: `decimals()` on the QIE/USD feed]**.
- Update cadence: the docs say "every few minutes". Measured on the QIE/USD feed: no heartbeat, median gap about 3 hours, longest gap 23 h 12 min over 24 updates **[VERIFIED: `probe-results.md` §3]**. One owner key writes prices with `updateAnswer(int256)`. Always check `updatedAt`.
- The QIE/USD feed is on mainnet **[VERIFIED]** and does not exist on testnet **[VERIFIED: empty code]** → use `MockAggregatorV3` there.
- Docs: `https://qi-blockchain.gitbook.io/qie-oracle/` (index at `/llms.txt`).

## QIE Wallet **[VERIFIED: docs.qie.digital wallet guide]**

Standard EIP-1193 injected provider, no API key. EIP-6963 `rdns = 'me.qiewallet'`; `window.qie` always present. Supports `eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`, `personal_sign`, `eth_signTypedData_v4`, `wallet_watchAsset`. Events: `accountsChanged`, `chainChanged`, `connect` (no `disconnect`). Details and gotchas in `06-FRONTEND.md`. Site: `https://qiewallet.me`.

## QIE ID (`.qie` names)

No official developer documentation found. The addresses came from a third-party README and were confirmed by live calls on 17 Nov 2026 **[VERIFIED: `probe-results.md` §5]**:

| Contract | Address |
|----------|---------|
| Reverse resolver (address → primary name) | `0x76ec8ed377cC0d36D1B48027ac7892Ec6799171E` — single call `resolve(address)` |
| Forward registry A | `0x26cCB3fABd6db18834987134d715Ba2346CE7223` |
| Forward registry B | `0x1D69d75AD7b77b91C3760F84faC52E651710f62e` |

- A name lives in exactly one of the two forward registries, so forward resolution queries both.
- Both registries are ERC-1967 proxies. Registry B's proxy is verified, but neither implementation is, so there is no published ABI. Signatures confirmed by live calls are in `packages/shared/abi/unverified-signatures.json`.
- Reverse: `resolve(address)` returns the full `name.qie`, or `""` when the wallet has no primary name. Example: `0xfde4d4aa9b603b5805cb4ac3390ae3b88b6c0fde` → `molivo.qie`.
- The resolver is stale: recent registrants resolve to `""`, and its setter has been called only by the contracts' owner key (last on 4 Jun 2026).
- Reverse fallback: `userDomain(address) returns (string)` on Registry B (`0x1D69…f62e`) returns the wallet's default name, including for new registrants. Example: `0xe54269d36fc6c09de40433c0bc2cd7149fc365da` → `hwgam372.qie`. Registry A has no such function, so a wallet whose only name is in Registry A has no known reverse lookup.
- Read order for name display: resolver `resolve` → Registry B `userDomain` → short address.
- Forward: `domainExist(string)` and `domainInfo(string)` with the full name including `.qie`. `domainInfo` returns `(string name, address nft, address owner, uint256 registeredAt, uint256 tokenId)`. `resolver(string)` returns `(uint256 tokenId, address owner)` and is the call the official app uses.
- Name NFT: `0x9aab56e7727af53A3131985BFB16d845319b7bdc` (`ownerOf(tokenId)`).
- Official HTTP API (announced by the organizers in the hackathon Telegram, 26 Nov 2026): free, no key, read-only. Forward lookup `GET https://sdk-live.qie.digital/api/v1/domains/public/lookup/<name>.qie` **[VERIFIED: live call 26 Nov 2026]**: `molivo.qie` → `{"status":"SUCCESS","data":{"owner":"0xfDe4…6c0fde","domainName":"molivo.qie","domainType":"free"}}`. That matches the on-chain reverse result above. The organizers say it also resolves address → name, but that endpoint path is not confirmed yet. Qarta Pay reads the contracts directly and does not need this API.
- Product facts **[VERIFIED: press]**: names are a one-off purchase with no renewal; a QIE ID is required before completing QIE Pass KYC. Purchase site: `https://id.qie.digital/`.

## QIE Pass (reusable KYC identity)

- Partner REST API with HMAC authentication **[VERIFIED: qiepass.qie.digital integration docs, search snippet]**.
- Sandbox base URL: `https://did-stapi.qie.digital/api/v1` **[VERIFIED]**. Production host: `https://pass-api.qie.digital` **[THIRD-PARTY]**. Keys are prefixed `pk_test_` / `pk_live_` **[THIRD-PARTY]**.
- Endpoints (names only, from the docs index): Create Verification Request, Get Request Status, Claim and Verify Credentials, Get Available Claims.
- Flow: the user provides a wallet address, `@QIE Pass ID` or `name.qie` (sent as `identifier`), or the partner sends its own `partnerUserRef`; the user approves the request in QIE Wallet; the partner claims a signed credential with selectively disclosed claims and verifies signature, expiry and revocation.
- There is **no canonical on-chain QIE Pass registry**; a previous winner bridged verification results on-chain with its own adapter contract **[THIRD-PARTY]**. For Qarta Pay the check stays off-chain in the backend (it only gates cashback and limits).
- On 17 Nov 2026 `https://qiepass.qie.digital/integration-docs` redirects to `https://id.qie.digital/verify`, and the docs link there points to `https://getpass.qie.digital/dashboard/docs`, which requires a partner login. The facts above could not be re-confirmed. A human must create a partner account, open the docs and copy the auth scheme, endpoints, payloads and claim list (`research-notes.md` §2.5). **Partner keys must be requested from QIE** (human task).
- KYC provider behind it: Sumsub.

## Other ecosystem pieces

- QIELend: `https://www.qielend.qie.digital/dashboard` (lending; not used in MVP)
- Bridge: `https://bridge.qie.digital`
- Token creator: `https://www.dex.qie.digital/#/token-creator` (not used)
- "QIE reputation" is an off-chain HTTP service (`reputation.qie.digital`) with no on-chain contract **[THIRD-PARTY]** (not used)

## Probe checklist (run in step 1 of the plan, save output to `docs/probe-results.md`)

```bash
export RPC=https://rpc1mainnet.qie.digital
cast chain-id --rpc-url $RPC                                   # expect 1990
cast block latest --rpc-url $RPC                               # block time, baseFeePerGas present? (1559)
cast call 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5 "decimals()(uint8)" --rpc-url $RPC
cast call 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5 "symbol()(string)" --rpc-url $RPC
cast call 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5 "DOMAIN_SEPARATOR()(bytes32)" --rpc-url $RPC   # permit?
cast call 0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17 "decimals()(uint8)" --rpc-url $RPC
cast call 0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17 "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url $RPC
cast call 0x08cd2e72e156D8563B4351eb4065C262A9f553Ef "factory()(address)" --rpc-url $RPC
cast call 0x08cd2e72e156D8563B4351eb4065C262A9f553Ef "WETH()(address)" --rpc-url $RPC
cast call 0x8E23128a5511223bE6c0d64106e2D4508C08398C "getPair(address,address)(address)" \
  0x0087904D95BEe9E5F24dc8852804b547981A9139 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5 --rpc-url $RPC
export PAIR=<address returned above>
cast call $PAIR "token0()(address)" --rpc-url $RPC              # token order for the price cross-check
cast call $PAIR "token1()(address)" --rpc-url $RPC
cast call $PAIR "getReserves()(uint112,uint112,uint32)" --rpc-url $RPC
cast call 0x08cd2e72e156D8563B4351eb4065C262A9f553Ef "getAmountsOut(uint256,address[])(uint256[])" \
  1000000000000000000 "[0x0087904D95BEe9E5F24dc8852804b547981A9139,0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5]" --rpc-url $RPC
cast call 0x76ec8ed377cC0d36D1B48027ac7892Ec6799171E "resolve(address)(string)" <wallet-with-a-name> --rpc-url $RPC
```

Also: deploy a trivial contract compiled with `evm_version = shanghai` to testnet to learn whether PUSH0 is supported; run the oracle call twice 10 minutes apart to measure the real update interval; on an anvil fork, send a small exact-native-in swap through the router to learn the swap function name (the router is unverified, so try `swapExactETHForTokens` first and record what works, do not assume).

Results of this checklist, run on 17 Nov 2026, are in `probe-results.md`.

These answers gate P0 items: the pair reads gate the QIEDex price cross-check, the router swap gates the treasury sweep, and `resolve(address)` gates `.qie` name display.
