// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISushiswapMasterChef {
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
    }

    struct PoolInfo {
        address lpToken;          // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. SUSHI to distribute per block.
        uint256 lastRewardBlock;  // Last block number that SUSHI distribution occurs.
        uint256 accSushiPerShare; // Accumulated SUSHI per share, times 1e12. See below.
    }

    function sushi() external view returns (address);
    function poolInfo(uint256 pid) external view returns (ISushiswapMasterChef.PoolInfo memory);
    function userInfo(uint256 pid, address account) external view returns (uint256 amount, uint256 rewardDebt);
    function totalAllocPoint() external view returns (uint256);
    function deposit(uint256 _pid, uint256 _amount) external;
    function harvest(uint256 pid, address to) external;
    function withdraw(uint256 _pid, uint256 _amount) external;
    function pendingSushi(uint256 _pid, address _user) external view returns (uint256 amount);
    function sushiPerBlock() external view returns (uint256 value);
    function poolLength() external view returns (uint256);
    function updatePool(uint256 pid) external;
    function emergencyWithdraw(uint256 _pid) external;
}
