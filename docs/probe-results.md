# Probe Results — QIE Mainnet (1990) and Testnet (1983)

Run on 17 Nov 2026, 01:50–02:40 UTC. All calls are read-only (`eth_call`, `cast call`, explorer API) except one swap that ran on a local anvil fork. Nothing was broadcast to any network.

Tools: Foundry `cast` / `anvil` (installed 17 Nov 2026), `curl` JSON-RPC, Blockscout API.

```bash
export RPC=https://rpc1mainnet.qie.digital
```

## 1. Chain

| Probe | Command | Result |
|-------|---------|--------|
| Chain ID | `eth_chainId` | `0x7c6` (1990) |
| Client | `web3_clientVersion` | `Version dev ()` compiled with Go 1.22.2 |
| Latest block | `eth_getBlockByNumber latest` | number `0xb6807c` (11,960,444), `baseFeePerGas = 0x3b9aca00` (1 gwei), `gasLimit = 0xffffffff`, `difficulty = 0` |
| Gas price | `eth_gasPrice` | `0x430e2340` (1.125 gwei) |
| Priority fee | `eth_maxPriorityFeePerGas` | `0x7735940` (0.125 gwei) |
| Block time | timestamps of head and head−100 | 363 s over 100 blocks = **3.63 s per block** (explorer reports 3.626 s) |
| `eth_getLogs` range | QUSDC address, spans 100 … 200,000 | 100 / 1,000 / 5,000 / 10,000 blocks: OK. 50,000: `maximum [from, to] blocks distance: 10000` |
| RPC latency | `eth_blockNumber` on rpc1…rpc5 | 3.2 s, 3.7 s, 6.5 s, 4.5 s, 5.2 s per request (from Egypt). All five answer. |

EIP-1559: `baseFeePerGas` is present, so type-2 transactions are supported at the RPC level. Not yet confirmed by a real broadcast.

Rate limiting: no `429` seen at about 1 request per second. One `cast call` hung for over 60 s on rpc1 during a burst of sequential calls. Every request is slow (3–7 s), which matters for the indexer poll interval and for quote latency.

### EVM version

```bash
# init code PUSH0 PUSH0 RETURN, no "to" (simulated contract creation)
curl -s -X POST -H 'content-type: application/json' $RPC \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"data":"0x5f5ff3"},"latest"]}'
# mainnet: {"result":"0x"}        testnet: {"result":"0x"}

# init code PUSH1 1 PUSH0 TSTORE PUSH0 PUSH0 RETURN
curl ... --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"data":"0x60015f5d5f5ff3"},"latest"]}'
# mainnet: {"error":{"code":-32000,"message":"rpc error: code = Internal desc = invalid opcode: opcode 0x5d not defined"}}
```

- PUSH0 (`0x5f`, Shanghai) executes on mainnet and testnet.
- TSTORE (`0x5d`, Cancun) is not defined. The chain is at Shanghai level; Cancun opcodes are not available.
- A real PUSH0 contract deployment on testnet was **not** done: it needs a funded testnet key (human task).
- Verified contracts on the explorer were compiled with `evm_version` `berlin` (QUSDC) and `paris` (QIE/USD feed).

Decision: keep `evm_version = "paris"`. It is proven on mainnet by existing contracts and we gain nothing from PUSH0.

## 2. QUSDC `0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5`

```bash
cast call $QUSDC "decimals()(uint8)"          # 6
cast call $QUSDC "symbol()(string)"           # "QUSDC"
cast call $QUSDC "name()(string)"             # "QUSDC"
cast call $QUSDC "totalSupply()(uint256)"     # 9022132000  (= 9,022.13 QUSDC)
cast call $QUSDC "DOMAIN_SEPARATOR()(bytes32)"   # execution reverted
cast call $QUSDC "nonces(address)(uint256)" 0x…01 # execution reverted
```

