// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Test stand-in for the QIEDex router (Uniswap V2 Router02 shape). It swaps native coin
///         for a token it holds, at a fixed price set by the test. For anvil and testnet only.
contract MockRouter {
    address public immutable WETH;
    IERC20 public immutable tokenOut;
    /// @notice Token base units paid per 1e18 wei of native coin, as quoted by `getAmountsOut`.
    uint256 public quotedRate;
    /// @notice Rate actually used by the swap. Differs from `quotedRate` to simulate a price move.
    uint256 public executedRate;

    address public lastRecipient;

    constructor(address weth_, IERC20 tokenOut_, uint256 rate) {
        WETH = weth_;
        tokenOut = tokenOut_;
        quotedRate = rate;
        executedRate = rate;
    }

    function setRates(uint256 quotedRate_, uint256 executedRate_) external {
        quotedRate = quotedRate_;
        executedRate = executedRate_;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        _checkPath(path);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn * quotedRate / 1e18;
    }

    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts)
    {
        _checkPath(path);
        require(block.timestamp <= deadline, "MockRouter: EXPIRED");
        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = msg.value * executedRate / 1e18;
        require(amounts[1] >= amountOutMin, "MockRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        lastRecipient = to;
        require(tokenOut.transfer(to, amounts[1]), "MockRouter: transfer failed");
    }

    function _checkPath(address[] calldata path) private view {
        require(path.length == 2 && path[0] == WETH && path[1] == address(tokenOut), "MockRouter: bad path");
    }
}
