// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ForkBase} from "./ForkBase.sol";
import {SweepTreasury} from "../../script/SweepTreasury.s.sol";

interface IForkBalance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice The treasury sweep against the real QIEDex router and the real QIE/USD feed.
contract SweepTreasuryForkTest is ForkBase {
    SweepTreasury internal script;
    address internal treasury;

    function setUp() public override {
        super.setUp();
        script = new SweepTreasury();
        treasury = makeAddr("treasury");
        vm.deal(treasury, 1_000 ether);
    }

    function _params(uint256 amountWei, uint256 slippageBps)
        internal
        view
        returns (SweepTreasury.Params memory)
    {
        return SweepTreasury.Params({
            treasury: treasury,
            router: router,
            wqie: wqie,
            qusdc: qusdc,
            feed: feed,
            amountWei: amountWei,
            maxSlippageBps: slippageBps,
            gasReserveWei: 1 ether,
            maxOracleAge: MAX_ORACLE_AGE
        });
    }

    /// @dev How far below the oracle value the router quotes `amountWei` right now, in bps.
    function _shortfallBps(uint256 amountWei) internal view returns (uint256) {
        SweepTreasury.Plan memory loose = script.plan(_params(amountWei, 9_999));
        if (loose.routerOut >= loose.oracleOut) return 0;
        return (loose.oracleOut - loose.routerOut) * 10_000 / loose.oracleOut + 1;
    }

    function test_SweepSwapsOnRealRouterAndTreasuryGetsMinOut() public {
        uint256 amount = 10 ether;
        // Allow the pool's current distance from the oracle plus 1%, so the test checks the
        // mechanics, not today's price.
        uint256 slippage = _shortfallBps(amount) + 100;
        SweepTreasury.Plan memory plan_ = script.plan(_params(amount, slippage));

        uint256 received = script.sweep(_params(amount, slippage));

        assertGe(received, plan_.minOut);
        assertEq(IForkBalance(qusdc).balanceOf(treasury), received);
        assertEq(treasury.balance, 1_000 ether - amount);
    }

    function test_SweepAbortsWhenPoolIsFurtherFromOracleThanAllowed() public {
        uint256 amount = 10 ether;
        uint256 shortfall = _shortfallBps(amount);
        vm.assume(shortfall > 50); // only meaningful while the pool trades below the oracle
        vm.expectRevert();
        script.sweep(_params(amount, shortfall - 50));
        assertEq(treasury.balance, 1_000 ether);
        assertEq(IForkBalance(qusdc).balanceOf(treasury), 0);
    }

    function test_DecidedDefaultsAcceptAOneHundredThirtyQieChunk() public {
        // 17 Nov 2026 decision: 700 bps and chunks of at most ~130 QIE. At the pinned block
        // (11961896) a 130 QIE chunk is quoted 584 bps under the oracle, so the default passes.
        // On a different FORK_BLOCK this can legitimately abort; re-check the decision then.
        uint256 shortfall = _shortfallBps(130 ether);
        emit log_named_uint("shortfall bps for 130 QIE", shortfall);
        assertLt(shortfall, 700, "pool moved: revisit SWEEP_MAX_SLIPPAGE_BPS / chunk size");
        uint256 received = script.sweep(_params(130 ether, 700));
        assertGt(received, 0);
    }
}