- Decimals: **6**.
- No EIP-2612 `permit`. Stay with `approve` + `pay`.
- Verified on the explorer (solc 0.8.20, OpenZeppelin v5.1 `ERC20` + `AccessControl`). Plain transfer logic: no fee on transfer, no blacklist, no pause.
- `mint(address,uint256)` and `burn(address,uint256)` are open to `VAULT_ROLE`. `burn` takes any `from` address, so the role holder can burn tokens held by any account, including an escrow contract. This is issuer trust, the same as for any centrally issued stablecoin.
- **Total supply is only about 9,022 QUSDC**, and about 4,384 of it sits in the QIEDex pool. Few users hold QUSDC today.

## 3. QIE/USD oracle `0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17`

```bash
cast call $FEED "decimals()(uint8)"   # 8
cast call $FEED "latestRoundData()(uint80,int256,uint256,uint256,uint80)"
# roundId 20239, answer 15494207 ($0.15494207), startedAt = updatedAt = 1794856016 (2026-11-16T19:06:56Z), answeredInRound 20239
```

Verified on the explorer as `AggregatorV3` (solc 0.8.20, `paris`). Functions: `decimals`, `description`, `getRoundData`, `latestRoundData`, `version`, `owner`, `updateAnswer(int256)`, `transferOwnership`, `renounceOwnership`. One owner key pushes prices with `updateAnswer`.

Sampled once a minute from 01:46 to 02:11 UTC on 17 Nov (26 samples): the answer never changed. At 02:11 UTC the feed was **7 h 05 min old**.

History from `getRoundData(roundId)` for the last 25 rounds:

| Round | Answer (8 dec) | updatedAt (UTC) | Gap to previous round |
|-------|----------------|-----------------|-----------------------|
| 20239 | 15494207 | 2026-11-16 19:06:56 | 3 h 18 min |
| 20238 | 15473155 | 2026-11-16 15:48:57 | 8 h 42 min |
| 20237 | 15499040 | 2026-11-16 07:06:55 | 3 h 51 min |
| 20236 | 15469947 | 2026-11-16 03:15:57 | 3 min |
| 20235 | 15505349 | 2026-11-16 03:12:57 | 9 min |
| 20234 | 15469535 | 2026-11-16 03:03:58 | 20 h 00 min |
| 20233 | 15499659 | 2026-11-15 07:03:56 | 4 h 46 min |
| 20232 | 15392207 | 2026-11-15 02:17:55 | 5 h 23 min |
| 20231 | 15413385 | 2026-11-14 20:54:55 | 10 h 45 min |
| 20230 | 15441009 | 2026-11-14 10:09:57 | 1 h 36 min |
| 20229 | 15516198 | 2026-11-14 08:33:54 | **23 h 12 min** |
| 20228 | 15466603 | 2026-11-13 09:21:56 | 2 h 42 min |
| 20227 | 15501363 | 2026-11-13 06:39:57 | 45 min |
| 20226 | 15457118 | 2026-11-13 05:54:55 | 6 min |
| 20225 | 15350815 | 2026-11-13 05:48:56 | 3 min |
| 20224 | 15019418 | 2026-11-13 05:45:54 | 2 h 00 min |
| 20223 | 15021666 | 2026-11-13 03:45:54 | 10 h 57 min |
| 20222 | 14994079 | 2026-11-12 16:48:57 | 1 h 09 min |
| 20221 | 14963769 | 2026-11-12 15:39:56 | 3 h 39 min |
| 20220 | 15035746 | 2026-11-12 12:00:55 | 1 h 12 min |
| 20219 | 14981929 | 2026-11-12 10:48:56 | 39 min |
| 20218 | 15012578 | 2026-11-12 10:09:54 | 4 h 30 min |
| 20217 | 14998045 | 2026-11-12 05:39:55 | 51 min |
| 20216 | 14646643 | 2026-11-12 04:48:55 | 16 h 30 min |
| 20215 | 13498581 | 2026-11-11 12:18:55 | — |

Findings:

- 24 updates in 5 days 7 hours. Median gap about 3 hours. **Longest gap 23 h 12 min.** Shortest 3 minutes.
- There is no heartbeat. Updates look deviation-triggered (the timestamps all fall on a 3-minute grid, so a job probably runs every 3 minutes and writes only when the price moved).
- Largest step between two rounds: +8.5% (20215 → 20216). Typical step: under 0.5%.
- The docs' "every few minutes" is wrong for this feed. A `maxOracleAge` of 900 s would reject almost every native-QIE payment.

