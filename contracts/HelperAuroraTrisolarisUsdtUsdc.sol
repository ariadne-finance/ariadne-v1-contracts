// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import "./BFarmSushiswap.sol";

contract HelperAuroraTrisolarisUsdtUsdc is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public tri = IERC20(0xFa94348467f64D5A457F75F8bc40495D33c65aBB);
    BFarmSushiswap public immutable bFarm;

    event Harvest(uint256 liquidityAdded, uint256 usdtHarvestedAmount, uint256 usdtRewardAmount);

    constructor(address payable _bFarm) {
        bFarm = BFarmSushiswap(_bFarm);
    }

    function collectTri() internal returns (uint256) {
        address[] memory collectTokensAddressList = new address[](1);
        collectTokensAddressList[0] = address(tri);

        uint256 triBalanceBefore = tri.balanceOf(address(this));

        bFarm.collectTokens(collectTokensAddressList, address(this));

        uint256 triBalanceAfter = tri.balanceOf(address(this));

        return triBalanceAfter - triBalanceBefore;
    }

    function swapTriToUsdt(uint256 triBalanceCollected) internal returns (uint256) {
        return swap(address(tri), bFarm.token0(), triBalanceCollected);
    }

    function swapUsdtToUsdc(uint256 amount) internal returns (uint256) {
        return swap(bFarm.token0(), bFarm.token1(), amount);
    }

    function swap(address from, address to, uint256 amount) internal returns (uint256) {
        IUniswapV2Router02 router = IUniswapV2Router02(bFarm.router());

        uint256 allowance = IERC20(from).allowance(address(this), address(router));
        if (allowance == 0) {
            IERC20(from).approve(address(router), 2**256-1);
        }

        address[] memory path = new address[](2);
        path[0] = from;
        path[1] = to;

        uint256[] memory amountsOut = router.swapExactTokensForTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp + 300
        );

        return amountsOut[1];
    }

    function harvest(uint256 boostingPercent1000, address rewarder) public onlyOwner {
        bFarm.harvest();

        uint256 triBalanceCollected = collectTri();
        if (triBalanceCollected == 0) {
            emit Harvest(0, 0, 0);
            return;
        }

        uint256 usdtHarvestedAmount = swapTriToUsdt(triBalanceCollected);

        IERC20 usdt = IERC20(bFarm.token0());
        IERC20 usdc = IERC20(bFarm.token1());

        uint256 usdtRewardAmount = usdtHarvestedAmount * boostingPercent1000 / 1000 / 100;

        if (usdtRewardAmount > 0) {
            usdt.transferFrom(rewarder, address(this), usdtRewardAmount);
        }

        uint256 usdtAmountTotal = usdtHarvestedAmount + usdtRewardAmount;
        if (usdtAmountTotal <= 2) {
            emit Harvest(0, 0, 0);
            return;
        }

        uint256 usdtAmountHalf = usdtAmountTotal / 2 - 1;

        uint256 usdcAmountAfterSwap = swapUsdtToUsdc(usdtAmountHalf);

        usdt.transfer(address(bFarm), usdtAmountTotal - usdtAmountHalf);
        usdc.transfer(address(bFarm), usdcAmountAfterSwap);

        uint256 liquidityAdded = bFarm.addLiquidity();

        bFarm.stakeTokens();

        emit Harvest(liquidityAdded, usdtHarvestedAmount, usdtRewardAmount);
    }
}
