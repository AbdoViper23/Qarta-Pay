#!/usr/bin/env bash
# Rehearses the Step 2 "Done when" sequence with cast against a QartaCheckout deployed with mocks:
#   1. pay (mock QUSDC) -> settle      2. pay (mock QUSDC) -> refund
#   3. native pay rejected by the oracle guard (under-priced)   4. native pay accepted
#
# Default target: a local anvil started by this script, using anvil's public test keys.
# For testnet, see docs/12-STATUS.md (it needs a funded keystore account; never put keys in files).
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
cd "$(dirname "$0")/.."

RPC=http://127.0.0.1:8546
anvil --port 8546 --silent & ANVIL=$!
trap 'kill $ANVIL 2>/dev/null' EXIT
sleep 2

# anvil's well-known development accounts (public; worthless outside a local node)
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SIGNER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
FULFILLER_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
PAYER_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
addr() { cast wallet address --private-key "$1"; }
SIGNER=$(addr $SIGNER_KEY); FULFILLER=$(addr $FULFILLER_KEY); PAYER=$(addr $PAYER_KEY)
TREASURY=0x000000000000000000000000000000000000bEEF

export QUOTE_SIGNER_ADDRESS=$SIGNER FULFILLER_ADDRESS=$FULFILLER TREASURY_ADDRESS=$TREASURY DEPLOY_MOCKS=true
OUT=$(forge script script/Deploy.s.sol --rpc-url $RPC --private-key $DEPLOYER_KEY --broadcast 2>&1)
CHECKOUT=$(echo "$OUT" | awk '/^  QartaCheckout /{print $2}')
QUSDC=$(echo "$OUT" | awk '/MockERC20 \(QUSDC\)/{print $3}')
echo "QartaCheckout $CHECKOUT   mock QUSDC $QUSDC"

send() { cast send --rpc-url $RPC "$@" >/dev/null; }
call() { cast call --rpc-url $RPC "$@"; }
QUOTE_T='(bytes32,address,address,uint256,uint256,uint64)'

# pay ORDER TOKEN AMOUNT USD VALUE -> prints nothing, fails on revert
pay() {
  local id=$1 token=$2 amount=$3 usd=$4 value=$5 expiry q digest sig
  expiry=$(( $(cast block latest -f timestamp --rpc-url $RPC) + 600 ))
  q="($id,$PAYER,$token,$amount,$usd,$expiry)"
  digest=$(call $CHECKOUT "hashQuote($QUOTE_T)(bytes32)" "$q")
  sig=$(cast wallet sign --no-hash --private-key $SIGNER_KEY "$digest")
  cast send --rpc-url $RPC --private-key $PAYER_KEY --value "$value" $CHECKOUT "pay($QUOTE_T,bytes)" "$q" "$sig"
}
status() { call $CHECKOUT "orders(bytes32)(address,address,uint256,uint64,uint8)" "$1" | tail -1; }

send --private-key $PAYER_KEY $QUSDC "mint(address,uint256)" $PAYER 100000000
send --private-key $PAYER_KEY $QUSDC "approve(address,uint256)" $CHECKOUT 100000000

A=$(cast keccak order-a); B=$(cast keccak order-b); C=$(cast keccak order-c); D=$(cast keccak order-d)

pay $A $QUSDC 10000000 10000000 0 >/dev/null
send --private-key $FULFILLER_KEY $CHECKOUT "settle(bytes32)" $A
echo "1. pay -> settle:  status $(status $A) (2 = Settled), treasury QUSDC $(call $QUSDC 'balanceOf(address)(uint256)' $TREASURY)"

pay $B $QUSDC 10000000 10000000 0 >/dev/null
send --private-key $FULFILLER_KEY $CHECKOUT "refund(bytes32)" $B
echo "2. pay -> refund:  status $(status $B) (3 = Refunded), payer QUSDC $(call $QUSDC 'balanceOf(address)(uint256)' $PAYER)"

# Feed is $0.15/QIE. 50 QIE = $7.50, quoted as a $10 order: 25% under, tolerance 10% -> rejected.
if pay $C 0x0000000000000000000000000000000000000000 50000000000000000000 10000000 50ether >/dev/null 2>&1; then
  echo "3. FAILED: under-priced native pay was accepted"; exit 1
fi
echo "3. under-priced native pay rejected by the oracle guard: status $(status $C) (0 = None)"

pay $D 0x0000000000000000000000000000000000000000 100000000000000000000 15000000 100ether >/dev/null
echo "4. correctly priced native pay accepted: status $(status $D) (1 = Paid)"
