# 08 — Reloadly Reference (supplier)

Reloadly provides airtime, data bundles and gift cards through REST APIs. Official reference: `https://docs.reloadly.com` and `https://developers.reloadly.com` (both are JS-rendered; open in a browser). Facts below were collected 15–17 Nov 2026. Reloadly also publishes its OpenAPI sources on GitHub (`github.com/Reloadly/reloadly-airtime-documentation` and `github.com/Reloadly/reloadly-giftcard-documentation`, folder `openapi/`, last updated 2022–2023); items marked "official spec" come from there. No sandbox call has been made yet.

Write a thin typed client in `apps/api/src/supplier/reloadly/`, behind a `Supplier` interface, so a second supplier (Bitrefill Business API, DingConnect) can be added later.

## Environments and auth **[VERIFIED: support.reloadly.com, docs.reloadly.com]**

- Token: `POST https://auth.reloadly.com/oauth/token`, `Content-Type: application/json`

```json
{
  "client_id": "…",
  "client_secret": "…",
  "grant_type": "client_credentials",
  "audience": "https://topups-sandbox.reloadly.com"
}
```

- **One token per product**; the `audience` selects product and environment:

| Product | Sandbox base URL / audience | Live base URL / audience |
|---------|-----------------------------|--------------------------|
| Airtime + data | `https://topups-sandbox.reloadly.com` | `https://topups.reloadly.com` |
| Gift cards | `https://giftcards-sandbox.reloadly.com` | `https://giftcards.reloadly.com` |

- Response has `token_type: Bearer`, `expires_in` (seconds). Lifetime: 60 days (5,184,000 s) for live tokens and 24 hours (86,400 s) for sandbox tokens **[VERIFIED: support.reloadly.com "Locating your API credentials"]**; always use `expires_in`, cache the token, refresh on expiry or on a `401`.
- Test and live credentials are separate (dashboard → Developers; a "Sandbox" toggle switches them). Sandbox comes with a preloaded test balance. Live calls deduct real money.
- Headers on product calls: `Authorization: Bearer <token>` and
  - Airtime: `Accept: application/com.reloadly.topups-v1+json`
  - Gift cards: `Accept: application/com.reloadly.giftcards-v1+json`
- Balance: `GET {base}/accounts/balance`.

## Airtime and data

### Detect operator **[VERIFIED: Reloadly blog]**
`GET /operators/auto-detect/phone/{phone}/countries/{ISO2}?suggestedAmounts=true&suggestedAmountsMap=true`

Returns the operator object (`operatorId`, `name`, …). Failure returns JSON with a `message` such as "Could not auto detect operator for given phone number" → let the user pick from `GET /operators/countries/{ISO2}` **[VERIFIED: official spec]**.

Operator object fields **[VERIFIED: official spec; still confirm against a sandbox response and type accordingly]**: `id`, `operatorId`, `name`, `bundle`, `data`, `pin`, `supportsLocalAmounts`, `denominationType` (`FIXED` | `RANGE`), `senderCurrencyCode`, `senderCurrencySymbol`, `destinationCurrencyCode`, `destinationCurrencySymbol`, `commission`, `internationalDiscount`, `localDiscount`, `mostPopularAmount`, `minAmount`, `maxAmount`, `localMinAmount`, `localMaxAmount`, `country`, `fx`, `logoUrls`, `fixedAmounts`, `fixedAmountsDescriptions`, `localFixedAmounts`, `localFixedAmountsDescriptions`, `suggestedAmounts`, `suggestedAmountsMap`, `promotions`.

