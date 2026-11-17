// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {QartaCheckout} from "../../src/QartaCheckout.sol";

/// @notice A payer contract that tries to take a second refund while receiving the first one.
contract ReentrantPayer {
    QartaCheckout public immutable checkout;
    bytes32 public orderId;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(QartaCheckout checkout_) {
        checkout = checkout_;
    }

    function pay(QartaCheckout.Quote calldata q, bytes calldata sig) external payable {
        orderId = q.orderId;
        checkout.pay{value: msg.value}(q, sig);
    }

    function claim() external {
        checkout.claimRefund(orderId);
    }

    receive() external payable {
        if (!reentryAttempted) {
            reentryAttempted = true;
            try checkout.claimRefund(orderId) {
                reentrySucceeded = true;
            } catch {}
        }
    }
}

/// @notice A payer contract that cannot receive native coin.
contract RejectingPayer {
    function pay(QartaCheckout checkout, QartaCheckout.Quote calldata q, bytes calldata sig)
        external
        payable
    {
        checkout.pay{value: msg.value}(q, sig);
    }
}

/// @notice An ERC-20 that keeps 1% of every transfer.
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}
