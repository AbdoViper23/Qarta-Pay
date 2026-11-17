// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ForkBase} from "./ForkBase.sol";
import {QartaCheckout} from "../../src/QartaCheckout.sol";

interface IForkToken {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}

/// @notice QartaCheckout against the real QUSDC token and the real QIE/USD feed.
contract QartaCheckoutForkTest is ForkBase {
    QartaCheckout internal checkout;
    address internal fulfiller = makeAddr("fulfiller");
    address internal treasury = makeAddr("treasury");
    address internal payer = makeAddr("payer");
    address internal signer;
    uint256 internal signerKey;

    function setUp() public override {
        super.setUp();
        (signer, signerKey) = makeAddrAndKey("quoteSigner");
        checkout = new QartaCheckout(
            address(this),
            signer,
            fulfiller,
            treasury,
            qusdc,
            feed,
            uint32(MAX_ORACLE_AGE),
            1_000,
            true,
            2 hours
        );
        deal(qusdc, payer, 100e6);
        vm.deal(payer, 10_000 ether);
        vm.prank(payer);
        IForkToken(qusdc).approve(address(checkout), type(uint256).max);
    }

    function _signed(bytes32 id, address token, uint256 amount, uint256 usdAmount)
        internal
        view
        returns (QartaCheckout.Quote memory q, bytes memory sig)
    {
        q = QartaCheckout.Quote(id, payer, token, amount, usdAmount, uint64(block.timestamp + 600));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, checkout.hashQuote(q));
        sig = abi.encodePacked(r, s, v);
    }

    function test_FeedDecimalsReadAtDeploy() public view {
        assertEq(checkout.oracleDecimals(), 8);
    }

    function test_PayAndSettleWithRealQusdc() public {
        (QartaCheckout.Quote memory q, bytes memory sig) = _signed(keccak256("a"), qusdc, 10e6, 10e6);
        vm.prank(payer);
        checkout.pay(q, sig);
        assertEq(IForkToken(qusdc).balanceOf(address(checkout)), 10e6);

        vm.prank(fulfiller);
        checkout.settle(q.orderId);
        assertEq(IForkToken(qusdc).balanceOf(treasury), 10e6);
    }

    function test_PayAndRefundWithRealQusdc() public {
        (QartaCheckout.Quote memory q, bytes memory sig) = _signed(keccak256("b"), qusdc, 10e6, 10e6);
        vm.prank(payer);
        checkout.pay(q, sig);
        vm.prank(fulfiller);
        checkout.refund(q.orderId);
        assertEq(IForkToken(qusdc).balanceOf(payer), 100e6);
    }

    function test_GuardAcceptsCorrectlyPricedNativeQuote() public {
        uint256 usdAmount = 10e6; // $10
        uint256 amountWei = usdAmount * 1e18 / _oraclePriceUsd6() + 1; // exact QIE at the feed price, rounded up
        (QartaCheckout.Quote memory q, bytes memory sig) =
            _signed(keccak256("c"), address(0), amountWei, usdAmount);
        vm.prank(payer);
        checkout.pay{value: amountWei}(q, sig);
        assertEq(address(checkout).balance, amountWei);
    }

    function test_GuardRejectsUnderpricedNativeQuote() public {
        uint256 usdAmount = 10e6;
        // 20% fewer QIE than the feed price requires; tolerance is 10%.
        uint256 amountWei = usdAmount * 1e18 / _oraclePriceUsd6() * 80 / 100;
        (QartaCheckout.Quote memory q, bytes memory sig) =
            _signed(keccak256("d"), address(0), amountWei, usdAmount);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.PriceBelowOracle.selector);
        checkout.pay{value: amountWei}(q, sig);
    }
}
