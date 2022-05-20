// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";

import "./BFarmBase.sol";
import "./interfaces/IEllipsisLpStaking.sol";
import "./interfaces/IZapDepositer.sol";
import "./interfaces/IStableSwapPool.sol";
import "./interfaces/IEllipsisRewardsToken.sol";

/**
@notice Actual implementation of a Ariadne farm that has an underlying Ellipsis stable pool.

Please see `BFarmBase` docs.

Note: method `transferAndInvest()` has different arguments in this contract.
*/

contract BFarmEllipsis is BFarmBase {
    using SafeERC20 for IERC20;

    IStableSwapPool public pool = IStableSwapPool(0xC2cF01F785C587645440ccD488B188945C9505e7);
    IZapDepositer public zapDepositer = IZapDepositer(0xB15bb89ed07D2949dfee504523a6A12F90117d18);
    IEllipsisLpStaking public ellipsisLpStaking = IEllipsisLpStaking(0x5B74C99AA2356B4eAa7B85dC486843eDff8Dfdbe);

    address[4] public COIN = [
        0xd17479997F34dd9156Deef8F95A52D81D265be9c, // USDD
        0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56, // BUSD
        0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d, // USDC
        0x55d398326f99059fF775485246999027B3197955  // USDT
    ];

    constructor() BFarmBase("ellipsis.finance Decentralized USD / 3EPS", "ALP") {
        IERC20(COIN[0]).approve(address(zapDepositer), 2**256-1);
        IERC20(COIN[1]).approve(address(zapDepositer), 2**256-1);
        IERC20(COIN[2]).approve(address(zapDepositer), 2**256-1);
        IERC20(COIN[3]).approve(address(zapDepositer), 2**256-1);

        address lpToken = pool.lp_token();

        IERC20(lpToken).approve(address(ellipsisLpStaking), 2**256-1);
        IERC20(lpToken).approve(address(zapDepositer), 2**256-1);

        _decimals = IERC20Metadata(lpToken).decimals();
    }

    function lpBalance() public view override returns (uint256) {
        (uint256 depositAmount, , , ) = ellipsisLpStaking.userInfo(pool.lp_token(), address(this));
        return depositAmount;
    }

    function invest() public onlyRole(TRADER_ROLE) whenNotPaused override {
        uint256 liquidityAdded = addLiquidity();
        stakeTokens();

        _mint(msg.sender, liquidityAdded);
    }

    function addLiquidity() public override onlyRole(TRADER_ROLE) returns (uint256) {
        return zapDepositer.add_liquidity(
            address(pool),
            [
                IERC20(COIN[0]).balanceOf(address(this)),
                IERC20(COIN[1]).balanceOf(address(this)),
                IERC20(COIN[2]).balanceOf(address(this)),
                IERC20(COIN[3]).balanceOf(address(this))
            ],
            0
        );
    }

    function stakeTokens() public onlyRole(TRADER_ROLE) override {
        ellipsisLpStaking.deposit(pool.lp_token(), IERC20(pool.lp_token()).balanceOf(address(this)), false);
    }

    function transferAndInvest(uint256[] memory amounts) public onlyRole(TRADER_ROLE) whenNotPaused {
        for (uint256 i=0; i<COIN.length; i++) {
            if (amounts[i] > 0) {
                IERC20(COIN[i]).safeTransferFrom(msg.sender, address(this), amounts[i]);
            }
        }

        invest();
    }

    function unstakeTokens(uint256 amount) public onlyRole(TRADER_ROLE) override {
        ellipsisLpStaking.withdraw(pool.lp_token(), amount, false);
    }

    function removeLiquidity(uint256 liquidity) public override onlyRole(TRADER_ROLE) {
        zapDepositer.remove_liquidity_one_coin(address(pool), liquidity, 3, 0);
    }

    function harvest() public onlyRole(TRADER_ROLE) override {
        address[] memory tokens = new address[](1);
        tokens[0] = pool.lp_token();
        ellipsisLpStaking.claim(address(this), tokens);
        IEllipsisRewardsToken(pool.lp_token()).getReward();
    }

    function withdraw(uint256 amount) public onlyRole(TRADER_ROLE) override {
        uint256 lpAmount = lpBalance() * amount / totalSupply();

        unstakeTokens(lpAmount);
        removeLiquidity(lpAmount);

        _burn(msg.sender, amount);
    }

    function withdrawAndCollect(uint256 amount) public onlyRole(TRADER_ROLE) {
        withdraw(amount);

        collectToken(COIN[3], msg.sender);
    }
}
