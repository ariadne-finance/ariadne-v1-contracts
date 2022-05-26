// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

import "./BFarmUniswapBase.sol";

/**
@notice Actual implementation of a Ariadne farm that has an underlying Uniswap-compatible LP pool with no staking.

Please see `BFarmBase` and `BFarmUniswapBase` docs.
*/
contract BFarmUniswap is BFarmUniswapBase {
    constructor(
        address routerAddress,
        address token0Address,
        address token1Address,
        string memory name,
        string memory symbol,
        address admin,
        address manager,
        address trader
    ) BFarmUniswapBase(
        routerAddress,
        token0Address,
        token1Address,
        name,
        symbol,
        admin,
        manager,
        trader
    ) {}

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

    function invest() public onlyRole(TRADER_ROLE) whenNotPaused override {
        uint256 liquidityAdded = addLiquidity();
        _mint(msg.sender, liquidityAdded); // sender has TRADER_ROLE
    }

    function withdraw(uint256 amount) public onlyRole(TRADER_ROLE) override {
        uint256 lpAmountToRemove = lpBalance() * amount / totalSupply();
        removeLiquidity(lpAmountToRemove);
        _burn(msg.sender, amount); // sender has TRADER_ROLE
    }

    function lpBalance() public view override returns (uint256) {
        return IERC20(pair).balanceOf(address(this));
    }
}
