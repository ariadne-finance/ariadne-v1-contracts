// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

import "./BFarmBase.sol";

interface IVault {
    function setRelayerApproval(
        address sender,
        address relayer,
        bool approved
    ) external;

    function getPoolTokens(bytes32 poolId)
        external
        view
        returns (
            IERC20[] memory tokens,
            uint256[] memory balances,
            uint256 lastChangeBlock
        );

    function joinPool(
        bytes32 poolId,
        address sender,
        address recipient,
        JoinPoolRequest memory request
    ) external payable;

    struct JoinPoolRequest {
        address[] assets;
        uint256[] maxAmountsIn;
        bytes userData;
        bool fromInternalBalance;
    }

    function exitPool(
        bytes32 poolId,
        address sender,
        address payable recipient,
        ExitPoolRequest memory request
    ) external;

    struct ExitPoolRequest {
        address[] assets;
        uint256[] minAmountsOut;
        bytes userData;
        bool toInternalBalance;
    }
}

interface IWeightedPool {
    function getPoolId() view external returns (bytes32);
    function getVault() external view returns (IVault);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface IMasterChef {
    function beets() view external returns (address);

    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    function userInfo(uint256, address) view external returns (UserInfo memory);

    function deposit(uint256 _pid, uint256 _amount, address _to) external;
    function withdrawAndHarvest(uint256 _pid, uint256 _amount, address _to) external;
    function emergencyWithdraw(uint256 _pid, address _to) external;
    function harvest(uint256 _pid, address _to) external;
}

contract BFarmBeets4 is BFarmBase {
    using SafeERC20 for IERC20;

    IWeightedPool public immutable weightedPool;

    IVault public immutable vault;
    bytes32 public immutable vaultPoolId;

    IMasterChef public immutable masterChef;
    uint256 public immutable masterChefPoolId;

    constructor(
        address _weightedPool,
        address _masterChef,
        uint256 _masterChefPoolId,
        string memory name,
        string memory symbol
    ) BFarmBase(
        name,
        symbol
    ) {
        weightedPool = IWeightedPool(_weightedPool);

        _decimals = weightedPool.decimals();

        masterChef = IMasterChef(_masterChef);
        masterChefPoolId = _masterChefPoolId;

        vault =  weightedPool.getVault();
        vaultPoolId = weightedPool.getPoolId();

        vault.setRelayerApproval(address(this), 0xC852F984CA3310AFc596adeB17EfcB0542646920, true); // BalancerRelayer // FIXME to constructor arguments

        (IERC20[] memory _poolTokens,,) = vault.getPoolTokens(vaultPoolId);

        for (uint i=0; i<_poolTokens.length; i++) {
            _poolTokens[i].approve(address(vault), 2**256-1);
        }

        IERC20(address(weightedPool)).approve(address(masterChef), 2**256-1);
    }

    function invest() public onlyRole(TRADER_ROLE) whenNotPaused override {
        uint256 liquidityAdded = addLiquidity();
        stakeTokens();

        _mint(msg.sender, liquidityAdded);
    }

    function addLiquidity() public override onlyRole(TRADER_ROLE) returns (uint256) {
        (IERC20[] memory _poolTokens,,) = vault.getPoolTokens(vaultPoolId);

        address[] memory assets = new address[](_poolTokens.length);
        uint256[] memory maxAmountsIn = new uint256[](_poolTokens.length);
        uint256[] memory amountsIn = new uint256[](_poolTokens.length);

        for (uint i=0; i<_poolTokens.length; i++) {
            assets[i] = address(_poolTokens[i]);
            amountsIn[i] = _poolTokens[i].balanceOf(address(this));
            maxAmountsIn[i] = 2**256-1;
        }

        bytes memory userData = abi.encode(1, amountsIn, 0); // 1 == EXACT_TOKENS_IN_FOR_BPT_OUT, 0 == minimumBPT

        IVault.JoinPoolRequest memory joinPoolRequest = IVault.JoinPoolRequest({
            assets: assets,
            maxAmountsIn: maxAmountsIn,
            userData: userData,
            fromInternalBalance: false
        });

        vault.joinPool(
            vaultPoolId,
            address(this),
            address(this),
            joinPoolRequest
        );

        return weightedPool.balanceOf(address(this));
    }

    function stakeTokens() public onlyRole(TRADER_ROLE) override {
        uint256 _lpBalance = weightedPool.balanceOf(address(this));
        masterChef.deposit(masterChefPoolId, _lpBalance, address(this));
    }

    function unstakeTokens(uint256 amount) public onlyRole(TRADER_ROLE) override {
        masterChef.withdrawAndHarvest(masterChefPoolId, amount, address(this));
    }

    function withdraw(uint256 amount) public onlyRole(TRADER_ROLE) override {
        uint256 lpAmount = lpBalance() * amount / totalSupply();

        unstakeTokens(lpAmount);
        removeLiquidity(lpAmount);

        _burn(msg.sender, amount);
    }

    function emergencyWithdraw() public onlyRole(TRADER_ROLE) override {
        masterChef.emergencyWithdraw(masterChefPoolId, address(this));

        uint256 _lpBalance = weightedPool.balanceOf(address(this));
        removeLiquidity(_lpBalance);

        _burn(msg.sender, totalSupply());
    }

    function removeLiquidity(uint256 liquidity) public override onlyRole(TRADER_ROLE) {
        (IERC20[] memory _poolTokens,,) = vault.getPoolTokens(vaultPoolId);

        address[] memory assets = new address[](_poolTokens.length);
        uint256[] memory minAmountsOut = new uint256[](_poolTokens.length);

        for (uint i=0; i<_poolTokens.length; i++) {
            assets[i] = address(_poolTokens[i]);
            minAmountsOut[i] = _poolTokens[i].balanceOf(address(this));
        }

        bytes memory userData = abi.encode(1, liquidity); // 1 == EXACT_BPT_IN_FOR_TOKENS_OUT

        IVault.ExitPoolRequest memory exitPoolRequest = IVault.ExitPoolRequest({
            assets: assets,
            minAmountsOut: minAmountsOut,
            userData: userData,
            toInternalBalance: false
        });

        vault.exitPool(
            vaultPoolId,
            address(this),
            payable(address(this)),
            exitPoolRequest
        );
    }

    function harvest() public override onlyRole(TRADER_ROLE) {
        masterChef.harvest(masterChefPoolId, address(this));
    }

    function lpBalance() public view override returns (uint256) {
        IMasterChef.UserInfo memory userInfo = masterChef.userInfo(masterChefPoolId, address(this));
        return userInfo.amount;
    }

    function poolTokens() public view returns (IERC20[] memory _tokens) {
        (IERC20[] memory _poolTokens,,) = vault.getPoolTokens(vaultPoolId);
        return _poolTokens;
    }

    function collectPoolTokens(address to) public onlyRole(TRADER_ROLE) {
        (IERC20[] memory _poolTokens,,) = vault.getPoolTokens(vaultPoolId);

        for (uint i=0; i<_poolTokens.length; i++) {
            collectToken(address(_poolTokens[i]), to);
        }
    }

    function transferAndInvest(uint256[] memory amounts) public onlyRole(TRADER_ROLE) whenNotPaused {
        (IERC20[] memory _poolTokens,,) = vault.getPoolTokens(vaultPoolId);

        for (uint256 i=0; i<_poolTokens.length; i++) {
            if (amounts[i] > 0) {
                _poolTokens[i].safeTransferFrom(msg.sender, address(this), amounts[i]);
            }
        }

        invest();
    }

    function withdrawAndCollect(uint256 amount) public onlyRole(TRADER_ROLE) {
        withdraw(amount);

        (IERC20[] memory _poolTokens,,) = vault.getPoolTokens(vaultPoolId);

        for (uint256 i=0; i<_poolTokens.length; i++) {
            collectToken(address(_poolTokens[i]), msg.sender);
        }
    }
}
