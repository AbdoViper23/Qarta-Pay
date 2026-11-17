// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Test stand-in for the QIE/USD feed. Anyone can set the answer. For anvil and testnet only.
contract MockAggregatorV3 {
    uint8 public immutable decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId;
    bool public shouldRevert;

    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        setAnswer(answer_);
    }

    /// @notice Set a new price, stamped with the current block time.
    function setAnswer(int256 answer_) public {
        answer = answer_;
        updatedAt = block.timestamp;
        roundId += 1;
    }

    /// @notice Set the update time directly, to simulate a stale or future-dated feed.
    function setUpdatedAt(uint256 updatedAt_) external {
        updatedAt = updatedAt_;
    }

    /// @notice Make `latestRoundData` revert, to simulate a broken feed.
    function setShouldRevert(bool shouldRevert_) external {
        shouldRevert = shouldRevert_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        require(!shouldRevert, "MockAggregatorV3: down");
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }
}