## 4. QIEDex

```bash
cast call $ROUTER "factory()(address)"   # 0x8E23128a5511223bE6c0d64106e2D4508C08398C
cast call $ROUTER "WETH()(address)"      # 0x0087904D95BEe9E5F24dc8852804b547981A9139  (WQIE)
cast call $FACTORY "getPair(address,address)(address)" $WQIE $QUSDC   # 0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe
cast call $FACTORY "allPairsLength()(uint256)"   # 34
cast call $FACTORY "feeTo()(address)"            # 0x0000000000000000000000000000000000000000
cast call $PAIR "token0()(address)"   # 0x0087904D95BEe9E5F24dc8852804b547981A9139  (WQIE)
cast call $PAIR "token1()(address)"   # 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5  (QUSDC)
cast call $PAIR "factory()(address)"  # 0x8E23128a5511223bE6c0d64106e2D4508C08398C
cast call $PAIR "getReserves()(uint112,uint112,uint32)"
# 29826135955897285397446   (29,826.14 WQIE)
# 4383755230                (4,383.76 QUSDC)
# 1794878551                (last trade 2026-11-17T01:22:31Z)
cast call $WQIE "symbol()(string)"   # "WQIE"
cast call $WQIE "decimals()(uint8)"  # 18
```

Router bytecode selectors (`cast selectors $(cast code $ROUTER)`): 24 selectors, exactly the Uniswap V2 `Router02` set, including

| Selector | Function |
|----------|----------|
| `0xc45a0155` | `factory()` |
| `0xad5c4648` | `WETH()` |
| `0xd06ca61f` | `getAmountsOut(uint256,address[])` |
| `0x1f00ca74` | `getAmountsIn(uint256,address[])` |
| `0x7ff36ab5` | `swapExactETHForTokens(uint256,address[],address,uint256)` |
| `0xfb3bdb41` | `swapETHForExactTokens(uint256,address[],address,uint256)` |
| `0xb6f9de95` | `swapExactETHForTokensSupportingFeeOnTransferTokens(...)` |
| `0x18cbafe5` | `swapExactTokensForETH(...)` |
| `0x38ed1739` | `swapExactTokensForTokens(...)` |

The router, factory, pair and WQIE are **not verified** on the explorer.

### Swap function, confirmed two ways

```bash
# (a) read-only eth_call on mainnet, sender = WQIE contract (it holds QIE)
cast call $ROUTER "swapExactETHForTokens(uint256,address[],address,uint256)(uint256[])" \
  1 "[$WQIE,$QUSDC]" 0x000000000000000000000000000000000000dEaD 9999999999 \
  --from $WQIE --value 100ether --rpc-url $RPC
# [100000000000000000000, 14604784]

# (b) real transaction on a local anvil fork (anvil --fork-url $RPC), impersonated funded account
cast send $ROUTER "swapExactETHForTokens(uint256,address[],address,uint256)" 1 "[$WQIE,$QUSDC]" $T 9999999999 \
  --value 10ether --from $T --unlocked --rpc-url http://127.0.0.1:8599
# status 1 (success), gasUsed 120109, QUSDC balance of $T after: 1464870
```

The exact-native-in function is `swapExactETHForTokens`. An anvil fork of QIE mainnet works (chain id 1990, state reads and the swap both succeed), so fork tests are possible.

### Price, fee and depth

```bash
cast call $ROUTER "getAmountsOut(uint256,address[])(uint256[])" 1000000000000000000 "[$WQIE,$QUSDC]"     # [1e18, 146531]
cast call $ROUTER "getAmountsOut(uint256,address[])(uint256[])" 100000000000000000000 "[$WQIE,$QUSDC]"   # [1e20, 14604784]
cast call $ROUTER "getAmountsOut(uint256,address[])(uint256[])" 68038319181362943609 "[$WQIE,$QUSDC]"    # [.., 9947442]
cast call $ROUTER "getAmountsOut(uint256,address[])(uint256[])" 340191595906814718049 "[$WQIE,$QUSDC]"   # [.., 49289826]
```

