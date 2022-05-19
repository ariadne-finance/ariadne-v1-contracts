// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

interface IZapDepositer {
    function add_liquidity(address _pool, uint256[4] memory _deposit_amounts, uint256 _min_mint_amount) external returns (uint256);
    function remove_liquidity_one_coin(address _pool, uint256 _burn_amount, int128 i, uint256 _min_amount) external;
}
