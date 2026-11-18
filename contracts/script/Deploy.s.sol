// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {QartaCheckout} from "../src/QartaCheckout.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";
import {MockPair} from "../src/mocks/MockPair.sol";

/// @title Deploy
/// @notice Deploys QartaCheckout. All values come from the environment (contracts/.env.example).
///
/// With DEPLOY_MOCKS=true (anvil, testnet) it first deploys MockERC20 (as QUSDC) and
/// MockAggregatorV3 (as the QIE/USD feed) and uses those. On mainnet DEPLOY_MOCKS must be false
/// and QUSDC_ADDRESS / QIE_USD_FEED point to the real contracts.
///
/// Ownership: the deployer is the initial owner. Afterwards the owner calls
/// `transferOwnership(OWNER_ADDRESS)` and the cold wallet calls `acceptOwnership()` (two steps).
contract Deploy is Script {
    struct Config {
        address quoteSigner;
        address fulfiller;
        address treasury;
        address qusdc;
        address feed;
        uint32 maxOracleAge;
        uint16 oracleToleranceBps;
        bool oracleGuardEnabled;
        uint64 refundTimeout;
        bool deployMocks;
        address pendingOwner;
    }

    function run() external returns (QartaCheckout checkout) {
        Config memory c = Config({
            quoteSigner: vm.envAddress("QUOTE_SIGNER_ADDRESS"),
            fulfiller: vm.envAddress("FULFILLER_ADDRESS"),
            treasury: vm.envAddress("TREASURY_ADDRESS"),
            qusdc: vm.envOr("QUSDC_ADDRESS", address(0)),
            feed: vm.envOr("QIE_USD_FEED", address(0)),
            maxOracleAge: uint32(vm.envOr("MAX_ORACLE_AGE_S", uint256(86_400))),
            oracleToleranceBps: uint16(vm.envOr("ORACLE_TOLERANCE_BPS", uint256(1_000))),
            oracleGuardEnabled: vm.envOr("ORACLE_GUARD_ENABLED", true),
            refundTimeout: uint64(vm.envOr("REFUND_TIMEOUT_S", uint256(7_200))),
            deployMocks: vm.envOr("DEPLOY_MOCKS", false),
            pendingOwner: vm.envOr("OWNER_ADDRESS", address(0))
        });
        if (c.deployMocks && block.chainid == 1990) revert("Deploy: mocks on QIE mainnet");

        vm.startBroadcast();
        // The broadcaster (from --sender / --account) becomes the initial owner. Read it from the
        // cheatcode instead of trusting msg.sender of run(), which depends on how forge was invoked.
        (, address deployer,) = vm.readCallers();
        if (c.deployMocks) {
            MockERC20 token = new MockERC20("Mock QUSDC", "QUSDC");
            // $0.15 per QIE, 8 decimals like the real feed.
            MockAggregatorV3 mockFeed = new MockAggregatorV3(8, 15_000_000);
            c.qusdc = address(token);
            c.feed = address(mockFeed);
            // WQIE/QUSDC pool at the same $0.15: 100,000 QIE and 15,000 QUSDC. The "WQIE" side is
            // a plain address: the backend's cross-check only reads token0/token1/getReserves.
            address mockWqie = address(uint160(uint256(keccak256("qarta.mock.wqie"))));
            MockPair pair = new MockPair(mockWqie, c.qusdc, 100_000e18, 15_000e6);
            console2.log("MockERC20 (QUSDC)       ", c.qusdc);
            console2.log("MockAggregatorV3 (feed) ", c.feed);
            console2.log("MockPair (WQIE/QUSDC)   ", address(pair));
            console2.log("mock WQIE address       ", mockWqie);
        }
        checkout = new QartaCheckout(
            deployer,
            c.quoteSigner,
            c.fulfiller,
            c.treasury,
            c.qusdc,
            c.feed,
            c.maxOracleAge,
            c.oracleToleranceBps,
            c.oracleGuardEnabled,
            c.refundTimeout
        );
        // Step one of the ownership handover; the cold wallet must call acceptOwnership().
        if (c.pendingOwner != address(0)) checkout.transferOwnership(c.pendingOwner);
        vm.stopBroadcast();

        require(checkout.owner() == deployer, "Deploy: owner is not the broadcaster");
        require(checkout.pendingOwner() == c.pendingOwner, "Deploy: pending owner not set");

        console2.log("QartaCheckout           ", address(checkout));
        console2.log("deploy block            ", block.number);
        console2.log("owner (until accepted)  ", checkout.owner());
        console2.log("pending owner           ", c.pendingOwner);
    }
}