### Top-up **[VERIFIED: Reloadly support + blog]**
Use the async endpoint in production (Reloadly's own recommendation):

`POST /topups-async`
```json
{
  "operatorId": 341,
  "amount": "10",
  "useLocalAmount": false,
  "customIdentifier": "<orderId>",
  "recipientPhone": { "countryCode": "NG", "number": "08012345678" }
}
```
Response: `{ "transactionId": 28805 }` (immediate; delivery not yet done).

- `useLocalAmount: true` means `amount` is in the operator's local currency.
- `customIdentifier` is our own reference; set it to the `orderId`. The official spec says: "each transaction reference is to be unique. Once a reference has been used for a top-up, it cannot be reused." The actual rejection and its error body are **[UNVERIFIED]** — test in sandbox; either way, always look up before retrying.

### Status **[VERIFIED]**
`GET /topups/{transactionId}/status` → `{ "status": "…", "transaction": { "transactionId", "status", "operatorName", "deliveredAmount", "customIdentifier", "balanceInfo": { "oldBalance", "newBalance" }, … } }`

| Status | Meaning | Our action |
|--------|---------|------------|
| `PROCESSING` | operator has not confirmed yet | poll, backoff from 5 s, up to 30 min |
| `SUCCESSFUL` | recipient credited | settle on-chain |
| `REFUNDED` | operator failed; amount auto-returned to our Reloadly wallet | refund the user on-chain |
| anything else / error | treat as unknown | `NEEDS_REVIEW` |

Most operators confirm within minutes; some take up to 30 minutes.

The official spec shows the status response as a **flat** object (`transactionId`, `status`, `operatorTransactionId`, `customIdentifier`, `recipientPhone`, `operatorId`, `operatorName`, `requestedAmount`, `deliveredAmount`, `transactionDate`, `pinDetail`, `balanceInfo`, …), not the nested shape above, and lists no status enum. Which shape is current is **[UNVERIFIED]**: write the zod schema from a real sandbox response.

Transaction lookup: `GET /topups/reports/transactions` and `GET /topups/reports/transactions/{transactionId}` **[VERIFIED: official spec]**. Whether the list can be filtered by `customIdentifier` is **[UNVERIFIED]**.

### Webhook (optional) **[VERIFIED: blog; signature scheme UNVERIFIED]**
Register an HTTPS endpoint in the dashboard. Event `type: "airtime_transaction.status"`, payload `{ id, type, liveMode, date, data: { status, transaction: { … } } }`. Respond `200`. Signature verification is described in the docs under webhooks → technical considerations; read it before trusting webhook bodies. Until then treat a webhook only as a hint to poll the status endpoint.

## Gift cards **[VERIFIED: Reloadly blog + docs]**

- Products by country: `GET /countries/{ISO2}/products`
- Product fields: `productId`, `productName`, `global`, `senderFee`, `discountPercentage`, `denominationType` (`FIXED`; the schema's min/max denomination fields show `RANGE` products exist, behaviour of `unitPrice` for them **[UNVERIFIED]**), `recipientCurrencyCode`, `minRecipientDenomination`, `maxRecipientDenomination`, `fixedRecipientDenominations`, `senderCurrencyCode`, `minSenderDenomination`, `maxSenderDenomination`, `fixedSenderDenominations`, `fixedRecipientToSenderDenominationsMap`, `logoUrls`, `brand { brandId, brandName }`, `country { isoName, name, flagUrl }`, `redeemInstruction { concise, verbose }`.
- Order: `POST /orders`

```json
{
  "productId": 3058,
  "countryCode": "NG",
  "quantity": 1,
  "unitPrice": 5,
  "customIdentifier": "<orderId>",
  "senderName": "Qarta Pay",
  "recipientEmail": "orders@our-domain.example"
}
```
  `unitPrice` is in the product's recipient currency. `recipientPhoneDetails { countryCode, phoneNumber }` is optional (SMS delivery, costs an `smsFee`); do not use it.
- Order response: `transactionId`, `amount`, `discount`, `currencyCode`, `fee`, `smsFee`, `status` (e.g. `SUCCESSFUL`), `customIdentifier`, `transactionCreatedTime`, `product { … }`. Orders are fulfilled in real time.
- Get order: `GET /reports/transactions/{transactionId}` **[VERIFIED: official spec]**. (`GET /orders/{id}` is not in the official spec.)
- Order statuses **[VERIFIED: official spec]**: `SUCCESSFUL`, `PENDING`, `PROCESSING`, `REFUNDED` (purchase failed, funds reversed at once), `FAILED` (purchase failed, funds **not yet** reversed). Treat `PENDING` / `PROCESSING` as "poll", `REFUNDED` as the refund path, and `FAILED` as `NEEDS_REVIEW` until it turns into `REFUNDED`.
- Card code / PIN: `GET /orders/transactions/{transactionId}/cards` **[VERIFIED: official spec]**. The spec names the code field `cardNumber`; the PIN field name in the spec looks wrong (`amount`), so take both names from a sandbox response **[UNVERIFIED]**.
- Redeem instructions: `GET /redeem-instructions/{brandId}` → `{ brandId, brandName, concise, verbose }`.
- Reloadly also emails the code to `recipientEmail`; use a mailbox we control, not the user's, and deliver the code in-app.

Cost of an order to us = sender amount for the denomination + `senderFee` − discount. Compute `supplierCostUsd` from the product object (`fixedRecipientToSenderDenominationsMap` for fixed products) and assert it against the `amount` in the order response; alert on drift.

## Account, funding and rules **[VERIFIED: Reloadly Corporate Terms, Platform Client Terms, support]**

- Eligibility: "Only business and governmental entities" may hold an account.
- Reselling to end users makes us a **Platform Client**. The terms ask Platform Clients to contact `sales@reloadly.com` before proceeding and to disclose to end users that Reloadly is a third-party provider. **Human task — do this before going live.**
- Wallet funding: credit card (processing fees deducted), wire transfer, or crypto payment gateway (minimum $50). Crypto payments above 1,000 EUR require KYC.
- Prepaid: every live order deducts from the wallet. The API must refuse to quote when the balance cannot cover open orders.
- Commission reference: about 1.5% discount for high-volume airtime **[THIRD-PARTY]**; gift card discounts vary by brand (`discountPercentage`).
- Coverage claims: 700–800+ operators in 140+ countries; 14,000+ gift card products.
- Sanctioned-country restrictions apply (US OFAC list).
- Support: `tickets@reloadly.com`.

## Sandbox testing notes

- Sandbox returns realistic responses without delivering anything.
- Reloadly's blog has an article on testing with numbers from different countries (`blog.reloadly.com`, "How to test Reloadly's API with numbers from different countries").
- Record sandbox responses as fixtures for integration tests so CI does not depend on the network.

## Curated launch catalog (config, not code)

Start small; expand after the flow is stable.

- Airtime/data countries: choose 3–5 where the QIE community is concentrated (ask in Telegram; candidates: Nigeria, South Africa, Kenya, Ghana, India, Philippines).
- Gift cards: ~10 global digital brands with instant codes (examples: Google Play, Steam, PlayStation, Xbox, Amazon, Apple, Netflix, Spotify, Uber, Airbnb), each pinned to specific `productId`s and denominations.
