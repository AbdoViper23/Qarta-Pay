# 06 — Frontend

Next.js (App Router) + wagmi v2 + viem + Tailwind. Mobile-first: most target users are on phones.

## As built (Step 4, 18 Nov 2026)

Next.js 16 (App Router), wagmi 3, viem, Tailwind 4, Motion (`motion/react`) for animation. Landing page `/` in `apps/web/src/app/page.tsx` (sections in `components/landing/`: hero with a looping phone demo, country marquee, scroll-pinned escrow story, QIE bento, facts, final CTA). Store pages live in the route group `apps/web/src/app/(shop)/` (one-column layout): `/airtime`, `/giftcards`, `/orders/[id]`, `/history`, `/stats`, `/about`, `/powered-by-qie`.

Design system (22 Nov 2026, ui-ux-pro-max): dark fintech, tokens in `app/globals.css` (near-black navy surfaces, amber `brand` for primary actions and trust, teal `accent` for small highlights), Instrument Serif for display headings, Geist for text, Geist Mono for amounts and labels, lucide icons (no emoji). Every animation honours `prefers-reduced-motion` (`MotionConfig reducedMotion="user"` in `Providers`, CSS fallback in `globals.css`). Landing facts are product facts, never traction numbers. Checkout logic: `apps/web/src/components/Checkout.tsx`; wallet chip: `components/WalletButton.tsx`; error sentences: `lib/errors.ts`; Sign-In: `lib/siwe.ts`.

Differences from the spec: no WalletConnect (QIE Wallet support for it is unknown); data bundles are not offered; QUSDC is the default pay token. The app runs on one chain set by `NEXT_PUBLIC_CHAIN_ID` (1990, 1983 or 31337 for local anvil). Not yet done: a test on a real phone and in the QIE Wallet mobile browser (human task).

## Screens

1. **Home** — two big actions: "Top up a phone", "Buy a gift card". Connected wallet chip, QIE and QUSDC balances, and a "Get QUSDC" link next to the QUSDC balance.
   - Wallet chip (P0, QIE ID): shows the primary `name.qie` from `GET /v1/identity/:wallet`, else the short address (`0x12ab…cd34`). The full address is in a tooltip/copy button. Render the name as plain text, never as HTML.
2. **Airtime / data**
   - Country + phone input → debounce → `/v1/airtime/detect` → operator logo and name (user can correct it).
   - Amount: fixed chips or range input depending on operator type. Show what the recipient gets in local currency.
   - Pay-with toggle: QUSDC | QIE. Price and a countdown for the quote. If `/v1/prices` returns `qieQuotesEnabled = false`, disable the QIE option with a plain reason ("QIE price check unavailable right now — pay with QUSDC").
3. **Gift cards** — country filter → brand grid → denomination → (P1) optional "send as a gift to `name.qie` / wallet".
4. **Checkout** — summary → (QUSDC only) approve → pay. One clear primary button that changes label per step. If the QUSDC balance is below the price, show "Get QUSDC on QIEDex" (P0) next to the button.
5. **Order status** — live timeline: Paid → Delivering → Delivered. Links to the payment tx and settle/refund tx on the explorer. For gift cards: "Reveal code" (requires a wallet signature), copy button, redeem instructions.
   - If delivery fails: "Refunded to your wallet" with the refund tx link.
   - If the order is stuck past the timeout: "Claim refund" button calling `claimRefund(orderId)` directly on the contract.
6. **History** — orders of the connected wallet, headed with the wallet's `name.qie` when it has one.
7. **Stats** — public traction page.
8. **About / How it works** — escrow explanation in three steps, contract address, link to Powered by QIE.
9. **Powered by QIE** (`/powered-by-qie`, P0) — one card per QIE component, linked from the footer and from About:

   | Component | What the card shows |
   |-----------|---------------------|
   | QIE Mainnet + `QartaCheckout` | escrow in plain words; contract address with explorer link |
   | QIE Wallet | "Connect with QIE Wallet"; which wallet is connected |
   | QIE / QUSDC | both accepted; QUSDC address; "Get QUSDC" link |
   | QIE ID | the connected wallet's `.qie` name, or a link to `https://id.qie.digital/` |
   | QIE Oracle | live QIE/USD price and its age from `/v1/prices`; feed address; "every native-QIE payment is checked against this on-chain" |
   | QIEDEX | live pool price and deviation from the oracle; "QIE prices use the lower of the oracle and this pool"; pair and router addresses; "treasury revenue is converted to QUSDC here" with an explorer link to the treasury address, where the sweep swaps are visible; "Get QUSDC" link |
   | QIE Pass (P1) | status "coming soon" until shipped, then the cashback eligibility rule |

   Addresses come from `/v1/config`, never hard-coded in the page. Keep this page in sync with the README "QIE integrations" table.

## Wallet connection

From the QIE Wallet integration guide **[VERIFIED]**:

- Prefer **EIP-6963** discovery; QIE Wallet announces `info.rdns === 'me.qiewallet'`. wagmi's `injected()` connector with multi-injected-provider discovery handles this.
- `window.qie` is always set by QIE Wallet. `window.ethereum` may belong to another wallet.
- QIE Wallet sets `isMetaMask = true` for compatibility; do not use it to identify the wallet.
- No `disconnect` event; a disconnect arrives as `accountsChanged` with `[]`.
- Compare chain IDs numerically (wallet returns lowercase hex).
- Wrong network → `wallet_switchEthereumChain`, on error `4902` → `wallet_addEthereumChain` with the params in `07-QIE-REFERENCE.md`.
- Testnet is hidden in QIE Wallet until the user enables it in settings; switching to 1983 returns `4902` until then.

List QIE Wallet first in the connect modal, MetaMask second. WalletConnect / mobile deep-link support for QIE Wallet is undocumented; on mobile, tell users to open the site inside their wallet's in-app browser if no injected provider is found.

## Chain definition (shared package)

```ts
export const qieMainnet = defineChain({
  id: 1990,
  name: 'QIE Mainnet',
  nativeCurrency: { name: 'QIE', symbol: 'QIE', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc1mainnet.qie.digital', 'https://rpc5mainnet.qie.digital'] } },
  blockExplorers: { default: { name: 'QIE Explorer', url: 'https://mainnet.qie.digital' } },
});
```

## UX rules

- Never show a raw error. Map contract reverts (expired quote, wrong payer, paused) to plain sentences with a next action ("Price expired — get a new price").
- Quote expiry: at 0 the pay button turns into "Refresh price".
- After the pay tx is sent, navigate to the order page immediately and poll `/v1/orders/:id` every 2 s.
- Phone numbers: validate with `libphonenumber-js`; show the formatted number back before payment ("You are topping up +234 801 234 5678 — MTN Nigeria"). A wrong number cannot be undone.
- Gift card codes are shown only after a signature from the entitled wallet; never put a code in a URL or in analytics.
- Show prices in USD with the token amount next to it; QUSDC is the default pay token.
- "Get QUSDC" opens the QIEDex swap page (`https://www.swap.dex.qie.digital/swap`, from `07-QIE-REFERENCE.md`) in a new tab. Read the URL from config (`NEXT_PUBLIC_QIEDEX_SWAP_URL`). Do not add token query parameters unless the probe confirms QIEDex supports them.
- Copy: plain language, no "web3" jargon on the main flows.

## Brand

Name: **Qarta Pay**. Tagline: "Your crypto, as good as cash." Tone: simple, trustworthy, a little warm. Avoid imitating any existing brand's logo or look.
