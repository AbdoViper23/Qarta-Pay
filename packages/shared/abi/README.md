# ABIs

Collected 17 Nov 2026 from QIE Mainnet (chain 1990). See `docs/probe-results.md` for the calls behind each entry.

## Published by the explorer (verified source)

| File | Contract | Address | Source |
|------|----------|---------|--------|
| `QUSDC.json` | QUSDC (ERC-20, 6 decimals) | `0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5` | `https://mainnet.qie.digital/api/v2/smart-contracts/0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5` |
| `QieAggregatorV3.json` | QIE/USD price feed (`AggregatorV3`) | `0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17` | `https://mainnet.qie.digital/api/v2/smart-contracts/0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17` |

## Not published (contracts are not verified)

`unverified-signatures.json` holds function signatures for the QIEDex router, factory and pair, and for the QIE ID resolver, registries and name NFT. Nobody published these ABIs. Each signature was found by reading selectors from the deployed bytecode and then confirmed with a live read-only call. It lists only the functions Qarta Pay uses.

If QIE publishes official ABIs, replace this file and note the source here.
