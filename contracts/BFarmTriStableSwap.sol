// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";

import "./BFarmBase.sol";
import "./interfaces/ITrisolarisSwap.sol";

/**
@notice Actual implementation of a Ariadne farm that has an underlying Trisolaris StableSwap pool

Please see `BFarmBase` docs.

Note: method `transferAndInvest()` has different arguments in this contract.
*/

contract BFarmTriStableSwap is BFarmBase {
    using SafeERC20 for IERC20;

    /// @notice Deadline in seconds for `swap*` methods of router
    uint32 public deadlineSeconds = 180 seconds;

    uint8 public TOKENS_COUNT = 3; // Why is that information not available in Swap contract?

    ITrisolarisSwap public swap = ITrisolarisSwap(0x458459E48dbAC0C8Ca83F8D0b7b29FEfE60c3970);
    IERC20 public lpToken = IERC20(0x87BCC091d0A7F9352728100268Ac8D25729113bB);

    constructor(
        address admin,
        address manager,
        address trader
    ) BFarmBase(
        "Trisolaris USDC/USDT/USN",
        "ALP",
        admin,
        manager,
        trader
    ) {
        for (uint8 i=0; i<TOKENS_COUNT; i++) {
            IERC20(swap.getToken(i)).approve(address(swap), 2**256-1);
        }

        lpToken.approve(address(swap), 2**256-1);

        _decimals = IERC20Metadata(address(lpToken)).decimals();
    }

    function lpBalance() public view override returns (uint256) {
        return lpToken.balanceOf(address(this));
    }

    function invest() public onlyRole(TRADER_ROLE) whenNotPaused override {
        uint256 liquidityAdded = addLiquidity();
        _mint(msg.sender, liquidityAdded);
    }

    function getToken(uint8 index) public view returns (address) {
        return swap.getToken(index);
    }

    function getVirtualPrice() public view returns (uint256) {
        return swap.getVirtualPrice();
    }

    function addLiquidity() public override onlyRole(TRADER_ROLE) returns (uint256) {
        uint256[] memory amounts = new uint256[](TOKENS_COUNT);
        for (uint8 i=0; i<TOKENS_COUNT; i++) {
            amounts[i] = IERC20(swap.getToken(i)).balanceOf(address(this));
        }

        return swap.addLiquidity(amounts, 0, (block.timestamp + deadlineSeconds) * 1000);
    }

    function transferAndInvest(uint256[] memory amounts) public onlyRole(TRADER_ROLE) whenNotPaused {
        for (uint8 i=0; i<TOKENS_COUNT; i++) {
            if (amounts[i] > 0) {
                IERC20(swap.getToken(i)).safeTransferFrom(msg.sender, address(this), amounts[i]);
            }
        }

        invest();
    }

    function removeLiquidity(uint256 liquidity) public override onlyRole(TRADER_ROLE) {
        swap.removeLiquidityOneToken(liquidity, 1, 0, (block.timestamp + deadlineSeconds) * 1000);
    }

    function harvest() public onlyRole(TRADER_ROLE) override { }

    function withdraw(uint256 amount) public onlyRole(TRADER_ROLE) override {
        uint256 lpAmount = lpBalance() * amount / totalSupply();
        removeLiquidity(lpAmount);
        _burn(msg.sender, amount);
    }

    function withdrawAndCollect(uint256 amount) public onlyRole(TRADER_ROLE) {
        withdraw(amount);
        for (uint8 i=0; i<TOKENS_COUNT; i++) {
            collectToken(swap.getToken(i), msg.sender);
        }
    }

    /// @notice Admin method
    /// @dev only `MANAGER_ROLE` can call this
    function setDeadlineSeconds(uint32 _deadlineSeconds) public onlyRole(MANAGER_ROLE) {
        deadlineSeconds = _deadlineSeconds;
    }
}
