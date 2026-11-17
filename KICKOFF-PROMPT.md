# Prompts for Claude Code

Setup before the first prompt:

1. Put this whole folder at the root of an empty git repo.
2. Copy `CLAUDE.local.md.template` → `CLAUDE.local.md` and fill in what you have (public addresses, account status). No keys in it.
3. Copy `.env.example` → `apps/api/.env` later, when the agent creates that folder; fill in the Reloadly **test** credentials and throwaway dev keys yourself.
4. Run `claude` in the repo root.

---

## Prompt 1 — kickoff (paste as is)

```
You are joining the Qarta Pay project. Before writing any code:

1. Read CLAUDE.md, then every file in docs/ in numeric order, then CLAUDE.local.md if it exists.
2. Tell me, in a short list: what we are building, the P0 scope, the three biggest technical risks you see, and anything in the docs that looks contradictory or missing.

About secrets: real credentials live only in .env files (apps/api/.env, apps/web/.env.local, contracts/.env) and private team notes live in CLAUDE.local.md. Both are git-ignored. Never open, print, or commit the .env files or anything under secrets/. Use .env.example to see which variable names exist. If you need a value to be set, tell me the variable name and I will set it. Never copy anything from CLAUDE.local.md into a tracked file except public contract addresses that belong in the README.

Do not broadcast anything to QIE mainnet and do not call the live Reloadly API. Testnet, anvil, mainnet read-only calls and the Reloadly sandbox are fine.

Then start Step 1 of docs/09-PLAN.md (scaffold and probe):
- scaffold the monorepo exactly as described in docs/03-ARCHITECTURE.md
- run the probe checklist in docs/07-QIE-REFERENCE.md against mainnet (read-only) and write the raw results to docs/probe-results.md
- update every [UNVERIFIED] or [THIRD-PARTY] item you managed to confirm or disprove, in the doc where it appears and in docs/10-OPEN-QUESTIONS.md
- write the Reloadly sandbox smoke script; it will need RELOADLY_CLIENT_ID and RELOADLY_CLIENT_SECRET in apps/api/.env — tell me when you are ready for me to add them

Stop at the end of Step 1 and report: what you ran, what passed, what you could not verify, and whether the QIEDex in-transaction swap passes the decision rule in docs/04-SMART-CONTRACTS.md.
```

## Prompt 2 — contract

```
Do Step 2 of docs/09-PLAN.md. Implement QartaCheckout exactly per docs/04-SMART-CONTRACTS.md using the confirmed values in docs/probe-results.md. Write the tests listed there first where practical, including the fuzz/invariant and mainnet-fork tests. Then write the deploy script and deploy to QIE testnet with mocks (ask me for the keystore account name; do not ask for a private key). Finish with: forge test output summary, gas numbers for pay/settle/refund, the testnet address, and a short plain-language walkthrough of the contract that a teammate can use to review it line by line.
```

## Prompt 3 — backend

```
Do Step 3 of docs/09-PLAN.md per docs/05-BACKEND.md. Build in this order: Prisma schema, Reloadly client (with recorded sandbox fixtures), catalog, quotes, indexer, fulfilment worker, settle/refund sender. After each piece, run its tests. Pay special attention to the rules under "Money safety" in CLAUDE.md. The step is done when the scripted end-to-end run on testnet + sandbox passes for both the delivered path and the forced-failure refund path, plus the crash-between-supplier-call-and-DB-write test.
```

## Prompt 4 — frontend

```
Do Step 4 of docs/09-PLAN.md per docs/06-FRONTEND.md. Mobile-first. Start with wallet connection and network switching for QIE Wallet and MetaMask, then the airtime flow end to end against the local API, then gift cards, order status, history, reveal-code with SIWE, claimRefund, stats. Show me a screenshot or describe each screen as you finish it.
```

## Prompt 5 — mainnet preparation (you run the commands)

```
Prepare Step 5 of docs/09-PLAN.md. Do not execute anything on mainnet or against live Reloadly. Give me: (1) a pre-flight checklist, (2) the exact forge command to deploy with the keystore account, with every constructor argument explained, (3) the command to transfer ownership to OWNER_ADDRESS, (4) the verification command and the manual fallback, (5) the list of production env vars to set in hosting, (6) a 10-order dogfood test script for the team including one deliberate refund. Then wait while I run them and paste the results.
```

## Prompt for later sessions

```
Read CLAUDE.md, docs/09-PLAN.md, docs/10-OPEN-QUESTIONS.md and CLAUDE.local.md. Check git log and the current state of the code, tell me which plan step we are in and what is left for its "Done when", then continue from there.
```

## When you get an answer from QIE or Reloadly

```
New information: <paste the answer>. Update the relevant docs (remove the UNVERIFIED tag, tick the item in docs/10-OPEN-QUESTIONS.md), tell me whether it changes the plan or the code, and make the change if it is small.
```
