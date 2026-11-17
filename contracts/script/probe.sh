#!/usr/bin/env bash
# Probe checklist from docs/07-QIE-REFERENCE.md. Read-only calls against QIE Mainnet.
export PATH=$PATH:$HOME/.foundry/bin
RPC=${RPC:-https://rpc1mainnet.qie.digital}
QUSDC=0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5; FEED=0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17
ROUTER=0x08cd2e72e156D8563B4351eb4065C262A9f553Ef; FACTORY=0x8E23128a5511223bE6c0d64106e2D4508C08398C
WQIE=0x0087904D95BEe9E5F24dc8852804b547981A9139; PAIR=0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe
RESOLVER=0x76ec8ed377cC0d36D1B48027ac7892Ec6799171E; REG_B=0x1D69d75AD7b77b91C3760F84faC52E651710f62e
run(){ echo "\$ $*"; timeout 60 "$@" --rpc-url $RPC 2>&1 | head -30; echo; }
echo "# $(date -u +%FT%TZ)  RPC=$RPC"; echo
run cast chain-id
echo '$ cast block latest (number, timestamp, baseFeePerGas)'; timeout 60 cast block latest --rpc-url $RPC 2>&1 | grep -E '^(number|timestamp|baseFeePerGas|gasLimit)'; echo
run cast call $QUSDC "decimals()(uint8)"
run cast call $QUSDC "symbol()(string)"
run cast call $QUSDC "DOMAIN_SEPARATOR()(bytes32)"
run cast call $QUSDC "nonces(address)(uint256)" 0x0000000000000000000000000000000000000001
run cast call $FEED "decimals()(uint8)"
run cast call $FEED "latestRoundData()(uint80,int256,uint256,uint256,uint80)"
run cast call $ROUTER "factory()(address)"
run cast call $ROUTER "WETH()(address)"
run cast call $FACTORY "getPair(address,address)(address)" $WQIE $QUSDC
run cast call $PAIR "token0()(address)"
run cast call $PAIR "token1()(address)"
run cast call $PAIR "getReserves()(uint112,uint112,uint32)"
run cast call $ROUTER "getAmountsOut(uint256,address[])(uint256[])" 1000000000000000000 "[$WQIE,$QUSDC]"
run cast call $RESOLVER "resolve(address)(string)" 0xfde4d4aa9b603b5805cb4ac3390ae3b88b6c0fde
run cast call $RESOLVER "resolve(address)(string)" 0xe54269d36fc6c09de40433c0bc2cd7149fc365da
run cast call $REG_B "userDomain(address)(string)" 0xe54269d36fc6c09de40433c0bc2cd7149fc365da
