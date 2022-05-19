// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

interface IStableSwapPool {
    function lp_token() external view returns (address);
    function get_virtual_price() external view returns (uint256);
    function balances(uint256 i) external view returns (uint256);
}
