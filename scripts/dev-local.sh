#!/usr/bin/env bash
# Runs the whole of Qarta Pay on this machine, with no credentials and no real money:
#   local anvil chain + QartaCheckout and mocks (QUSDC, QIE/USD feed, QIEDex pair)
#   + embedded PostgreSQL + API with the fake supplier + web app.
#
#   bash scripts/dev-local.sh
#
# Then open http://localhost:3000, add the network "Localhost 8545" (chain id 31337) to your
# wallet, and import the demo buyer key printed below (an anvil test key, worthless anywhere else).
# Ctrl+C stops everything.
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC=http://127.0.0.1:8545
PIDS=()
cleanup() { for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

MNEMONIC="test test test test test test test test test test test junk"
key() { cast wallet private-key "$MNEMONIC" "$1"; }
DEPLOYER_KEY=$(key 0); SIGNER_KEY=$(key 1); FULFILLER_KEY=$(key 2); BUYER_KEY=$(key 3)
BUYER=$(cast wallet address --private-key "$BUYER_KEY")
TREASURY=$(cast wallet address --private-key "$(key 5)")

echo "== starting anvil"
anvil --port 8545 --silent & PIDS+=($!)
for _ in $(seq 50); do cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 0.2; done

echo "== deploying QartaCheckout and mocks"
cd "$ROOT/contracts"
QUOTE_SIGNER_ADDRESS=$(cast wallet address --private-key "$SIGNER_KEY") \
FULFILLER_ADDRESS=$(cast wallet address --private-key "$FULFILLER_KEY") \
TREASURY_ADDRESS=$TREASURY DEPLOY_MOCKS=true \
  forge script script/Deploy.s.sol:Deploy --rpc-url $RPC --private-key "$DEPLOYER_KEY" --broadcast >/dev/null
RUN=broadcast/Deploy.s.sol/31337/run-latest.json
addr() { jq -r --arg n "$1" '[.transactions[] | select(.contractName == $n)][0].contractAddress' $RUN; }
CHECKOUT=$(addr QartaCheckout); QUSDC=$(addr MockERC20); FEED=$(addr MockAggregatorV3); PAIR=$(addr MockPair)
WQIE=$(cast call "$PAIR" "token0()(address)" --rpc-url $RPC)
START_BLOCK=$(jq -r '[.receipts[].blockNumber][0]' $RUN | cast to-dec)
cast send "$QUSDC" "mint(address,uint256)" "$BUYER" 1000000000 --private-key "$DEPLOYER_KEY" --rpc-url $RPC >/dev/null
cd "$ROOT"

echo "== starting PostgreSQL"
DB_LOG=$(mktemp)
pnpm --filter api --silent db:dev >"$DB_LOG" 2>&1 & PIDS+=($!)
for _ in $(seq 100); do grep -q DATABASE_URL "$DB_LOG" && break; sleep 0.3; done
DATABASE_URL=$(grep -o 'postgresql://[^ ]*' "$DB_LOG" | head -1)

echo "== starting API (fake supplier) on :4000"
env SUPPLIER=fake CHAIN_ID=31337 RPC_URLS=$RPC CHECKOUT_ADDRESS="$CHECKOUT" START_BLOCK="$START_BLOCK" CONFIRMATIONS=0 \
  QUOTE_SIGNER_KEY="$SIGNER_KEY" FULFILLER_KEY="$FULFILLER_KEY" QUSDC_ADDRESS="$QUSDC" QIE_USD_FEED="$FEED" \
  QIEDEX_WQIE_QUSDC_PAIR="$PAIR" WQIE_ADDRESS="$WQIE" DATABASE_URL="$DATABASE_URL" \
  CODE_ENCRYPTION_KEY=$(openssl rand -hex 32) SESSION_SECRET=$(openssl rand -hex 32) \
  RELOADLY_ENV=sandbox RELOADLY_CLIENT_ID=unused RELOADLY_CLIENT_SECRET=unused \
  WEB_ORIGIN=http://localhost:3000 WORKER_POLL_MS=1000 INDEXER_POLL_MS=1000 LOG_LEVEL=info \
  pnpm --filter api --silent exec tsx src/main.ts & PIDS+=($!)

echo "== starting web on :3000"
env NEXT_PUBLIC_API_URL=http://localhost:4000 NEXT_PUBLIC_CHAIN_ID=31337 NEXT_PUBLIC_RPC_URL=$RPC \
  pnpm --filter web --silent dev & PIDS+=($!)

cat <<INFO

  Qarta Pay is running locally.
    web       http://localhost:3000
    api       http://localhost:4000/healthz
    chain     $RPC (chain id 31337)
    checkout  $CHECKOUT
  Demo buyer (anvil test key, holds 10,000 QIE and 1,000 mock QUSDC):
    address   $BUYER
    key       $BUYER_KEY
  Fake supplier: phone ending 0000 -> delivery fails and is refunded; anything else succeeds.
  Ctrl+C to stop.

INFO
wait
