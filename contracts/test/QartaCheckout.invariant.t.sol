// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {QartaCheckout} from "../src/QartaCheckout.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";

/// @notice Drives random sequences of pay / settle / refund / claimRefund / time jumps and keeps
///         ghost totals so the invariant test can compare them with the contract's state.
contract CheckoutHandler is Test {
    QartaCheckout public immutable checkout;
    MockERC20 public immutable qusdc;
    uint256 internal immutable signerKey;
    address internal immutable fulfiller;

    address[] internal payers;
    bytes32[] public orderIds;
    uint256 internal nonce;

    /// @dev Sum of amounts of orders currently Paid, per token.
    mapping(address token => uint256) public ghostPaid;
    /// @dev Number of times each order left the Paid status.
    mapping(bytes32 orderId => uint256) public ghostExits;

    constructor(QartaCheckout checkout_, MockERC20 qusdc_, uint256 signerKey_, address fulfiller_) {
        checkout = checkout_;
        qusdc = qusdc_;
        signerKey = signerKey_;
        fulfiller = fulfiller_;
        for (uint256 i = 0; i < 3; i++) {
            address p = makeAddr(string(abi.encodePacked("payer", vm.toString(i))));
            payers.push(p);
            qusdc_.mint(p, 1_000_000e6);
            vm.deal(p, 1_000_000 ether);
            vm.prank(p);
            qusdc_.approve(address(checkout_), type(uint256).max);
        }
    }

    function orderCount() external view returns (uint256) {
        return orderIds.length;
    }

    function pay(uint256 payerSeed, uint256 amount, bool native) external {
        address p = payers[payerSeed % payers.length];
        address token = native ? address(0) : address(qusdc);
        amount = bound(amount, 1, native ? 1_000 ether : 1_000e6);
        bytes32 orderId = keccak256(abi.encode("order", nonce++));

        QartaCheckout.Quote memory q = QartaCheckout.Quote({
            orderId: orderId,
            payer: p,
            token: token,
            amount: amount,
            usdAmount: 0, // the guard is disabled in this test; pricing is covered by unit tests
            expiry: uint64(block.timestamp + 600)
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, checkout.hashQuote(q));
        vm.prank(p);
        checkout.pay{value: native ? amount : 0}(q, abi.encodePacked(r, s, v));

        orderIds.push(orderId);
        ghostPaid[token] += amount;
    }

    function settle(uint256 seed) external {
        (bytes32 orderId, bool found) = _pickPaid(seed);
        if (!found) return;
        vm.prank(fulfiller);
        checkout.settle(orderId);
        _recordExit(orderId);
    }

    function refund(uint256 seed) external {
        (bytes32 orderId, bool found) = _pickPaid(seed);
        if (!found) return;
        vm.prank(fulfiller);
        checkout.refund(orderId);
        _recordExit(orderId);
    }

    function claimRefund(uint256 seed) external {
        (bytes32 orderId, bool found) = _pickPaid(seed);
        if (!found) return;
        (address p,,, uint64 paidAt,) = checkout.orders(orderId);
        if (block.timestamp < uint256(paidAt) + checkout.refundTimeout()) return;
        vm.prank(p);
        checkout.claimRefund(orderId);
        _recordExit(orderId);
    }

    function warp(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1, 3 hours));
    }

    function _pickPaid(uint256 seed) internal view returns (bytes32, bool) {
        uint256 n = orderIds.length;
        if (n == 0) return (bytes32(0), false);
        uint256 start = seed % n; // reduce first: seed + i could overflow
        for (uint256 i = 0; i < n; i++) {
            bytes32 id = orderIds[(start + i) % n];
            (,,,, QartaCheckout.Status status) = checkout.orders(id);
            if (status == QartaCheckout.Status.Paid) return (id, true);
        }
        return (bytes32(0), false);
    }

    function _recordExit(bytes32 orderId) internal {
        (, address token, uint256 amount,,) = checkout.orders(orderId);
        ghostPaid[token] -= amount;
        ghostExits[orderId] += 1;
    }
}

contract QartaCheckoutInvariantTest is Test {
    QartaCheckout internal checkout;
    MockERC20 internal qusdc;
    CheckoutHandler internal handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        (address signer, uint256 signerKey) = makeAddrAndKey("quoteSigner");
        address fulfiller = makeAddr("fulfiller");
        qusdc = new MockERC20("QUSDC", "QUSDC");
        MockAggregatorV3 feed = new MockAggregatorV3(8, 15_000_000);
        checkout = new QartaCheckout(
            address(this),
            signer,
            fulfiller,
            makeAddr("treasury"),
            address(qusdc),
            address(feed),
            86_400,
            1_000,
            false,
            2 hours
        );
        handler = new CheckoutHandler(checkout, qusdc, signerKey, fulfiller);

        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = CheckoutHandler.pay.selector;
        selectors[1] = CheckoutHandler.settle.selector;
        selectors[2] = CheckoutHandler.refund.selector;
        selectors[3] = CheckoutHandler.claimRefund.selector;
        selectors[4] = CheckoutHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
        // Handler calls are written not to revert; a revert means a real failure.
    }

    /// @notice The contract holds exactly the funds of open orders, per token.
    function invariant_BalanceEqualsSumOfPaidOrders() public view {
        assertEq(qusdc.balanceOf(address(checkout)), handler.ghostPaid(address(qusdc)));
        assertEq(address(checkout).balance, handler.ghostPaid(address(0)));
    }

    /// @notice The contract's own counter matches the ghost total, per token.
    function invariant_TotalEscrowedMatches() public view {
        assertEq(checkout.totalEscrowed(address(qusdc)), handler.ghostPaid(address(qusdc)));
        assertEq(checkout.totalEscrowed(address(0)), handler.ghostPaid(address(0)));
        assertEq(checkout.rescuable(address(qusdc)), 0);
        assertEq(checkout.rescuable(address(0)), 0);
    }

    /// @notice An order leaves Paid at most once.
    function invariant_OrderLeavesPaidOnce() public view {
        uint256 n = handler.orderCount();
        for (uint256 i = 0; i < n; i++) {
            assertLe(handler.ghostExits(handler.orderIds(i)), 1);
        }
    }
}
