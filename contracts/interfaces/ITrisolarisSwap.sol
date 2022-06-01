// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

interface ITrisolarisSwap {
    function addLiquidity(uint256[] calldata amounts, uint256 minToMint, uint256 deadline) external returns (uint256);
    function removeLiquidity(uint256 amount, uint256[] calldata minAmounts, uint256 deadline) external returns (uint256[] memory);
    function removeLiquidityOneToken(uint256 tokenAmount, uint8 tokenIndex, uint256 minAmount, uint256 deadline) external returns (uint256);
    function getToken(uint8 index) view external returns (address);
    function getVirtualPrice() view external returns (uint256);
}
