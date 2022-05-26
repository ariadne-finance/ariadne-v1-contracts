// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

import "./BFarmBase.sol";

/// @notice Base contract for an Ariadne farm that has an underlying Uniswap-compatible LP pool.

abstract contract BFarmUniswapBase is BFarmBase {
    using SafeERC20 for IERC20;

    /// @notice Deadline in seconds for `swap*` methods of router
    uint32 public deadlineSeconds = 180 seconds;

    /// @notice Slippage allowed for `swap*` methods of router. Represented in 1/10,000th fraction of percent. I.e. `9900` = 1% slippage.
    uint16 public slippagePercentMultiplier = 0;

    /// @notice token0 of the underlying uniswap pair
    address public immutable token0;

    /// @notice token1 of the underlying uniswap pair
    address public immutable token1;

    /// @notice underlying uniswap pair contract address
    address public pair;

    /// @notice uniswap router
    address public router;

    /// @param routerAddress uniswap router address
    /// @param token0Address uniswap pair token0 address
    /// @param token1Address uniswap pair token1 address
    /// @param name BFarm ERC20 name
    /// @param symbol BFarm ERC20 symbol
    /// @param admin DEFAULT_ADMIN_ROLE address
    /// @param manager MANAGER_ROLE address
    /// @param trader TRADER_ROLE address
    constructor(
        address routerAddress,
        address token0Address,
        address token1Address,
        string memory name,
        string memory symbol,
        address admin,
        address manager,
        address trader
    ) BFarmBase(
        name,
        symbol,
        admin,
        manager,
        trader
    ) {
        router = routerAddress;

        pair = IUniswapV2Factory(IUniswapV2Router02(router).factory()).getPair(token0Address, token1Address);

        _decimals = IERC20Metadata(pair).decimals();

        token1 = IUniswapV2Pair(pair).token1();
        token0 = IUniswapV2Pair(pair).token0();

        IERC20(token0Address).safeApprove(router, 2**256-1);
        IERC20(token1Address).safeApprove(router, 2**256-1);
        IERC20(pair).approve(router, 2**256-1);
    }

    /// @notice Admin method
    /// @dev only `MANAGER_ROLE` can call this
    function setDeadlineSeconds(uint32 _deadlineSeconds) public onlyRole(MANAGER_ROLE) {
        deadlineSeconds = _deadlineSeconds;
    }

    /// @notice Admin method
    /// @dev only `MANAGER_ROLE` can call this
    function setRouter(address routerAddress) public onlyRole(MANAGER_ROLE) {
        router = routerAddress;
    }

    /// @notice Admin method
    /// @dev only `MANAGER_ROLE` can call this
    function setSlippagePercentMultiplier(uint16 _slippagePercentMultiplier) public onlyRole(MANAGER_ROLE) {
        slippagePercentMultiplier = _slippagePercentMultiplier;
    }

    /// @notice Shorthand for a multitude of token `.transfer()`s followed by `.invest()`. Will transfer the specified amounts from token0 and token1 to this contract, then execute invest.
    /// @param amountToken0 amount of token0
    /// @param amountToken1 amount of token1
    /// @dev only `TRADER_ROLE` can call this
    function transferAndInvest(uint256 amountToken0, uint256 amountToken1) public onlyRole(TRADER_ROLE) whenNotPaused {
        require(amountToken0 > 0, "amount0");
        require(amountToken1 > 0, "amount1");

        IERC20(token0).safeTransferFrom(msg.sender, address(this), amountToken0);
        IERC20(token1).safeTransferFrom(msg.sender, address(this), amountToken1);

        invest();
    }

    /// @notice Shorthand for a `.withdraw()` followed by `.collectTokens()`. Will withdraw the specified amount then transfer tokens to sender.
    /// @param amount amount of BFarm to burn
    /// @dev only `TRADER_ROLE` can call this
    function withdrawAndCollect(uint256 amount) public onlyRole(TRADER_ROLE) {
        withdraw(amount);

        collectToken(token0, msg.sender);
        collectToken(token1, msg.sender);
    }
}
