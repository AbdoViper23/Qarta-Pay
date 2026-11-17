// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ForkBase, IForkFeed} from "./ForkBase.sol";

interface IERC20Meta {
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

interface IRouter {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory);
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
contract ProbeForkTest is ForkBase {
    function test_QusdcHasSixDecimals() public view {
        assertEq(IERC20Meta(qusdc).decimals(), 6);
        assertEq(IERC20Meta(qusdc).symbol(), "QUSDC");
    }

    function test_FeedHasEightDecimalsAndPositiveAnswer() public view {
        assertEq(IForkFeed(feed).decimals(), 8);
        (, int256 answer,, uint256 updatedAt,) = IForkFeed(feed).latestRoundData();
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
