// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

interface IEllipsisLpStaking {
    function deposit(address _token, uint256 _amount, bool _claimRewards) external returns (uint256);
    function withdraw(address _token, uint256 _amount, bool _claimRewards) external returns (uint256);
    function emergencyWithdraw(address _token) external;
    function claim(address _user, address[] calldata _tokens) external returns (uint256);
    function userInfo(address lpToken, address account) external view returns (uint256 depositAmount, uint256 adjustedAmount, uint256 rewardDebt, uint256 claimable);
    function rewardToken() view external returns (address);
}