Computed with `bigint` from the reserves above:

| Quantity | Value |
|----------|-------|
| Pool price `reserveQusdc × 1e18 / reserveWqie` | 146976 → **$0.146976 per QIE** |
| Oracle price at the same time | 154942 → $0.154942 per QIE |
| Pool vs oracle | pool is **514 bps below** the oracle |
| Explorer coin price (CoinGecko) | $0.15485 (agrees with the oracle, not the pool) |
| Swap fee | **0.30%** (`amountIn × 997 / 1000`). The 0.3% formula reproduces all four `getAmountsOut` results exactly; a 0.25% formula does not. |
| Pool depth | 4,383.76 QUSDC + 29,826 WQIE ≈ $8,770 total |
| $10 swap (68.04 QIE in) | out 9.947442 QUSDC. Shortfall vs pool price 53 bps (fee included). Pool price moves 45 bps. |
| $50 swap (340.19 QIE in) | out 49.289826 QUSDC. Shortfall vs pool price **143 bps** (fee included). Pool price moves **223 bps**. |

### In-tx swap decision: **NO-GO**

The rule in `04-SMART-CONTRACTS.md` needs a $50 order to move the price by less than 1%. A $50 swap moves the pool price by 2.23% and loses 1.43% against the pool price. The pool also trades 5.14% below the oracle price. Escrow stays in native QIE.

## 5. QIE ID (`.qie` names)

Contracts (all deployed by `0x9a689036A798cF1a96e65c1911cE7B444C4e06a4`, which is also their `owner()`):

| Contract | Address | Explorer status |
|----------|---------|-----------------|
| Reverse resolver | `0x76ec8ed377cC0d36D1B48027ac7892Ec6799171E` | not verified |
| Registry A (ERC-1967 proxy) | `0x26cCB3fABd6db18834987134d715Ba2346CE7223` → implementation `0xc6d98E2b050e6f38330604D0fd3B4912707Bc2B0` | proxy not verified, implementation not verified |
| Registry B (ERC-1967 proxy) | `0x1D69d75AD7b77b91C3760F84faC52E651710f62e` → implementation `0xE7697ffEE71660Bc4e065611ef4F20CeF1303DeE` | proxy verified (generic `ERC1967Proxy`), implementation **not** verified |
| `.qie` name NFT | `0x9aab56e7727af53A3131985BFB16d845319b7bdc` (`name()` = `"qie"`) | — |

No registry implementation is verified, so there is no published ABI for the name logic. Function names below come from `cast selectors --resolve` on the bytecode plus live calls.

### Reverse resolution: works

```bash
cast call $RESOLVER "resolve(address)(string)" 0xfde4d4aa9b603b5805cb4ac3390ae3b88b6c0fde   # "molivo.qie"
cast call $RESOLVER "defaultDomain(address)(string)" 0xfde4d4aa9b603b5805cb4ac3390ae3b88b6c0fde   # "molivo.qie"
cast call $RESOLVER "resolve(address)(string)" 0xe3ad08d32b26eab63ea12a5ccfc636f475a42e19   # "tuft.qie"
cast call $RESOLVER "resolve(address)(string)" 0x000000000000000000000000000000000000dEaD   # ""
```

- Return format: the **full name with the `.qie` suffix**. No name → empty string (no revert).
- Resolver selectors: `resolve(address)` `0x55ea6c47`, `defaultDomain(address)` `0xc62006f4`, `addRegistry(address)`, `removeRegistry(address)`, `owner()`, an unnamed `0x7258b1e9(uint256)` that returns the registry list (index 0 = Registry B, index 1 = Registry A, index 2 reverts), and an unnamed setter `0x484a49da(address,bytes)`.
- **Owning a name is not enough.** Two wallets that registered names on 16 Nov 2026 (`wkfzk92101.qie` in Registry A, `hwgam372.qie` in Registry B) both return `""` from `resolve`. A name appears only after the primary name is set with `0x484a49da(wallet, name)`.
- The last 50 calls of that setter all came from the owner key `0x9a68…06a4`; the most recent was on 4 Jun 2026. The resolver looks like it is no longer kept up to date for new names.

