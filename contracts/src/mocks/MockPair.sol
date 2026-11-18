// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Test stand-in for a QIEDex (Uniswap V2) pair: only the reads the backend's price
///         cross-check uses. Anyone can set the reserves. For anvil and testnet only.
contract MockPair {
    address public immutable token0;
    address public immutable token1;
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    constructor(address token0_, address token1_, uint112 reserve0_, uint112 reserve1_) {
        token0 = token0_;
        token1 = token1_;
        setReserves(reserve0_, reserve1_);
    }

    function setReserves(uint112 reserve0_, uint112 reserve1_) public {
        reserve0 = reserve0_;
        reserve1 = reserve1_;
        blockTimestampLast = uint32(block.timestamp);
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }
}
