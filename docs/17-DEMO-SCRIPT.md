# 17 — Demo video script

The mandatory demo video for QIE Hackathon 3.0 (`02-HACKATHON.md`). Target length 2:30, in English, narrated by the team.

The video has two kinds of footage:
- **Animated scenes** (intro, problem, escrow flow, QIE integrations, roadmap). They are rendered from HTML in the site's own fonts and colours.
- **A real screen recording** of one purchase on QIE **Mainnet**, recorded by the team after go-live.

The two are cut together with on-screen captions.

Every sentence in the voice-over must be true on the day it is recorded. If something changes, for example the free-order offer or the fee, change the line.

## Before recording (checklist)

- [ ] The mainnet contract is deployed and verified on `mainnet.qie.digital`, and the site runs on mainnet (`CHAIN_ID=1990`).
- [ ] Reloadly is live and the float is funded. Test one real top-up first, off camera.
- [ ] A **fresh wallet** in QIE Wallet that has never bought, so the "no fee on your first 3 orders" card shows. Fund it with a little QIE (gas, and optionally pay in QIE) and QUSDC.
- [ ] Optional but strong: give that wallet a `.qie` name, so the wallet chip shows it (QIE ID). Skip the line in beat 4a if it has none.
- [ ] A phone with a number on the chosen operator, on screen or ready to film, to show the airtime arriving.
- [ ] Browser: 1920×1080, zoom 125%, a clean profile (no bookmarks bar, no other extensions visible), light theme. Close notifications.
- [ ] Record the screen with OBS (free) at 1920×1080, 30 fps. Record the voice separately with a phone or headset in a quiet room; it is easier to redo a line than a take.

## Timeline

| Time | Scene | On screen | Voice-over | Made by |
|------|-------|-----------|------------|---------|
| 0:00–0:10 | 1 Intro | The logo builds: the coin unrolls into the receipt strip. "SPEND CRYPTO ON REAL LIFE." | "This is Qarta Pay. It lets you spend QIE on real life: phone airtime and gift cards, straight from your wallet." | Animated |
| 0:10–0:25 | 2 Problem | "You hold QIE. Where do you spend it?" A receipt card reads "Pay first. Trust us.", stamped NO GUARANTEE. | "If you hold QIE today, there are very few places to spend it. And most crypto gift card shops ask you to pay first and trust them. If the delivery fails, so does your money." | Animated |
| 0:25–0:45 | 3 How it works | Escrow flow: wallet → escrow contract on QIE Mainnet → delivered, so released; failed, so refunded. Then "2 h: claim it back yourself". | "Qarta Pay works differently. Your payment goes into an escrow contract on QIE Mainnet. We deliver through our supplier, Reloadly, and only after delivery is the payment released. If delivery fails, the contract refunds you automatically. And if nothing happens within two hours, you take your payment back yourself." | Animated |
| 0:45–0:55 | 4a Connect | The site, then **Connect wallet**, then **QIE Wallet**. The chip shows the `.qie` name. | "Let's buy something on mainnet. I connect with QIE Wallet, and instead of a hex address the app shows my .qie name." | **Screen recording** |
| 0:55–1:05 | 4b Choose | Top up, then Egypt, then the phone number. The operator is detected. Pick an amount. | "I'll top up an Egyptian number. The operator is detected from the number; I pick an amount." | **Screen recording** |
| 1:05–1:20 | 4c Price | **Get price**. The free-order card ("No fee on your first 3 orders"), then the breakdown: product cost, Qarta fee struck through, payment costs, you pay. Toggle QUSDC / QIE. | "Here is the full price, line by line. As a new wallet, my first three orders carry no Qarta fee. I only pay the product and its payment costs. I can pay in QUSDC or in native QIE, priced from the QIE oracle and cross-checked with QIEDex." | **Screen recording** |
| 1:20–1:30 | 4d Pay | **Pay**, then QIE Wallet asks for confirmation, then confirm. | "One confirmation in the wallet, and the payment is in escrow." | **Screen recording** |
| 1:30–1:45 | 4e Progress | The order page: the progress bar runs through Paid, Delivering, Delivered and reaches 100% at settlement. | "The order page follows it live: paid, delivering, delivered. It reaches one hundred percent only when the escrow has released the payment on-chain." | **Screen recording** (cut the wait) |
| 1:45–2:00 | 4f Proof | Phone: the operator SMS or the new balance. Then **view on explorer**: the payment into the contract, and the settlement transaction. | "And on the phone, the airtime has arrived. On the QIE explorer you can see both transactions: the payment into escrow, and the release after delivery." | **Screen recording** + phone clip |
| 2:00–2:15 | 5 Built on QIE | Five tiles: QIE Wallet, QIE & QUSDC, QIE ID, QIEDEX, QIE Oracle, with the contract address. A short cut to the **Powered by QIE** page with the live oracle price. | "Qarta Pay is built on QIE end to end: QIE Wallet, QIE and QUSDC, QIE ID names, QIEDEX, and the QIE oracle, which guards every QIE payment on-chain. The contract is open source and verified." | Animated + 3 s recording |
| 2:15–2:30 | 6 Roadmap + outro | Four phases, then the logo, the URL and "QIE Hackathon 3.0". | "Next come data bundles, sending to a .qie name, bill payments, and a checkout other QIE apps can plug into. Qarta Pay: spend crypto on real life." | Animated |

The voice-over is about 330 words, which fits 2:30 at a calm pace (about 140 words per minute).

## Captions

Burned in at the bottom, white text on an ink bar, one short line per beat. The narration is not repeated word for word:

1. Spend QIE on airtime and gift cards
2. Most shops: pay first, trust them
3. Paid → held in escrow → released after delivery
4. Connect with QIE Wallet · your .qie name
5. Operator detected from the number
6. Full price, line by line · first 3 orders: no fee
7. One confirmation · payment in escrow
8. Live order status · 100% only when settled on-chain
9. Delivered · both transactions on the QIE explorer
10. QIE Wallet · QIE & QUSDC · QIE ID · QIEDEX · Oracle
11. Next: data · send to .qie · bills · Qarta Checkout

## Recording tips

- Do the purchase once without recording, then record. Keep takes short (one beat per take), which makes cutting easy.
- Move the mouse slowly and pause one second after each click.
- If delivery takes long, cut the wait. Do not speed up the progress bar footage itself.
- Do not show the Reloadly dashboard, the Vercel dashboard, `.env` files or a full phone number on screen. Blur the number field if it is visible for more than a moment.

## Hand-off for editing

- Put the clips in one folder: `4a.mp4` … `4f.mp4`, `phone.mp4`, `voice-*.m4a` (one file per scene).
- Add the mainnet contract address and both explorer transaction links.
- The animated scenes and the final cut are produced from those files (`scripts/` in the repo is not involved; the rendering work happens outside the repo).