### Reverse fallback: `userDomain(address)` on Registry B

The official app at `id.qie.digital` ships an ABI with `userDomain(address) returns (string)` (selector `0x8b5f1609`). Registry B answers it:

```bash
cast call $REGISTRY_B "userDomain(address)(string)" 0xe54269d36fc6c09de40433c0bc2cd7149fc365da   # "hwgam372.qie"  (resolver returned "")
cast call $REGISTRY_B "userDomain(address)(string)" 0xfde4d4aa9b603b5805cb4ac3390ae3b88b6c0fde   # "molivo.qie"
cast call $REGISTRY_B "userDomain(address)(string)" 0x000000000000000000000000000000000000dEaD   # ""
cast call $REGISTRY_B "userDomain(address)(string)" 0x190f2be6e7ca00744401acd38203918ec6dc3b34   # ""  (this wallet's name is in Registry A)
cast call $REGISTRY_A 0x8b5f1609…  # execution reverted: Registry A has no userDomain
cast call $REGISTRY_A "userDomains(address,uint256)(string)" <wallet> 0   # execution reverted for both test wallets
```

- Registry B gives a default name for a wallet whose name is registered in B, including new registrants.
- For a wallet whose only name is in Registry A and that has no entry in the resolver, **no reverse lookup was found**. Registry A's `userDomains(address,uint256)` reverted for index 0 on both wallets tried.
- The same ABI has `setDefault(uint256 tokenID_, address currencyAddress_, bool isFree_)`, so the app has a user-facing "set default" action. Which contract it is sent to was not traced.

### Forward resolution: works through `domainInfo(string)`

```bash
cast call $REGISTRY_A "domainExist(string)(bool)" wkfzk92101.qie   # true
cast call $REGISTRY_B "domainExist(string)(bool)" wkfzk92101.qie   # false
cast call $REGISTRY_B "domainExist(string)(bool)" hwgam372.qie     # true
cast call $REGISTRY_A "domainExist(string)(bool)" wkfzk92101       # false  (the suffix is required)
cast call $REGISTRY_A "domainInfo(string)" wkfzk92101.qie
# struct: (string name, address nft = 0x9aab…7bdc, address owner = 0x190f…3b34, uint256 registeredAt = 1794868909, uint256 tokenId = 0xca8ea6cb…7346)
cast call 0x9aab56e7727af53A3131985BFB16d845319b7bdc "ownerOf(uint256)(address)" 0xca8ea6cbe9688c2cbcab4085ebf499a37d8da6ee8e6d2af6143e9debe5c17346
# 0x190F2Be6E7Ca00744401AcD38203918EC6Dc3b34
```

- A name lives in exactly one registry; query both. Pass the full name including `.qie`.
- `domainInfo(string)` returns one struct. Raw layout (ABI words): offset to the string, NFT contract, owner, registration timestamp, token id, then the name string.
- `resolver(string)` returns `(uint256 tokenId, address owner)`; the official app uses it. Example: `resolver("wkfzk92101.qie")` on Registry A → `(0xca8ea6cb…7346, 0x190F2Be6E7Ca00744401AcD38203918EC6Dc3b34)`; `resolver("molivo.qie")` on Registry B → `(…, 0xfDe4d4aA9B603b5805cB4aC3390aE3b88B6c0fde)`. A name the registry does not hold returns zeros.
- The `owner` in `domainInfo` may be the owner at registration time. For gifting (P1), read `ownerOf(tokenId)` on the NFT contract and compare.
- Registration events: Registry A topic0 `0x0e431fa3…4204`, Registry B topic0 `0xc0d18eeb…a005`, each with the token id indexed and `(string name, address owner)` in the data.

## 6. Explorer

```bash
curl https://mainnet.qie.digital/api/v2/config/backend-version      # {"backend_version":"v7.0.2"}
curl https://mainnet.qie.digital/api/v2/smart-contracts/$QUSDC       # JSON with source, abi, compiler, evm_version
curl "https://mainnet.qie.digital/api?module=contract&action=getabi&address=$QUSDC"   # {"message":"OK","result":"[…]"}
curl https://testnet.qie.digital/api/v2/config/backend-version      # {"backend_version":"v7.0.2"}
```

