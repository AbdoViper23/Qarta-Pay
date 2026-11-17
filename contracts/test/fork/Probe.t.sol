// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

interface IERC20Meta {
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface IRouter {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory);
}

interface IFactory {
    function getPair(address a, address b) external view returns (address);
}

interface IPair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
}

interface IBalance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Fork test: re-checks the facts in docs/probe-results.md against QIE Mainnet.
///         Run with: forge test --match-path "test/fork/*" --fork-url $QIE_MAINNET_RPC
///         Addresses come from the environment, with the documented mainnet values as defaults.
contract ProbeForkTest is Test {
    address internal qusdc;
    address internal wqie;
    address internal feed;
    address internal router;

    function setUp() public {
        qusdc = vm.envOr("QUSDC_ADDRESS", 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5);
        wqie = vm.envOr("WQIE_ADDRESS", 0x0087904D95BEe9E5F24dc8852804b547981A9139);
        feed = vm.envOr("QIE_USD_FEED", 0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17);
        router = vm.envOr("QIEDEX_ROUTER", 0x08cd2e72e156D8563B4351eb4065C262A9f553Ef);
        assertEq(block.chainid, 1990, "run this test on a QIE Mainnet fork");
    }

    function test_QusdcHasSixDecimals() public view {
        assertEq(IERC20Meta(qusdc).decimals(), 6);
        assertEq(IERC20Meta(qusdc).symbol(), "QUSDC");
    }

    function test_FeedHasEightDecimalsAndPositiveAnswer() public view {
        assertEq(IAggregatorV3(feed).decimals(), 8);
        (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(feed).latestRoundData();
        assertGt(answer, 0);
        assertLe(updatedAt, block.timestamp);
    }

    function test_RouterIsUniswapV2Shaped() public view {
        assertEq(IRouter(router).WETH(), wqie);
        address pair = IFactory(IRouter(router).factory()).getPair(wqie, qusdc);
        assertTrue(pair != address(0), "WQIE/QUSDC pair missing");
        assertEq(IPair(pair).token0(), wqie);
        assertEq(IPair(pair).token1(), qusdc);
        (uint112 reserveWqie, uint112 reserveQusdc,) = IPair(pair).getReserves();
        assertGt(reserveWqie, 0);
        assertGt(reserveQusdc, 0);
    }

    function test_SwapExactNativeForQusdc() public {
        address trader = makeAddr("trader");
        vm.deal(trader, 10 ether);
        address[] memory path = new address[](2);
        path[0] = wqie;
        path[1] = qusdc;
        uint256 quoted = IRouter(router).getAmountsOut(10 ether, path)[1];

        vm.prank(trader);
        IRouter(router).swapExactETHForTokens{value: 10 ether}(quoted, path, trader, block.timestamp + 300);

        assertEq(IBalance(qusdc).balanceOf(trader), quoted);
        assertEq(trader.balance, 0);
    }
}
