// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC20.sol";

interface IRewarder {
    function onIncentReward(uint256 pid, address user, address recipient, uint256 incentAmount, uint256 newLpAmount) external;
    function pendingTokens(uint256 pid, address user, uint256 incentAmount) external view returns (IERC20[] memory, uint256[] memory);
}
