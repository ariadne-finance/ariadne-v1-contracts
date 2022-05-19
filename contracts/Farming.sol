// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

uint256 constant ACC_INCENT_PRECISION = 1e12;

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

    // this method is to be called every time incent token has been transferred to this contract
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