Both explorers are **Blockscout v7.0.2**. The REST API (`/api/v2/…`) and the Etherscan-compatible API (`/api?module=…`) both answer.

| Contract | Verified | Compiler / EVM |
|----------|----------|----------------|
| QUSDC | yes | 0.8.20, berlin, optimizer off |
| QIE/USD feed | yes | 0.8.20, paris, optimizer off |
| WQIE, QIEDex router, factory, WQIE/QUSDC pair | no | — |
| Reverse resolver, both registry implementations | no | — |

`forge verify-contract … --verifier blockscout --verifier-url https://mainnet.qie.digital/api/` matches the standard Blockscout form and the API it needs is live. It has **not** been run: it needs a contract we deployed, which needs a funded testnet key.

## 7. Testnet (1983)

```
eth_chainId  0x7bf      eth_gasPrice 0x7 (7 wei)      latest block baseFeePerGas 0x7
explorer block time 4.33 s
eth_getCode QUSDC / QIE-USD feed / QIEDex router / reverse resolver  →  "0x" for all four
```

None of the mainnet contracts exist on testnet. Testnet needs our own mocks for QUSDC, the feed, the router and the resolver, as the plan already assumes.

### Testnet deployment, 19 Nov 2026 `[VERIFIED]`

`DEPLOY_MOCKS=true forge script script/Deploy.s.sol:Deploy … --broadcast` from the deployer keystore. All five receipts `status 1`, blocks 9863130–9863131; the whole deploy cost about 0.00000000007 QIE (base fee 7 wei).

| Contract | Address |
|----------|---------|
| QartaCheckout | `0x07522573bE0C3C7E9A6D48Eda0a38D8408724f62` (verified: `forge verify-contract … --verifier blockscout --verifier-url https://testnet.qie.digital/api/` → `Pass - Verified`) |
| MockERC20 (QUSDC) | `0x52259E57Ba961292a23AB4F78D3C815d84030B42` |
| MockAggregatorV3 (QIE/USD) | `0x25998aaDd5992c3480204DE1BBf2e631809c7c77` |
| MockPair (WQIE/QUSDC) | `0xBF820b92DdBd846A0F50993366Eb6A592A856F91` |
| mock WQIE (address only, no code) | `0x6a95d72e73580668b4F64142765570be19220260` |

`acceptOwnership()` from the owner wallet succeeded; `owner()` returns the owner, `pendingOwner()` is zero. The mock price was then set to **$5 per QIE** (feed `setAnswer(500000000)`, pair reserves 100,000 WQIE / 500,000 QUSDC), so the faucet's 2 QIE a day can pay for test orders. Testnet only; mainnet reads the real feed and pool.

End to end on testnet through the API (fake supplier, `scripts/testnet-buy.sh`): airtime paid in QUSDC → `SETTLED`; paid in native QIE → `SETTLED`; failed delivery (phone ending 0000) → on-chain `refund`, payer's QUSDC balance back to the exact value before.

### `eth_fillTransaction` returns intrinsic gas only (testnet and mainnet) `[VERIFIED]`

viem 2.58 prepares a transaction from a local key by calling `eth_fillTransaction` when gas, fees or nonce are missing (`prepareTransactionRequest`), and `estimateGas` with a local account goes the same way. QIE nodes answer it, but the `gas` they fill is the intrinsic cost only:

```
testnet, settle(bytes32) from the fulfiller:  eth_fillTransaction gas 0x5448 (21,576)   eth_estimateGas 0x1431e (82,718)
mainnet, QUSDC approve (read-only):            eth_fillTransaction gas 0x536c (21,356)   eth_estimateGas 0xb681 (46,721)
```

