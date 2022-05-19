// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISushiswapMasterChefV2 {
    struct UserInfo {
        uint256 amount;
        int256 rewardDebt;
    }

    struct PoolInfo {
        uint128 accSushiPerShare;
        uint64 lastRewardBlock;
        uint64 allocPoint;
    }

    function MASTER_CHEF() external view returns (address);
    function SUSHI() external view returns (address);
    function MASTER_PID() external view returns (uint256);

    function poolInfo(uint256 pid) external view returns (ISushiswapMasterChefV2.PoolInfo memory);
    function lpToken(uint256 i) external view returns (address);
    function rewarder(uint256 i) external view returns (address);

    function userInfo(uint256 pid, address account) external view returns (uint256 amount, uint256 rewardDebt);

    function totalAllocPoint() external view returns (uint256);
    function poolLength() external view returns (uint256 pools);
    function pendingSushi(uint256 _pid, address _user) external view returns (uint256 pending);
    function sushiPerBlock() external view returns (uint256 amount);
    function deposit(uint256 pid, uint256 amount, address to) external;
    function withdraw(uint256 pid, uint256 amount, address to) external;
    function harvest(uint256 pid, address to) external;
    function withdrawAndHarvest(uint256 pid, uint256 amount, address to) external;
    function updatePool(uint256 pid) external;
    function emergencyWithdraw(uint256 pid, address to) external;
}
