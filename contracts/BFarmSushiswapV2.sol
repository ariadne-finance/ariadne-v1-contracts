// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BFarmUniswapBase.sol";
import "./interfaces/ISushiswapMasterChefV2.sol";

/**
@notice Actual implementation of a Ariadne farm that has an underlying Sushiswap-compatible LP pool staked in MasterChefV2 (also MiniChef, etc).

Please see `BFarmBase` and `BFarmUniswapBase` docs.
*/
contract BFarmSushiswapV2 is BFarmUniswapBase {
    using SafeERC20 for IERC20;

    ISushiswapMasterChefV2 public immutable masterChef;
    uint256 public immutable poolId;

    constructor(
        address routerAddress,
        address token0Address,
        address token1Address,
        string memory name,
        string memory symbol,

        address masterChefAddress,
        uint256 _poolId
    ) BFarmUniswapBase(
        routerAddress,
        token0Address,
        token1Address,
        name,
        symbol
    ) {
        masterChef = ISushiswapMasterChefV2(masterChefAddress);
        poolId = _poolId;

        IUniswapV2Pair(pair).approve(address(masterChef), 2**256-1);
    }

    function addLiquidity() public override onlyRole(TRADER_ROLE) returns (uint256) {
        uint256 balanceToken0 = IERC20(token0).balanceOf(address(this));
        uint256 balanceToken1 = IERC20(token1).balanceOf(address(this));

        (,, uint _liquidity) = IUniswapV2Router02(router).addLiquidity(
            token0,
            token1,

            balanceToken0,
            balanceToken1,

            balanceToken0 * slippagePercentMultiplier / 10000,
            balanceToken1 * slippagePercentMultiplier / 10000,

            address(this),
            block.timestamp + deadlineSeconds
        );

        return _liquidity;
    }

    function removeLiquidity(uint256 liquidity) public override onlyRole(TRADER_ROLE) {
        (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pair).getReserves();

        uint256 amountToken0 = reserve0 * liquidity / IUniswapV2Pair(pair).totalSupply() * slippagePercentMultiplier / 10000;
        uint256 amountToken1 = reserve1 * liquidity / IUniswapV2Pair(pair).totalSupply() * slippagePercentMultiplier / 10000;

        IUniswapV2Router02(router).removeLiquidity(
            token0,
            token1,

            liquidity,

            amountToken0,
            amountToken1,

            address(this),
            block.timestamp + deadlineSeconds
        );
    }

    function stakeTokens() public onlyRole(TRADER_ROLE) override {
        uint256 lpTokens = IERC20(pair).balanceOf(address(this));
        if (lpTokens == 0) {
            return;
        }

        masterChef.deposit(poolId, lpTokens, address(this));
    }

    function unstakeTokens(uint256 amount) public onlyRole(TRADER_ROLE) override {
        masterChef.withdraw(poolId, amount, address(this));
    }

    function harvest() public onlyRole(TRADER_ROLE) override {
        masterChef.harvest(poolId, address(this));
    }

    function invest() public onlyRole(TRADER_ROLE) whenNotPaused override {
        uint256 liquidityAdded = addLiquidity();
        stakeTokens();

        _mint(msg.sender, liquidityAdded);
    }

    function withdraw(uint256 amount) public onlyRole(TRADER_ROLE) override {
        uint256 lpAmount = lpBalance() * amount / totalSupply();

        unstakeTokens(lpAmount);
        removeLiquidity(lpAmount);

        _burn(msg.sender, amount);
    }

    function emergencyWithdraw() public onlyRole(TRADER_ROLE) override {
        masterChef.emergencyWithdraw(poolId, address(this));

        uint256 lpTokens = IERC20(pair).balanceOf(address(this));

        removeLiquidity(lpTokens);

        _burn(msg.sender, totalSupply());
    }

    function lpBalance() public view override returns (uint256) {
        (uint256 amount, ) = masterChef.userInfo(poolId, address(this));
        return amount;
    }
}
