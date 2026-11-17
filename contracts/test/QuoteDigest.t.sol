// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {QartaCheckout} from "../src/QartaCheckout.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @notice Fixed EIP-712 test vector for the Quote type. The same vector is asserted in
///         packages/shared/src/eip712.test.ts, so the backend signer and the contract cannot drift.
contract QuoteDigestTest is Test {
    address internal constant VERIFYING_CONTRACT = 0x00000000000000000000000000000000000ca47a;
    bytes32 internal constant EXPECTED_DIGEST =
        0x2d07dea94dd99a1ef9a08c4e4150596f24b182f99648110b078b164556cd1cf1;

    function test_QuoteDigestMatchesSharedVector() public {
        vm.chainId(1990);
        MockERC20 token = new MockERC20("QUSDC", "QUSDC");
        deployCodeTo(
            "QartaCheckout.sol:QartaCheckout",
            abi.encode(
                address(1),
                address(2),
                address(3),
                address(4),
                address(token),
                address(0),
                uint32(0),
                uint16(0),
                false,
                uint64(2 hours)
            ),
            VERIFYING_CONTRACT
        );
        QartaCheckout checkout = QartaCheckout(payable(VERIFYING_CONTRACT));

        QartaCheckout.Quote memory q = QartaCheckout.Quote({
            orderId: 0x1111111111111111111111111111111111111111111111111111111111111111,
            payer: 0x2222222222222222222222222222222222222222,
            token: 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5,
            amount: 10_000_000,
            usdAmount: 10_000_000,
            expiry: 1_800_000_000
        });
        emit log_named_bytes32("digest", checkout.hashQuote(q));
        assertEq(checkout.hashQuote(q), EXPECTED_DIGEST);
    }
}
