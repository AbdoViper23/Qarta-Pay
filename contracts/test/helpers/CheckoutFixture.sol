// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {QartaCheckout} from "../../src/QartaCheckout.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../../src/mocks/MockAggregatorV3.sol";

/// @notice Shared setup for QartaCheckout tests: deploys the contract with mocks and offers
///         helpers to build and sign quotes.
abstract contract CheckoutFixture is Test {
    QartaCheckout internal checkout;
    MockERC20 internal qusdc;
    MockAggregatorV3 internal feed;

    address internal owner = makeAddr("owner");
    address internal fulfiller = makeAddr("fulfiller");
    address internal treasury = makeAddr("treasury");
    address internal payer = makeAddr("payer");
    address internal stranger = makeAddr("stranger");
    address internal quoteSigner;
    uint256 internal quoteSignerKey;

    uint32 internal constant MAX_ORACLE_AGE = 86_400;
    uint16 internal constant TOLERANCE_BPS = 1_000;
    uint64 internal constant REFUND_TIMEOUT = 2 hours;
    /// @dev $0.15 per QIE with 8 decimals.
    int256 internal constant QIE_PRICE = 15_000_000;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        (quoteSigner, quoteSignerKey) = makeAddrAndKey("quoteSigner");
        qusdc = new MockERC20("QUSDC", "QUSDC");
        feed = new MockAggregatorV3(8, QIE_PRICE);
        checkout = new QartaCheckout(
            owner,
            quoteSigner,
            fulfiller,
            treasury,
            address(qusdc),
            address(feed),
            MAX_ORACLE_AGE,
            TOLERANCE_BPS,
            true,
            REFUND_TIMEOUT
        );

        qusdc.mint(payer, 1_000e6);
        vm.prank(payer);
        qusdc.approve(address(checkout), type(uint256).max);
        vm.deal(payer, 10_000 ether);
    }

    function _quote(bytes32 orderId, address token, uint256 amount, uint256 usdAmount)
        internal
        view
        returns (QartaCheckout.Quote memory)
    {
        return QartaCheckout.Quote({
            orderId: orderId,
            payer: payer,
            token: token,
            amount: amount,
            usdAmount: usdAmount,
            expiry: uint64(block.timestamp + 600)
        });
    }

    /// @dev 10 QUSDC for a $10 order.
    function _qusdcQuote(bytes32 orderId) internal view returns (QartaCheckout.Quote memory) {
        return _quote(orderId, address(qusdc), 10e6, 10e6);
    }

    /// @dev 100 QIE for a $15 order: exactly the feed price of $0.15.
    function _nativeQuote(bytes32 orderId) internal view returns (QartaCheckout.Quote memory) {
        return _quote(orderId, address(0), 100 ether, 15e6);
    }

    function _sign(QartaCheckout.Quote memory q) internal view returns (bytes memory) {
        return _signWith(quoteSignerKey, q);
    }

    function _signWith(uint256 key, QartaCheckout.Quote memory q) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, checkout.hashQuote(q));
        return abi.encodePacked(r, s, v);
    }

    function _pay(QartaCheckout.Quote memory q) internal {
        bytes memory sig = _sign(q);
        uint256 value = q.token == address(0) ? q.amount : 0;
        vm.prank(q.payer);
        checkout.pay{value: value}(q, sig);
    }

    function _status(bytes32 orderId) internal view returns (QartaCheckout.Status status) {
        (,,,, status) = checkout.orders(orderId);
    }
}
