// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

interface IForkFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice Shared setup for QIE Mainnet fork tests.
///         Run with: pnpm --filter contracts test:fork   (pins block FORK_BLOCK, default 11961896)
///         Addresses come from the environment, with the documented mainnet values as defaults.
abstract contract ForkBase is Test {
    address internal qusdc;
    address internal wqie;
    address internal feed;
    address internal router;

    uint256 internal constant MAX_ORACLE_AGE = 86_400;

    function setUp() public virtual {
        assertEq(block.chainid, 1990, "run this test on a QIE Mainnet fork");
        qusdc = vm.envOr("QUSDC_ADDRESS", 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5);
        wqie = vm.envOr("WQIE_ADDRESS", 0x0087904D95BEe9E5F24dc8852804b547981A9139);
        feed = vm.envOr("QIE_USD_FEED", 0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17);
        router = vm.envOr("QIEDEX_ROUTER", 0x08cd2e72e156D8563B4351eb4065C262A9f553Ef);

        // The feed has no heartbeat and can be older than a day at the fork block. Keep the tests
        // about our logic, not about the feed's schedule: move time to just after its last update.
        (,,, uint256 updatedAt,) = IForkFeed(feed).latestRoundData();
        if (block.timestamp - updatedAt > MAX_ORACLE_AGE) vm.warp(updatedAt + 60);
    }

    /// @dev Feed price as 6-decimal USD per 1 QIE.
    function _oraclePriceUsd6() internal view returns (uint256) {
        (, int256 answer,,,) = IForkFeed(feed).latestRoundData();
        return uint256(answer) * 1e6 / (10 ** IForkFeed(feed).decimals());
    }
}
