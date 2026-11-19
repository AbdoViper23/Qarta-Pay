#!/usr/bin/env bash
# Buys one airtime top-up on QIE testnet through a running API, from a Foundry keystore wallet.
# Testnet only (refuses any other chain). Used to check a testnet deployment end to end.
#
#   API=http://127.0.0.1:4000 ACCOUNT=qarta-deployer PAY_TOKEN=QUSDC bash scripts/testnet-buy.sh
#
# PHONE=08031230000 makes the fake supplier fail the top-up, to check the refund path.
# Asks for the keystore password unless KEYSTORE_PASSWORD is set (throwaway testnet keystores only).
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
API=${API:-http://127.0.0.1:4000}
ACCOUNT=${ACCOUNT:-qarta-deployer}
PAY_TOKEN=${PAY_TOKEN:-QUSDC}
AMOUNT=${AMOUNT:-1}
RPC=https://rpc1testnet.qie.digital
ZERO=0x0000000000000000000000000000000000000000

[ "$(curl -sf "$API/v1/config" | jq -r .chainId)" = 1983 ] || { echo "API is not on testnet 1983"; exit 1; }
SIGN=(--account "$ACCOUNT")
[ -n "${KEYSTORE_PASSWORD:-}" ] && SIGN+=(--password "$KEYSTORE_PASSWORD")
PAYER=$(cast wallet address "${SIGN[@]}")

body=$(jq -n --arg payer "$PAYER" --arg token "$PAY_TOKEN" --arg amount "$AMOUNT" --arg phone "${PHONE:-08031234567}" \
  '{kind:"AIRTIME", payer:$payer, payToken:$token, countryCode:"NG", recipientPhone:$phone, operatorId:341, amount:$amount}')
q=$(curl -sf -X POST "$API/v1/quotes" -H 'content-type: application/json' -d "$body")
id=$(jq -r .quote.orderId <<<"$q"); token=$(jq -r .quote.token <<<"$q"); amount=$(jq -r .quote.amount <<<"$q")
checkout=$(jq -r .checkout <<<"$q")
echo "quote $id: \$$(jq -r .display.usd <<<"$q") = $(jq -r .display.payAmount <<<"$q") $PAY_TOKEN"

if [ "$token" != "$ZERO" ]; then
  cast send "$token" "approve(address,uint256)" "$checkout" "$amount" "${SIGN[@]}" --rpc-url "$RPC" | grep -E '^status'
  value=0
else
  value=$amount
fi
tuple="($id,$PAYER,$token,$amount,$(jq -r .quote.usdAmount <<<"$q"),$(jq -r .quote.expiry <<<"$q"))"
cast send "$checkout" "pay((bytes32,address,address,uint256,uint256,uint64),bytes)" "$tuple" "$(jq -r .signature <<<"$q")" \
  --value "$value" "${SIGN[@]}" --rpc-url "$RPC" | grep -E '^(status|transactionHash)'

for _ in $(seq 1 40); do
  status=$(curl -sf "$API/v1/orders/$id" | jq -r .status)
  echo "order status: $status"
  case $status in SETTLED|REFUNDED|NEEDS_REVIEW) break ;; esac
  sleep 5
done
curl -sf "$API/v1/orders/$id" | jq '{status, paidTxHash, settleTxHash, refundTxHash}' 2>/dev/null || true
