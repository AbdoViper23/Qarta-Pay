// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";

interface ISweepFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface ISweepRouter {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory);
}

interface ISweepToken {
    function balanceOf(address account) external view returns (uint256);
}

/// @title SweepTreasury
/// @notice Converts native QIE held by the treasury into QUSDC on QIEDex (docs/04-SMART-CONTRACTS.md).
///
/// The minimum accepted output is derived from the QIE/USD oracle, never from the pool's own
/// quote, so a skewed pool cannot set its own floor. Every check runs before anything is sent.
/// The swap goes from the treasury to the treasury and never touches QartaCheckout.
///
/// Simulation (agent may run this, nothing is broadcast):
///   forge script script/SweepTreasury.s.sol --fork-url $QIE_MAINNET_RPC --sender $TREASURY_ADDRESS -vvvv
/// Mainnet (human only, after reading the simulation):
///   forge script script/SweepTreasury.s.sol --rpc-url $QIE_MAINNET_RPC --account qarta-treasury \
///     --sender $TREASURY_ADDRESS --broadcast
contract SweepTreasury is Script {
    struct Params {
        address treasury;
        address router;
        address wqie;
        address qusdc;
        address feed;
        uint256 amountWei;
        uint256 maxSlippageBps;
        uint256 gasReserveWei;
        uint256 maxOracleAge;
    }

    struct Plan {
        uint256 oracleOut; // QUSDC the amount is worth at the oracle price (6 decimals, rounded down)
        uint256 minOut; // oracleOut minus the allowed slippage
        uint256 routerOut; // what the router quotes for the amount right now
    }

    uint256 internal constant BPS = 10_000;
    uint256 internal constant DEADLINE_SECONDS = 300;

    error SweepZeroAddress();
    error SweepZeroAmount();
    error SweepSlippageTooHigh(uint256 maxSlippageBps);
    error SweepWrongSender(address sender, address treasury);
    error SweepGasReserve(uint256 balance, uint256 amount, uint256 gasReserve);
    error SweepOracleBadAnswer(int256 answer);
    error SweepOracleStale(uint256 updatedAt, uint256 nowTs, uint256 maxAge);
    error SweepPoolOffPrice(uint256 routerOut, uint256 minOut);
    error SweepReceivedTooLittle(uint256 received, uint256 minOut);

    /// @notice Entry point for `forge script`. Reads the parameters from the environment.
    function run() external {
        Params memory p = Params({
            treasury: vm.envAddress("TREASURY_ADDRESS"),
            router: vm.envAddress("QIEDEX_ROUTER"),
            wqie: vm.envAddress("WQIE_ADDRESS"),
            qusdc: vm.envAddress("QUSDC_ADDRESS"),
            feed: vm.envAddress("QIE_USD_FEED"),
            amountWei: vm.envUint("SWEEP_AMOUNT_WEI"),
            maxSlippageBps: vm.envOr("SWEEP_MAX_SLIPPAGE_BPS", uint256(700)),
            gasReserveWei: vm.envUint("SWEEP_GAS_RESERVE_WEI"),
            maxOracleAge: vm.envOr("SWEEP_MAX_ORACLE_AGE_S", uint256(86_400))
        });
        // `--sender` must be the treasury, so the swap is paid by it and nobody else.
        if (msg.sender != p.treasury) revert SweepWrongSender(msg.sender, p.treasury);
        sweep(p);
    }

    /// @notice Runs every check, then swaps `amountWei` QIE for QUSDC from and to the treasury.
    /// @param p the sweep parameters
    /// @return received QUSDC received by the treasury (6 decimals)
    function sweep(Params memory p) public returns (uint256 received) {
        Plan memory plan_ = plan(p);
        console2.log("QIE in (wei)       ", p.amountWei);
        console2.log("oracle value QUSDC ", plan_.oracleOut);
        console2.log("min out QUSDC      ", plan_.minOut);
        console2.log("router quote QUSDC ", plan_.routerOut);

        uint256 qieBefore = p.treasury.balance;
        uint256 qusdcBefore = ISweepToken(p.qusdc).balanceOf(p.treasury);

        vm.startBroadcast(p.treasury);
        ISweepRouter(p.router).swapExactETHForTokens{value: p.amountWei}(
            plan_.minOut, _path(p), p.treasury, block.timestamp + DEADLINE_SECONDS
        );
        vm.stopBroadcast();

        received = ISweepToken(p.qusdc).balanceOf(p.treasury) - qusdcBefore;
        if (received < plan_.minOut) revert SweepReceivedTooLittle(received, plan_.minOut);

        console2.log("treasury QIE before", qieBefore);
        console2.log("treasury QIE after ", p.treasury.balance);
        console2.log("QUSDC received     ", received);
    }

    /// @notice Every check of the sweep, without sending anything. Reverts with the reason to abort.
    /// @param p the sweep parameters
    /// @return plan_ the oracle value, the minimum output and the router's current quote
    function plan(Params memory p) public view returns (Plan memory plan_) {
        if (
            p.treasury == address(0) || p.router == address(0) || p.wqie == address(0)
                || p.qusdc == address(0) || p.feed == address(0)
        ) revert SweepZeroAddress();
        if (p.amountWei == 0) revert SweepZeroAmount();
        if (p.maxSlippageBps >= BPS) revert SweepSlippageTooHigh(p.maxSlippageBps);

        uint256 balance = p.treasury.balance;
        if (balance < p.amountWei || balance - p.amountWei < p.gasReserveWei) {
            revert SweepGasReserve(balance, p.amountWei, p.gasReserveWei);
        }

        (, int256 answer,, uint256 updatedAt,) = ISweepFeed(p.feed).latestRoundData();
        if (answer <= 0) revert SweepOracleBadAnswer(answer);
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > p.maxOracleAge) {
            revert SweepOracleStale(updatedAt, block.timestamp, p.maxOracleAge);
        }

        // 18-decimal QIE x feed price -> 6-decimal QUSDC, rounded down.
        plan_.oracleOut = p.amountWei * uint256(answer) / (10 ** ISweepFeed(p.feed).decimals()) / 1e12;
        plan_.minOut = plan_.oracleOut * (BPS - p.maxSlippageBps) / BPS;
        plan_.routerOut = ISweepRouter(p.router).getAmountsOut(p.amountWei, _path(p))[1];
        if (plan_.minOut == 0 || plan_.routerOut < plan_.minOut) {
            // "Pool is off-price: use a smaller chunk or wait."
            revert SweepPoolOffPrice(plan_.routerOut, plan_.minOut);
        }
    }

    function _path(Params memory p) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = p.wqie;
        path[1] = p.qusdc;
    }
}
