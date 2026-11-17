// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Checks that the toolchain is wired correctly: Solidity 0.8.24, OpenZeppelin v5
///         and forge-std resolve and compile with `evm_version = "paris"`.
///         The QartaCheckout tests arrive in Step 2 of docs/09-PLAN.md.
contract ToolchainTest is Test {
    function test_OpenZeppelinV5Resolves() public pure {
        // Math.mulDiv with a rounding mode exists from OpenZeppelin v4.8; Math.Rounding.Ceil is v5 naming.
        assertEq(Math.mulDiv(10, 1e18, 3e18, Math.Rounding.Ceil), 4);
        assertEq(Math.mulDiv(10, 1e18, 3e18, Math.Rounding.Floor), 3);
    }

    /// @dev Prices round up and payouts round down (CLAUDE.md). Shown here with the oracle formula
    ///      from docs/04: 18-decimal QIE × 8-decimal price → 6-decimal USD, rounded down.
    function testFuzz_QieToUsd6RoundsDown(uint96 amountWei, uint64 price8) public pure {
        uint256 usd6 = uint256(amountWei) * uint256(price8) / 1e8 / 1e12;
        // Rounding down never credits more than the exact value.
        assertLe(usd6 * 1e20, uint256(amountWei) * uint256(price8));
    }
}
