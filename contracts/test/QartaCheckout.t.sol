// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {QartaCheckout} from "../src/QartaCheckout.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";
import {CheckoutFixture} from "./helpers/CheckoutFixture.sol";
import {ReentrantPayer, RejectingPayer, FeeOnTransferToken} from "./helpers/Attackers.sol";

contract QartaCheckoutTest is CheckoutFixture {
    bytes32 internal constant ORDER = keccak256("order-1");

    event OrderPaid(
        bytes32 indexed orderId,
        address indexed payer,
        address indexed token,
        uint256 amount,
        uint256 usdAmount
    );
    event OrderSettled(bytes32 indexed orderId);
    event OrderRefunded(bytes32 indexed orderId, address indexed to, uint256 amount, bool byPayer);

    // ------------------------------------------------------------ pay: happy

    function test_PayQusdc() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        bytes memory sig = _sign(q);

        vm.expectEmit(address(checkout));
        emit OrderPaid(ORDER, payer, address(qusdc), 10e6, 10e6);
        vm.prank(payer);
        checkout.pay(q, sig);

        (address p, address token, uint256 amount, uint64 paidAt, QartaCheckout.Status status) =
            checkout.orders(ORDER);
        assertEq(p, payer);
        assertEq(token, address(qusdc));
        assertEq(amount, 10e6);
        assertEq(paidAt, block.timestamp);
        assertEq(uint8(status), uint8(QartaCheckout.Status.Paid));
        assertEq(qusdc.balanceOf(address(checkout)), 10e6);
        assertEq(qusdc.balanceOf(payer), 990e6);
        assertEq(checkout.totalEscrowed(address(qusdc)), 10e6);
    }

    function test_PayNative() public {
        QartaCheckout.Quote memory q = _nativeQuote(ORDER);
        bytes memory sig = _sign(q);

        vm.expectEmit(address(checkout));
        emit OrderPaid(ORDER, payer, address(0), 100 ether, 15e6);
        vm.prank(payer);
        checkout.pay{value: 100 ether}(q, sig);

        assertEq(address(checkout).balance, 100 ether);
        assertEq(checkout.totalEscrowed(address(0)), 100 ether);
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Paid));
    }

    // ---------------------------------------------------------- pay: rejects

    function test_RevertWhen_WrongSigner() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        (, uint256 otherKey) = makeAddrAndKey("not-the-signer");
        bytes memory sig = _signWith(otherKey, q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.InvalidSignature.selector);
        checkout.pay(q, sig);
    }

    function test_RevertWhen_SignatureIsGarbage() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.InvalidSignature.selector);
        checkout.pay(q, hex"1234");
    }

    function test_RevertWhen_QuoteFieldChangedAfterSigning() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        bytes memory sig = _sign(q);
        q.amount = 1e6; // pay less than what was signed
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.InvalidSignature.selector);
        checkout.pay(q, sig);
    }

    function test_RevertWhen_QuoteExpired() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        bytes memory sig = _sign(q);
        vm.warp(q.expiry + 1);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.QuoteExpired.selector);
        checkout.pay(q, sig);
    }

    function test_PayAtExactExpirySecond() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        bytes memory sig = _sign(q);
        vm.warp(q.expiry);
        vm.prank(payer);
        checkout.pay(q, sig);
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Paid));
    }

    function test_RevertWhen_OrderIdReplayed() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        _pay(q);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.OrderAlreadyExists.selector);
        checkout.pay(q, sig);
    }

    function test_RevertWhen_OrderIdReusedAfterSettleOrRefund() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        _pay(q);
        vm.prank(fulfiller);
        checkout.refund(ORDER);

        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.OrderAlreadyExists.selector);
        checkout.pay(q, sig);
    }

    function test_RevertWhen_PayerIsNotSender() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        bytes memory sig = _sign(q);
        vm.prank(stranger);
        vm.expectRevert(QartaCheckout.WrongPayer.selector);
        checkout.pay(q, sig);
    }

    function test_RevertWhen_TokenNotAllowed() public {
        MockERC20 other = new MockERC20("Other", "OTH");
        other.mint(payer, 100e6);
        vm.prank(payer);
        other.approve(address(checkout), type(uint256).max);

        QartaCheckout.Quote memory q = _quote(ORDER, address(other), 10e6, 10e6);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.TokenNotAllowed.selector);
        checkout.pay(q, sig);
    }

    function test_RevertWhen_NativeValueMismatch() public {
        QartaCheckout.Quote memory q = _nativeQuote(ORDER);
        bytes memory sig = _sign(q);
        vm.startPrank(payer);
        vm.expectRevert(QartaCheckout.WrongValue.selector);
        checkout.pay{value: 100 ether - 1}(q, sig);
        vm.expectRevert(QartaCheckout.WrongValue.selector);
        checkout.pay{value: 100 ether + 1}(q, sig);
        vm.expectRevert(QartaCheckout.WrongValue.selector);
        checkout.pay{value: 0}(q, sig);
        vm.stopPrank();
    }

    function test_RevertWhen_ValueSentWithErc20Quote() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.WrongValue.selector);
        checkout.pay{value: 1}(q, sig);
    }

    function test_RevertWhen_AmountIsZero() public {
        QartaCheckout.Quote memory q = _quote(ORDER, address(qusdc), 0, 0);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.ZeroAmount.selector);
        checkout.pay(q, sig);
    }

    function test_RevertWhen_AllowanceMissing() public {
        vm.prank(payer);
        qusdc.approve(address(checkout), 0);
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert();
        checkout.pay(q, sig);
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.None));
        assertEq(checkout.totalEscrowed(address(qusdc)), 0);
    }

    function test_RevertWhen_TokenTakesFeeOnTransfer() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        fee.mint(payer, 100e18);
        vm.prank(owner);
        checkout.setAllowedToken(address(fee), true);
        vm.prank(payer);
        fee.approve(address(checkout), type(uint256).max);

        QartaCheckout.Quote memory q = _quote(ORDER, address(fee), 10e18, 10e6);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.WrongAmountReceived.selector);
        checkout.pay(q, sig);
        assertEq(checkout.totalEscrowed(address(fee)), 0);
    }

    // ------------------------------------------------- signature replay scope

    function test_RevertWhen_SignatureFromOtherChain() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        bytes memory sig = _sign(q); // signed for the current chain id
        vm.chainId(block.chainid + 1);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.InvalidSignature.selector);
        checkout.pay(q, sig);
    }

    function test_RevertWhen_SignatureFromOtherContract() public {
        QartaCheckout other = new QartaCheckout(
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
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(quoteSignerKey, other.hashQuote(q));
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.InvalidSignature.selector);
        checkout.pay(q, abi.encodePacked(r, s, v));
    }

    function test_RevertWhen_SignatureIsMalleatedHighS() public {
        QartaCheckout.Quote memory q = _qusdcQuote(ORDER);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(quoteSignerKey, checkout.hashQuote(q));
        // The mirrored signature (n - s, flipped v) recovers the same key in raw ecrecover.
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory malleated = abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.InvalidSignature.selector);
        checkout.pay(q, malleated);
    }

    // ------------------------------------------------------------------ settle

    function test_SettleSendsQusdcToTreasury() public {
        _pay(_qusdcQuote(ORDER));
        vm.expectEmit(address(checkout));
        emit OrderSettled(ORDER);
        vm.prank(fulfiller);
        checkout.settle(ORDER);

        assertEq(qusdc.balanceOf(treasury), 10e6);
        assertEq(qusdc.balanceOf(address(checkout)), 0);
        assertEq(checkout.totalEscrowed(address(qusdc)), 0);
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Settled));
    }

    function test_SettleSendsNativeToTreasury() public {
        _pay(_nativeQuote(ORDER));
        vm.prank(fulfiller);
        checkout.settle(ORDER);
        assertEq(treasury.balance, 100 ether);
        assertEq(address(checkout).balance, 0);
        assertEq(checkout.totalEscrowed(address(0)), 0);
    }

    function test_RevertWhen_SettleByNonFulfiller() public {
        _pay(_qusdcQuote(ORDER));
        address[3] memory callers = [stranger, owner, payer];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.prank(callers[i]);
            vm.expectRevert(QartaCheckout.NotFulfiller.selector);
            checkout.settle(ORDER);
        }
    }

    function test_RevertWhen_SettleNotPaid() public {
        vm.startPrank(fulfiller);
        vm.expectRevert(QartaCheckout.OrderNotPaid.selector);
        checkout.settle(ORDER); // never paid
        vm.stopPrank();

        _pay(_qusdcQuote(ORDER));
        vm.startPrank(fulfiller);
        checkout.settle(ORDER);
        vm.expectRevert(QartaCheckout.OrderNotPaid.selector);
        checkout.settle(ORDER); // already settled
        vm.expectRevert(QartaCheckout.OrderNotPaid.selector);
        checkout.refund(ORDER); // cannot refund a settled order
        vm.stopPrank();
        assertEq(qusdc.balanceOf(treasury), 10e6);
    }

    // ------------------------------------------------------------------ refund

    function test_RefundSendsQusdcToPayer() public {
        _pay(_qusdcQuote(ORDER));
        vm.expectEmit(address(checkout));
        emit OrderRefunded(ORDER, payer, 10e6, false);
        vm.prank(fulfiller);
        checkout.refund(ORDER);

        assertEq(qusdc.balanceOf(payer), 1_000e6);
        assertEq(qusdc.balanceOf(treasury), 0);
        assertEq(checkout.totalEscrowed(address(qusdc)), 0);
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Refunded));
    }

    function test_RefundSendsNativeToPayer() public {
        _pay(_nativeQuote(ORDER));
        vm.prank(fulfiller);
        checkout.refund(ORDER);
        assertEq(payer.balance, 10_000 ether);
        assertEq(address(checkout).balance, 0);
    }

    function test_RevertWhen_RefundByNonFulfiller() public {
        _pay(_qusdcQuote(ORDER));
        vm.prank(stranger);
        vm.expectRevert(QartaCheckout.NotFulfiller.selector);
        checkout.refund(ORDER);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.NotFulfiller.selector);
        checkout.refund(ORDER);
    }

    function test_RevertWhen_RefundNotPaid() public {
        vm.prank(fulfiller);
        vm.expectRevert(QartaCheckout.OrderNotPaid.selector);
        checkout.refund(ORDER);

        _pay(_qusdcQuote(ORDER));
        vm.startPrank(fulfiller);
        checkout.refund(ORDER);
        vm.expectRevert(QartaCheckout.OrderNotPaid.selector);
        checkout.refund(ORDER); // no double refund
        vm.expectRevert(QartaCheckout.OrderNotPaid.selector);
        checkout.settle(ORDER); // cannot settle a refunded order
        vm.stopPrank();
        assertEq(qusdc.balanceOf(payer), 1_000e6);
    }

    // ------------------------------------------------------------ claimRefund

    function test_RevertWhen_ClaimBeforeTimeout() public {
        _pay(_qusdcQuote(ORDER));
        vm.warp(block.timestamp + REFUND_TIMEOUT - 1);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.RefundTimeoutNotReached.selector);
        checkout.claimRefund(ORDER);
    }

    function test_ClaimAtTimeout() public {
        _pay(_qusdcQuote(ORDER));
        vm.warp(block.timestamp + REFUND_TIMEOUT);
        vm.expectEmit(address(checkout));
        emit OrderRefunded(ORDER, payer, 10e6, true);
        vm.prank(payer);
        checkout.claimRefund(ORDER);
        assertEq(qusdc.balanceOf(payer), 1_000e6);
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Refunded));
    }

    function test_ClaimNativeAfterTimeout() public {
        _pay(_nativeQuote(ORDER));
        vm.warp(block.timestamp + REFUND_TIMEOUT + 1 days);
        vm.prank(payer);
        checkout.claimRefund(ORDER);
        assertEq(payer.balance, 10_000 ether);
    }

    function test_RevertWhen_ClaimByNonPayer() public {
        _pay(_qusdcQuote(ORDER));
        vm.warp(block.timestamp + REFUND_TIMEOUT);
        address[3] memory callers = [stranger, fulfiller, owner];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.prank(callers[i]);
            vm.expectRevert(QartaCheckout.NotPayer.selector);
            checkout.claimRefund(ORDER);
        }
    }

    function test_RevertWhen_ClaimAfterSettle() public {
        _pay(_qusdcQuote(ORDER));
        vm.prank(fulfiller);
        checkout.settle(ORDER);
        vm.warp(block.timestamp + REFUND_TIMEOUT);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.OrderNotPaid.selector);
        checkout.claimRefund(ORDER);
        assertEq(qusdc.balanceOf(treasury), 10e6);
    }

    function test_RevertWhen_ClaimTwice() public {
        _pay(_qusdcQuote(ORDER));
        vm.warp(block.timestamp + REFUND_TIMEOUT);
        vm.startPrank(payer);
        checkout.claimRefund(ORDER);
        vm.expectRevert(QartaCheckout.OrderNotPaid.selector);
        checkout.claimRefund(ORDER);
        vm.stopPrank();
    }

    function test_RevertWhen_SettleAfterClaim() public {
        _pay(_qusdcQuote(ORDER));
        vm.warp(block.timestamp + REFUND_TIMEOUT);
        vm.prank(payer);
        checkout.claimRefund(ORDER);
        vm.prank(fulfiller);
        vm.expectRevert(QartaCheckout.OrderNotPaid.selector);
        checkout.settle(ORDER);
    }

    // ------------------------------------------------------------------ pause

    function test_PauseBlocksPayOnly() public {
        bytes32 second = keccak256("order-2");
        bytes32 third = keccak256("order-3");
        _pay(_qusdcQuote(ORDER));
        _pay(_qusdcQuote(second));
        _pay(_nativeQuote(third));

        vm.prank(owner);
        checkout.pause();

        QartaCheckout.Quote memory q = _qusdcQuote(keccak256("order-4"));
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        checkout.pay(q, sig);

        // Money can always leave while paused.
        vm.startPrank(fulfiller);
        checkout.settle(ORDER);
        checkout.refund(second);
        vm.stopPrank();
        vm.warp(block.timestamp + REFUND_TIMEOUT);
        vm.prank(payer);
        checkout.claimRefund(third);

        assertEq(qusdc.balanceOf(address(checkout)), 0);
        assertEq(address(checkout).balance, 0);

        vm.prank(owner);
        checkout.unpause();
        q.expiry = uint64(block.timestamp + 600);
        _pay(q);
    }

    function test_RevertWhen_PauseByNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        checkout.pause();
    }

    // -------------------------------------------------------------- reentrancy

    function test_ReentrantFulfillerRefundCannotDrain() public {
        ReentrantPayer attacker = new ReentrantPayer(checkout);
        _pay(_nativeQuote(keccak256("honest"))); // other funds the attacker could try to drain

        QartaCheckout.Quote memory q = _nativeQuote(ORDER);
        q.payer = address(attacker);
        bytes memory sig = _sign(q);
        vm.deal(address(this), 100 ether);
        attacker.pay{value: 100 ether}(q, sig);

        // The attacker re-enters claimRefund while receiving the fulfiller's refund.
        vm.warp(block.timestamp + REFUND_TIMEOUT);
        vm.prank(fulfiller);
        checkout.refund(ORDER);

        assertTrue(attacker.reentryAttempted());
        assertFalse(attacker.reentrySucceeded());
        assertEq(address(attacker).balance, 100 ether);
        assertEq(address(checkout).balance, 100 ether);
    }

    function test_ReentrantClaimCannotDrain() public {
        ReentrantPayer attacker = new ReentrantPayer(checkout);
        _pay(_nativeQuote(keccak256("honest")));

        QartaCheckout.Quote memory q = _nativeQuote(ORDER);
        q.payer = address(attacker);
        bytes memory sig = _sign(q);
        vm.deal(address(this), 100 ether);
        attacker.pay{value: 100 ether}(q, sig);

        vm.warp(block.timestamp + REFUND_TIMEOUT);
        attacker.claim();

        assertTrue(attacker.reentryAttempted());
        assertFalse(attacker.reentrySucceeded());
        assertEq(address(attacker).balance, 100 ether); // exactly one refund
        assertEq(address(checkout).balance, 100 ether); // the honest order is intact
        assertEq(checkout.totalEscrowed(address(0)), 100 ether);
    }

    function test_RefundToPayerThatRejectsNativeReverts() public {
        RejectingPayer rejecting = new RejectingPayer();
        QartaCheckout.Quote memory q = _nativeQuote(ORDER);
        q.payer = address(rejecting);
        bytes memory sig = _sign(q);
        vm.deal(address(this), 100 ether);
        rejecting.pay{value: 100 ether}(checkout, q, sig);

        vm.prank(fulfiller);
        vm.expectRevert(QartaCheckout.TransferFailed.selector);
        checkout.refund(ORDER);
        // The order stays Paid and can still be settled; nothing is lost.
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Paid));
        assertEq(checkout.totalEscrowed(address(0)), 100 ether);
    }

    // ------------------------------------------------------------ oracle guard

    function test_RevertWhen_OracleStale() public {
        feed.setUpdatedAt(block.timestamp - MAX_ORACLE_AGE - 1);
        QartaCheckout.Quote memory q = _nativeQuote(ORDER);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.OracleStale.selector);
        checkout.pay{value: 100 ether}(q, sig);
    }

    function test_PayNativeWhenFeedIsExactlyMaxAge() public {
        feed.setUpdatedAt(block.timestamp - MAX_ORACLE_AGE);
        _pay(_nativeQuote(ORDER));
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Paid));
    }

    function test_RevertWhen_OracleTimestampInFuture() public {
        feed.setUpdatedAt(block.timestamp + 1);
        QartaCheckout.Quote memory q = _nativeQuote(ORDER);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.OracleStale.selector);
        checkout.pay{value: 100 ether}(q, sig);
    }

    function test_RevertWhen_OracleAnswerZeroOrNegative() public {
        QartaCheckout.Quote memory q = _nativeQuote(ORDER);
        bytes memory sig = _sign(q);
        int256[2] memory bad = [int256(0), int256(-1)];
        for (uint256 i = 0; i < bad.length; i++) {
            feed.setAnswer(bad[i]);
            vm.prank(payer);
            vm.expectRevert(QartaCheckout.OracleBadAnswer.selector);
            checkout.pay{value: 100 ether}(q, sig);
        }
    }

    function test_RevertWhen_NativeQuoteUnderpriced() public {
        // 100 QIE at $0.15 is worth $15. A quote that sells a $20 order for it is 25% too cheap.
        QartaCheckout.Quote memory q = _quote(ORDER, address(0), 100 ether, 20e6);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.PriceBelowOracle.selector);
        checkout.pay{value: 100 ether}(q, sig);
    }

    function test_NativeQuoteExactlyAtToleranceEdge() public {
        // Tolerance is 10%. 90 QIE at $0.15 = $13.50 = exactly 90% of a $15 order: accepted.
        _pay(_quote(ORDER, address(0), 90 ether, 15e6));
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Paid));
    }

    function test_RevertWhen_NativeQuoteJustBelowToleranceEdge() public {
        // One micro-dollar short of the edge: 89.99999 QIE is worth $13.499998 (rounded down).
        QartaCheckout.Quote memory q = _quote(ORDER, address(0), 89.99999 ether, 15e6);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.PriceBelowOracle.selector);
        checkout.pay{value: 89.99999 ether}(q, sig);
    }

    function test_OverpayingNativeQuoteIsAccepted() public {
        // The guard is a floor: paying more QIE than the feed price needs is fine.
        _pay(_quote(ORDER, address(0), 200 ether, 15e6));
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Paid));
    }

    function test_GuardDisabledDoesNotReadFeed() public {
        vm.prank(owner);
        checkout.setOracleGuardEnabled(false);
        feed.setShouldRevert(true); // any read would revert

        _pay(_quote(ORDER, address(0), 100 ether, 20e6)); // under-priced, but the guard is off
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Paid));
    }

    function test_RevertWhen_FeedRevertsAndGuardEnabled() public {
        feed.setShouldRevert(true);
        QartaCheckout.Quote memory q = _nativeQuote(ORDER);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert("MockAggregatorV3: down");
        checkout.pay{value: 100 ether}(q, sig);
    }

    function test_QusdcPaymentIgnoresBrokenFeed() public {
        feed.setShouldRevert(true);
        _pay(_qusdcQuote(ORDER));
        assertEq(uint8(_status(ORDER)), uint8(QartaCheckout.Status.Paid));
    }

    function test_RefundsWorkWhenFeedReverts() public {
        bytes32 second = keccak256("order-2");
        bytes32 third = keccak256("order-3");
        _pay(_nativeQuote(ORDER));
        _pay(_nativeQuote(second));
        _pay(_nativeQuote(third));
        feed.setShouldRevert(true);

        vm.startPrank(fulfiller);
        checkout.refund(ORDER);
        checkout.settle(second);
        vm.stopPrank();
        vm.warp(block.timestamp + REFUND_TIMEOUT);
        vm.prank(payer);
        checkout.claimRefund(third);
        assertEq(address(checkout).balance, 0);
    }

    function test_OracleSettersOnlyOwner() public {
        bytes memory unauthorized =
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger);
        vm.startPrank(stranger);
        vm.expectRevert(unauthorized);
        checkout.setOracle(address(feed));
        vm.expectRevert(unauthorized);
        checkout.setOracleParams(1, 1);
        vm.expectRevert(unauthorized);
        checkout.setOracleGuardEnabled(false);
        vm.stopPrank();
    }

    function test_OwnerCanRetuneOracle() public {
        MockAggregatorV3 feed18 = new MockAggregatorV3(18, 0.15e18);
        vm.startPrank(owner);
        checkout.setOracle(address(feed18));
        checkout.setOracleParams(3_600, 200);
        vm.stopPrank();
        assertEq(checkout.oracle(), address(feed18));
        assertEq(checkout.oracleDecimals(), 18);
        assertEq(checkout.maxOracleAge(), 3_600);
        assertEq(checkout.oracleToleranceBps(), 200);

        // The price maths follows the new feed's decimals.
        _pay(_nativeQuote(ORDER));
        QartaCheckout.Quote memory cheap = _quote(keccak256("cheap"), address(0), 97 ether, 15e6);
        bytes memory sig = _sign(cheap);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.PriceBelowOracle.selector);
        checkout.pay{value: 97 ether}(cheap, sig);
    }

    function test_RevertWhen_ToleranceTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(QartaCheckout.InvalidTolerance.selector);
        checkout.setOracleParams(MAX_ORACLE_AGE, 5_001);
    }

    // ------------------------------------------------------------------- admin

    function test_OwnerRotatesRoles() public {
        address newFulfiller = makeAddr("newFulfiller");
        address newTreasury = makeAddr("newTreasury");
        (address newSigner, uint256 newSignerKey) = makeAddrAndKey("newSigner");

        _pay(_qusdcQuote(ORDER));
        vm.startPrank(owner);
        checkout.setFulfiller(newFulfiller);
        checkout.setTreasury(newTreasury);
        checkout.setQuoteSigner(newSigner);
        vm.stopPrank();

        // Old fulfiller is locked out; the new one settles to the new treasury.
        vm.prank(fulfiller);
        vm.expectRevert(QartaCheckout.NotFulfiller.selector);
        checkout.settle(ORDER);
        vm.prank(newFulfiller);
        checkout.settle(ORDER);
        assertEq(qusdc.balanceOf(newTreasury), 10e6);

        // Old signer's quotes stop working; the new signer's work.
        QartaCheckout.Quote memory q = _qusdcQuote(keccak256("order-2"));
        bytes memory oldSig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.InvalidSignature.selector);
        checkout.pay(q, oldSig);
        bytes memory newSig = _signWith(newSignerKey, q);
        vm.prank(payer);
        checkout.pay(q, newSig);
    }

    function test_RoleSettersRejectZeroAndNonOwner() public {
        vm.startPrank(owner);
        vm.expectRevert(QartaCheckout.ZeroAddress.selector);
        checkout.setFulfiller(address(0));
        vm.expectRevert(QartaCheckout.ZeroAddress.selector);
        checkout.setTreasury(address(0));
        vm.expectRevert(QartaCheckout.ZeroAddress.selector);
        checkout.setQuoteSigner(address(0));
        vm.expectRevert(QartaCheckout.ZeroAddress.selector);
        checkout.setAllowedToken(address(0), true);
        vm.expectRevert(QartaCheckout.ZeroAddress.selector);
        checkout.setOracle(address(0));
        vm.stopPrank();

        bytes memory unauthorized =
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger);
        vm.startPrank(stranger);
        vm.expectRevert(unauthorized);
        checkout.setFulfiller(stranger);
        vm.expectRevert(unauthorized);
        checkout.setTreasury(stranger);
        vm.expectRevert(unauthorized);
        checkout.setQuoteSigner(stranger);
        vm.expectRevert(unauthorized);
        checkout.setAllowedToken(address(qusdc), false);
        vm.expectRevert(unauthorized);
        checkout.rescue(address(qusdc), stranger, 1);
        vm.stopPrank();
    }

    function test_DisallowedTokenBlocksNewPaymentsButNotOpenOrders() public {
        _pay(_qusdcQuote(ORDER));
        vm.prank(owner);
        checkout.setAllowedToken(address(qusdc), false);

        QartaCheckout.Quote memory q = _qusdcQuote(keccak256("order-2"));
        bytes memory sig = _sign(q);
        vm.prank(payer);
        vm.expectRevert(QartaCheckout.TokenNotAllowed.selector);
        checkout.pay(q, sig);

        vm.prank(fulfiller);
        checkout.refund(ORDER);
        assertEq(qusdc.balanceOf(payer), 1_000e6);
    }

    function test_OwnershipIsTwoStepAndCannotBeRenounced() public {
        address cold = makeAddr("cold");
        vm.prank(owner);
        checkout.transferOwnership(cold);
        assertEq(checkout.owner(), owner); // not yet
        vm.prank(cold);
        checkout.acceptOwnership();
        assertEq(checkout.owner(), cold);

        vm.prank(cold);
        vm.expectRevert(QartaCheckout.RenounceDisabled.selector);
        checkout.renounceOwnership();
    }

    // ------------------------------------------------------------------ rescue

    function test_RescueTakesOnlyStrayFunds() public {
        _pay(_qusdcQuote(ORDER)); // 10 QUSDC escrowed
        _pay(_nativeQuote(keccak256("native"))); // 100 QIE escrowed
        qusdc.mint(address(checkout), 3e6); // sent by mistake
        vm.deal(address(checkout), address(checkout).balance + 2 ether); // forced in

        assertEq(checkout.rescuable(address(qusdc)), 3e6);
        assertEq(checkout.rescuable(address(0)), 2 ether);

        vm.startPrank(owner);
        vm.expectRevert(QartaCheckout.ExceedsRescuable.selector);
        checkout.rescue(address(qusdc), owner, 3e6 + 1);
        vm.expectRevert(QartaCheckout.ExceedsRescuable.selector);
        checkout.rescue(address(0), owner, 2 ether + 1);
        checkout.rescue(address(qusdc), owner, 3e6);
        checkout.rescue(address(0), owner, 2 ether);
        vm.stopPrank();

        assertEq(qusdc.balanceOf(owner), 3e6);
        assertEq(owner.balance, 2 ether);
        // Escrowed funds are untouched and still refundable.
        vm.startPrank(fulfiller);
        checkout.refund(ORDER);
        checkout.refund(keccak256("native"));
        vm.stopPrank();
    }

    function test_RescueCannotTouchEscrow() public {
        _pay(_qusdcQuote(ORDER));
        assertEq(checkout.rescuable(address(qusdc)), 0);
        vm.prank(owner);
        vm.expectRevert(QartaCheckout.ExceedsRescuable.selector);
        checkout.rescue(address(qusdc), owner, 1);
    }

    function test_PlainNativeTransferIsRejected() public {
        vm.prank(payer);
        (bool ok,) = address(checkout).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ------------------------------------------------------------- constructor

    function test_ConstructorValidation() public {
        vm.expectRevert(QartaCheckout.InvalidRefundTimeout.selector);
        new QartaCheckout(
            owner, quoteSigner, fulfiller, treasury, address(qusdc), address(feed), 1, 1, true, 29 minutes
        );
        vm.expectRevert(QartaCheckout.InvalidRefundTimeout.selector);
        new QartaCheckout(
            owner, quoteSigner, fulfiller, treasury, address(qusdc), address(feed), 1, 1, true, 7 days + 1
        );
        vm.expectRevert(QartaCheckout.ZeroAddress.selector);
        new QartaCheckout(
            owner, address(0), fulfiller, treasury, address(qusdc), address(feed), 1, 1, true, 2 hours
        );
        vm.expectRevert(QartaCheckout.ZeroAddress.selector);
        new QartaCheckout(
            owner, quoteSigner, address(0), treasury, address(qusdc), address(feed), 1, 1, true, 2 hours
        );
        vm.expectRevert(QartaCheckout.ZeroAddress.selector);
        new QartaCheckout(
            owner, quoteSigner, fulfiller, address(0), address(qusdc), address(feed), 1, 1, true, 2 hours
        );
        vm.expectRevert(QartaCheckout.ZeroAddress.selector);
        new QartaCheckout(
            owner, quoteSigner, fulfiller, treasury, address(0), address(feed), 1, 1, true, 2 hours
        );
        // The guard cannot start enabled without a feed.
        vm.expectRevert(QartaCheckout.OracleNotSet.selector);
        new QartaCheckout(
            owner, quoteSigner, fulfiller, treasury, address(qusdc), address(0), 1, 1, true, 2 hours
        );
    }

    function test_DeployWithoutOracleAndGuardOff() public {
        QartaCheckout bare = new QartaCheckout(
            owner, quoteSigner, fulfiller, treasury, address(qusdc), address(0), 0, 0, false, 2 hours
        );
        assertEq(bare.oracle(), address(0));
        assertFalse(bare.oracleGuardEnabled());
        vm.prank(owner);
        vm.expectRevert(QartaCheckout.OracleNotSet.selector);
        bare.setOracleGuardEnabled(true);
    }

    function test_InitialConfiguration() public view {
        assertEq(checkout.owner(), owner);
        assertEq(checkout.quoteSigner(), quoteSigner);
        assertEq(checkout.fulfiller(), fulfiller);
        assertEq(checkout.treasury(), treasury);
        assertTrue(checkout.allowedToken(address(qusdc)));
        assertEq(checkout.oracle(), address(feed));
        assertEq(checkout.oracleDecimals(), 8);
        assertEq(checkout.maxOracleAge(), MAX_ORACLE_AGE);
        assertEq(checkout.oracleToleranceBps(), TOLERANCE_BPS);
        assertTrue(checkout.oracleGuardEnabled());
        assertEq(checkout.refundTimeout(), REFUND_TIMEOUT);
    }

    // -------------------------------------------------------------------- fuzz

    function testFuzz_NativeGuardMatchesFormula(uint96 amountWei, uint64 usdAmount, uint32 price8) public {
        amountWei = uint96(bound(amountWei, 1, 5_000 ether));
        price8 = uint32(bound(price8, 1, type(uint32).max));
        feed.setAnswer(int256(uint256(price8)));

        uint256 paidUsd6 = uint256(amountWei) * price8 / 1e8 / 1e12;
        bool acceptable = paidUsd6 * 10_000 >= uint256(usdAmount) * (10_000 - TOLERANCE_BPS);

        QartaCheckout.Quote memory q = _quote(ORDER, address(0), amountWei, usdAmount);
        bytes memory sig = _sign(q);
        vm.prank(payer);
        if (!acceptable) vm.expectRevert(QartaCheckout.PriceBelowOracle.selector);
        checkout.pay{value: amountWei}(q, sig);
        assertEq(
            uint8(_status(ORDER)),
            acceptable ? uint8(QartaCheckout.Status.Paid) : uint8(QartaCheckout.Status.None)
        );
    }

    function testFuzz_PayThenRefundRestoresBalances(uint64 amount, bool native, bool byPayer) public {
        amount = uint64(bound(amount, 1, 1_000e6));
        address token = native ? address(0) : address(qusdc);
        vm.prank(owner);
        checkout.setOracleGuardEnabled(false);

        uint256 before = native ? payer.balance : qusdc.balanceOf(payer);
        _pay(_quote(ORDER, token, amount, amount));
        if (byPayer) {
            vm.warp(block.timestamp + REFUND_TIMEOUT);
            vm.prank(payer);
            checkout.claimRefund(ORDER);
        } else {
            vm.prank(fulfiller);
            checkout.refund(ORDER);
        }
        assertEq(native ? payer.balance : qusdc.balanceOf(payer), before);
        assertEq(checkout.totalEscrowed(token), 0);
    }
}
