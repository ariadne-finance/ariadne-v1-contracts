// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

uint256 constant ACC_INCENT_PRECISION = 1e12;

/**
@notice Farming contract for Ariadne `BFarm` tokens.

This is a clone of SushiBar modified to emit reward in a different token than the one being staked.

Despite being an ERC20 token it is not transferrable between addresses because of the `rewardDebt` structure.

Also see `onIncent()` method which recalculates reward amounts on this contract after every incent token transfer.
*/

contract Farming is ERC20, Ownable {
    IERC20 public immutable baseToken;
    IERC20 public immutable rewardToken;

    mapping (address => uint256) public rewardDebt;
    uint256 public accIncentPerShare = 0;

    constructor(IERC20 _baseToken, IERC20 _rewardToken, string memory name, string memory symbol) ERC20(name, symbol) {
        baseToken = _baseToken;
        rewardToken = _rewardToken;
    }

    function enter(uint256 amount) public {
        require(amount > 0, "zero");

        rewardDebt[msg.sender] += uint256(amount * accIncentPerShare / ACC_INCENT_PRECISION);

        _mint(msg.sender, amount);

        baseToken.transferFrom(msg.sender, address(this), amount);
    }

    function leave() public {
        uint256 shares = balanceOf(msg.sender);
        require(shares > 0, "zero");

        uint256 _rewardAmount = rewardAmount(msg.sender);

        _burn(msg.sender, shares);
        baseToken.transfer(msg.sender, shares);

        if (_rewardAmount > 0) {
            rewardToken.transfer(msg.sender, _rewardAmount);
        }

        rewardDebt[msg.sender] = 0;
    }

    function rewardAmount(address account) public view returns (uint256) {
        return uint256(accIncentPerShare * balanceOf(account) / ACC_INCENT_PRECISION) - rewardDebt[account];
    }

    // FIXME replace with approval and .transferFrom() in a single transaction

    /// @notice Admin method. It must be called after every transfer of `rewardToken` to this contract.
    /// @param amount amount of `rewardToken` that has just been transferred
    /// @dev only owner can call this.
    function onIncent(uint256 amount) public onlyOwner {
        require(amount > 0, "zero");

        if (totalSupply() == 0) {
            return;
        }

        accIncentPerShare += uint256(ACC_INCENT_PRECISION * amount / totalSupply());
    }

    function _beforeTokenTransfer(address from, address to, uint256) internal pure override {
        require(from == address(0) || to == address(0), "TRANSFERS_NOT_ALLOWED");
    }
}