The first testnet settle therefore ran out of gas (tx `0x8160…e684`: gasLimit = gasUsed = 21,576, status 0). Fix in `apps/api/src/chain/checkout-writer.ts`: estimate with the bare address (`eth_estimateGas`), sign with explicit gas (+30%), fees and nonce, and send with `eth_sendRawTransaction`. Regression test: `flow.test.ts` "settle does not trust eth_fillTransaction gas", which fails on the old code. Browser wallets are not affected: viem sends `eth_sendTransaction` and the wallet estimates gas itself. Foundry (`forge script`, `cast send`) estimates with `eth_estimateGas` and is not affected either.

## 8. Not done, and why

| Item | Reason |
|------|--------|
| Reloadly sandbox calls and fixtures | Needs `RELOADLY_CLIENT_ID` and `RELOADLY_CLIENT_SECRET` in `apps/api/.env`. |
| Testnet faucet | `https://www.qie.digital/faucet` is a JS page; requesting funds from a script was not attempted. |

## 9. Raw checklist output

The checklist from `07-QIE-REFERENCE.md`, run as one script (`contracts/script/probe.sh`) and pasted unedited. One call failed with a TLS error from the public RPC; it had succeeded earlier (§4) and shows how unreliable a single RPC host is.

```text
# 2026-11-17T02:28:10Z  RPC=https://rpc1mainnet.qie.digital

$ cast chain-id
1990

$ cast block latest (number, timestamp, baseFeePerGas)
baseFeePerGas        1000000000
gasLimit             4294967295
number               11961173
timestamp            1794882494 (Tue, 17 Nov 2026 02:28:14 +0000)

$ cast call 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5 decimals()(uint8)
6

$ cast call 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5 symbol()(string)
"QUSDC"

$ cast call 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5 DOMAIN_SEPARATOR()(bytes32)
Error: server returned an error response: error code -32000: execution reverted

$ cast call 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5 nonces(address)(uint256) 0x0000000000000000000000000000000000000001
Error: server returned an error response: error code -32000: execution reverted

$ cast call 0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17 decimals()(uint8)
8

$ cast call 0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17 latestRoundData()(uint80,int256,uint256,uint256,uint80)
20239 [2.023e4]
15494207 [1.549e7]
1794856016 [1.794e9]
1794856016 [1.794e9]
20239 [2.023e4]

$ cast call 0x08cd2e72e156D8563B4351eb4065C262A9f553Ef factory()(address)
0x8E23128a5511223bE6c0d64106e2D4508C08398C

$ cast call 0x08cd2e72e156D8563B4351eb4065C262A9f553Ef WETH()(address)
Error: failed to retrieve chain ID from fork endpoint

Context:
- MPP HTTP request to https://rpc1mainnet.qie.digital/ failed: HTTP request failed: error sending request: error sending request: client error (Connect): tls handshake eof

$ cast call 0x8E23128a5511223bE6c0d64106e2D4508C08398C getPair(address,address)(address) 0x0087904D95BEe9E5F24dc8852804b547981A9139 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5
0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe

$ cast call 0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe token0()(address)
0x0087904D95BEe9E5F24dc8852804b547981A9139

$ cast call 0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe token1()(address)
0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5

$ cast call 0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe getReserves()(uint112,uint112,uint32)
29826135955897285397446 [2.982e22]
4383755230 [4.383e9]
1794882150 [1.794e9]

$ cast call 0x08cd2e72e156D8563B4351eb4065C262A9f553Ef getAmountsOut(uint256,address[])(uint256[]) 1000000000000000000 [0x0087904D95BEe9E5F24dc8852804b547981A9139,0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5]
[1000000000000000000 [1e18], 146531 [1.465e5]]

$ cast call 0x76ec8ed377cC0d36D1B48027ac7892Ec6799171E resolve(address)(string) 0xfde4d4aa9b603b5805cb4ac3390ae3b88b6c0fde
"molivo.qie"

$ cast call 0x76ec8ed377cC0d36D1B48027ac7892Ec6799171E resolve(address)(string) 0xe54269d36fc6c09de40433c0bc2cd7149fc365da
""

$ cast call 0x1D69d75AD7b77b91C3760F84faC52E651710f62e userDomain(address)(string) 0xe54269d36fc6c09de40433c0bc2cd7149fc365da
"hwgam372.qie"
```
