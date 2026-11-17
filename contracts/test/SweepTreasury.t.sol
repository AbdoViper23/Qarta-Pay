// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SweepTreasury} from "../script/SweepTreasury.s.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";
import {MockRouter} from "../src/mocks/MockRouter.sol";

contract SweepTreasuryTest is Test {
    SweepTreasury internal script;
    MockERC20 internal qusdc;
    MockAggregatorV3 internal feed;
    MockRouter internal router;
    address internal treasury = makeAddr("treasury");
    address internal wqie = makeAddr("wqie");

    /// @dev $0.15 per QIE; QUSDC base units per 1e18 wei.
    uint256 internal constant RATE = 150_000;

    function setUp() public {
        vm.warp(1_800_000_000);
        script = new SweepTreasury();
        qusdc = new MockERC20("QUSDC", "QUSDC");
        feed = new MockAggregatorV3(8, 15_000_000);
        router = new MockRouter(wqie, qusdc, RATE);
        qusdc.mint(address(router), 1_000_000e6);
        vm.deal(treasury, 200 ether);
    }

    function _params() internal view returns (SweepTreasury.Params memory) {
        return SweepTreasury.Params({
            treasury: treasury,
            router: address(router),
            wqie: wqie,
            qusdc: address(qusdc),
            feed: address(feed),
            amountWei: 100 ether,
            maxSlippageBps: 700,
            gasReserveWei: 1 ether,
            maxOracleAge: 86_400
        });
    }

    function test_HappyPathTreasuryReceivesAtLeastMinOut() public {
        SweepTreasury.Plan memory plan_ = script.plan(_params());
        assertEq(plan_.oracleOut, 15e6); // 100 QIE x $0.15
        assertEq(plan_.minOut, 13.95e6); // minus 7%

        uint256 received = script.sweep(_params());
        assertEq(received, 15e6);
        assertGe(qusdc.balanceOf(treasury), plan_.minOut);
        assertEq(treasury.balance, 100 ether);
        assertEq(router.lastRecipient(), treasury);
    }

    function test_SwapIsPaidByTheTreasury() public {
        uint256 scriptBalance = address(script).balance;
        script.sweep(_params());
        assertEq(treasury.balance, 100 ether);
        assertEq(address(script).balance, scriptBalance);
    }

    function test_AbortsOnStaleOracle() public {
        feed.setUpdatedAt(block.timestamp - 86_401);
        vm.expectRevert(
            abi.encodeWithSelector(
                SweepTreasury.SweepOracleStale.selector, block.timestamp - 86_401, block.timestamp, 86_400
            )
        );
        script.sweep(_params());
        assertEq(treasury.balance, 200 ether);
    }

    function test_AbortsOnFutureOracleTimestamp() public {
        feed.setUpdatedAt(block.timestamp + 1);
        vm.expectRevert();
        script.plan(_params());
    }

    function test_AbortsOnNonPositiveAnswer() public {
        feed.setAnswer(0);
        vm.expectRevert(abi.encodeWithSelector(SweepTreasury.SweepOracleBadAnswer.selector, int256(0)));
        script.sweep(_params());
        feed.setAnswer(-1);
        vm.expectRevert(abi.encodeWithSelector(SweepTreasury.SweepOracleBadAnswer.selector, int256(-1)));
        script.sweep(_params());
    }

    function test_AbortsWhenRouterQuoteBelowOracleMinOut() public {
        // Pool pays 10% under the oracle; the limit is 7%.
        router.setRates(135_000, 135_000);
        vm.expectRevert(abi.encodeWithSelector(SweepTreasury.SweepPoolOffPrice.selector, 13.5e6, 13.95e6));
        script.sweep(_params());
        assertEq(treasury.balance, 200 ether);
        assertEq(qusdc.balanceOf(treasury), 0);
    }

    function test_FloorComesFromOracleNotFromPool() public {
        // Pool quote looks fine to itself but is 20% under the oracle: must abort.
        router.setRates(120_000, 120_000);
        vm.expectRevert();
        script.plan(_params());
    }

    function test_RevertsWhenPriceMovesBetweenQuoteAndSwap() public {
        // Quote is fine, execution is 10% worse: the router enforces minOut and nothing moves.
        router.setRates(RATE, 135_000);
        vm.expectRevert("MockRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        script.sweep(_params());
        assertEq(treasury.balance, 200 ether);
    }

    function test_AbortsWhenSwapWouldBreachGasReserve() public {
        SweepTreasury.Params memory p = _params();
        p.amountWei = 199.5 ether; // would leave 0.5 QIE, reserve is 1
        vm.expectRevert(
            abi.encodeWithSelector(SweepTreasury.SweepGasReserve.selector, 200 ether, 199.5 ether, 1 ether)
        );
        script.sweep(p);
    }

    function test_AbortsWhenAmountExceedsBalance() public {
        SweepTreasury.Params memory p = _params();
        p.amountWei = 201 ether;
        vm.expectRevert(
            abi.encodeWithSelector(SweepTreasury.SweepGasReserve.selector, 200 ether, 201 ether, 1 ether)
        );
        script.plan(p);
    }

    function test_AbortsOnBadParams() public {
        SweepTreasury.Params memory p = _params();
        p.amountWei = 0;
        vm.expectRevert(SweepTreasury.SweepZeroAmount.selector);
        script.plan(p);

        p = _params();
        p.treasury = address(0);
        vm.expectRevert(SweepTreasury.SweepZeroAddress.selector);
        script.plan(p);

        p = _params();
        p.maxSlippageBps = 10_000;
        vm.expectRevert(abi.encodeWithSelector(SweepTreasury.SweepSlippageTooHigh.selector, 10_000));
        script.plan(p);
    }

    function test_RunRejectsWrongSender() public {
        vm.setEnv("TREASURY_ADDRESS", vm.toString(treasury));
        vm.setEnv("QIEDEX_ROUTER", vm.toString(address(router)));
        vm.setEnv("WQIE_ADDRESS", vm.toString(wqie));
        vm.setEnv("QUSDC_ADDRESS", vm.toString(address(qusdc)));
        vm.setEnv("QIE_USD_FEED", vm.toString(address(feed)));
        vm.setEnv("SWEEP_AMOUNT_WEI", "100000000000000000000");
        vm.setEnv("SWEEP_GAS_RESERVE_WEI", "1000000000000000000");

        // msg.sender of run() is this test contract, not the treasury: must refuse.
        // (vm.prank cannot be combined with the script's broadcast, so the sender is changed via env.)
        vm.expectRevert(
            abi.encodeWithSelector(SweepTreasury.SweepWrongSender.selector, address(this), treasury)
        );
        script.run();
        assertEq(treasury.balance, 200 ether);

        // When the caller is the configured treasury, run() sweeps.
        vm.setEnv("TREASURY_ADDRESS", vm.toString(address(this)));
        vm.deal(address(this), 200 ether);
        script.run();
        assertEq(qusdc.balanceOf(address(this)), 15e6);
    }

    function testFuzz_MinOutNeverExceedsOracleValue(uint96 amountWei, uint32 price8, uint16 slippageBps)
        public
    {
        amountWei = uint96(bound(amountWei, 1 ether, 150 ether));
        price8 = uint32(bound(price8, 1e6, 1e9));
        // >= 2 bps: the mock's integer rate truncates the pool price by up to 1 bps.
        slippageBps = uint16(bound(slippageBps, 2, 9_999));
        feed.setAnswer(int256(uint256(price8)));
        uint256 rate = uint256(price8) * 1e6 / 1e8; // pool exactly at the oracle price
        router.setRates(rate, rate);

        SweepTreasury.Params memory p = _params();
        p.amountWei = amountWei;
        p.maxSlippageBps = slippageBps;
        try script.plan(p) returns (SweepTreasury.Plan memory plan_) {
            assertLe(plan_.minOut, plan_.oracleOut);
            assertGe(plan_.routerOut, plan_.minOut);
        } catch {
            // Only acceptable abort here: minOut rounds to zero for a dust amount.
            assertEq(uint256(amountWei) * price8 / 1e8 / 1e12 * (10_000 - slippageBps) / 10_000, 0);
        }
    }
}
