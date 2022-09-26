// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import "./BFarmTriStableSwap.sol";

contract HelperAuroraTrisolarisTriStableSwap02 is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable tri = IERC20(0xFa94348467f64D5A457F75F8bc40495D33c65aBB);
    IERC20 public immutable aurora = IERC20(0x8BEc47865aDe3B172A928df8f990Bc7f2A3b9f79);
    IERC20 public immutable usdt = IERC20(0x4988a896b1227218e4A686fdE5EabdcAbd91571f);
    IERC20 public immutable near = IERC20(0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d);
    IUniswapV2Router02 public immutable router = IUniswapV2Router02(0x2CB45Edb4517d5947aFdE3BEAbF95A582506858B);

    BFarmTriStableSwap public immutable bFarm;

    uint32 public immutable harvestInterval = 86100; // one day less five minutes
    uint32 public harvestLastTimestamp;

    event Harvest(uint256 liquidityAdded, uint256 usdtCompoundedAmount, uint256 triCollectedAmount, uint256 auroraCollectedAmount);

    constructor(address payable _bFarm) {
        bFarm = BFarmTriStableSwap(_bFarm);
    }

    modifier onlyIfHarvestTimePassed() {
        require(block.timestamp - harvestLastTimestamp >= harvestInterval, "HARVEST_INTERVAL"); // solhint-disable-line not-rely-on-time
        _;
    }

    function swap(address from, address to, uint256 amount) internal returns (uint256) {
        uint256 allowance = IERC20(from).allowance(address(this), address(router));
        if (allowance < amount) {
            IERC20(from).approve(address(router), amount);
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
        if (allowance < amount) {
            IERC20(from).approve(address(router), amount);
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

    function harvest() public onlyIfHarvestTimePassed {
        bFarm.harvest();

        (uint256 triCollectedAmount, uint256 auroraCollectedAmount) = collectTriAndAurora();

        uint256 triUsdtAmount = 0;
        if (triCollectedAmount > 0) {
            triUsdtAmount = swap(address(tri), address(usdt), triCollectedAmount);
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

        emit Harvest(liquidityAdded, usdtCompoundedAmount, triCollectedAmount, auroraCollectedAmount);

        harvestLastTimestamp = uint32(block.timestamp);
    }

    function shutdown(address to) public onlyOwner {
        selfdestruct(payable(to));
    }
}
