// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import "./BFarmTriStableSwap.sol";

contract HelperAuroraTrisolarisTriStableSwap01 is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public tri = IERC20(0xFa94348467f64D5A457F75F8bc40495D33c65aBB);
    IERC20 public aurora = IERC20(0x8BEc47865aDe3B172A928df8f990Bc7f2A3b9f79);
    IERC20 public usdt = IERC20(0x4988a896b1227218e4A686fdE5EabdcAbd91571f);
    IERC20 public near = IERC20(0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d);

    BFarmTriStableSwap public immutable bFarm;

    IUniswapV2Router02 router = IUniswapV2Router02(0x2CB45Edb4517d5947aFdE3BEAbF95A582506858B);

    event Harvest(uint256 liquidityAdded, uint256 usdtCompoundedAmount, uint256 triCollectedAmount, uint256 triRewardAmount, uint256 auroraCollectedAmount);

    constructor(address payable _bFarm) {
        bFarm = BFarmTriStableSwap(_bFarm);
    }

    function swap(address from, address to, uint256 amount) internal returns (uint256) {
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

    function swapVia(address from, address via, address to, uint256 amount) internal returns (uint256) {
        uint256 allowance = IERC20(from).allowance(address(this), address(router));
        if (allowance == 0) {
            IERC20(from).approve(address(router), 2**256-1);
        }

        address[] memory path = new address[](3);
        path[0] = from;
        path[1] = via;
        path[2] = to;

        uint256[] memory amountsOut = router.swapExactTokensForTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp + 300
        );

        return amountsOut[2];
    }

    function collectTriAndAurora() internal returns (uint256 triAmount, uint256 auroraAmount) {
        address[] memory collectTokensAddressList = new address[](2);
        collectTokensAddressList[0] = address(tri);
        collectTokensAddressList[1] = address(aurora);

        uint256 triBalanceBefore = tri.balanceOf(address(this));
        uint256 auroraBalanceBefore = aurora.balanceOf(address(this));

        bFarm.collectTokens(collectTokensAddressList, address(this));

        triAmount = tri.balanceOf(address(this)) - triBalanceBefore;
        auroraAmount = aurora.balanceOf(address(this)) - auroraBalanceBefore;
    }

    function harvest(uint256 triRewardAmount, address rewarder) public onlyOwner {
        bFarm.harvest();

        (uint256 triCollectedAmount, uint256 auroraCollectedAmount) = collectTriAndAurora();

        if (triRewardAmount > 0) {
            tri.transferFrom(rewarder, address(this), triRewardAmount);
        }

        uint256 triUsdtAmount = 0;

        uint triAmount = triRewardAmount + triCollectedAmount;
        if (triAmount > 0) {
            triUsdtAmount = swap(address(tri), address(usdt), triAmount);
        }

        uint256 auroraUsdtAmount = 0;
        if (auroraCollectedAmount > 0) {
            auroraUsdtAmount = swapVia(address(aurora), address(near), address(usdt), auroraCollectedAmount);
        }

        uint256 liquidityAdded = 0;

        uint256 usdtCompoundedAmount = triUsdtAmount + auroraUsdtAmount;
        if (usdtCompoundedAmount > 0) {
            usdt.transfer(address(bFarm), usdtCompoundedAmount);
            liquidityAdded = bFarm.addLiquidity();
            bFarm.stakeTokens();
        }

        emit Harvest(liquidityAdded, usdtCompoundedAmount, triCollectedAmount, triRewardAmount, auroraCollectedAmount);
    }

    function shutdown(address to) public onlyOwner {
        selfdestruct(payable(to));
    }
}
