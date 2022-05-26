// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

/**
@notice Base contract for an Ariadne farm. Main methods to look at are `invest()`, `withdraw()` and `lpBalance()`.
None of these methods are publicly executable.

This contract is itself an ERC20 token but not readily useable, as only addresses with `TRADER_ROLE` can call actual trading methods.
We use ERC20 as a way to represent fractions of `totalSupply` as they are split between various `Bridge`s.

However this token is 1:1 bridged to extranets where it is held by customers. Although we don't show this token and it's amount anywhere
on the web, calculating the USDT amount instead.
*/

abstract contract BFarmBase is ERC20, AccessControlEnumerable {
    /// @notice This role can change farm settings.
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    /// @notice This role can actually manage liquidity.
    bytes32 public constant TRADER_ROLE = keccak256("TRADER_ROLE");

    using SafeERC20 for IERC20;

    /// @notice BFarm always has the same decimals() as the underlying farm LP token.
    uint8 internal _decimals = 18;

    /// @notice Only investments are disabled when this is true.
    bool public isPaused = false;

    /**
     * @notice Neither the name or the symbol are used anywhere on the web.
     * @param name ERC20 name
     * @param symbol ERC20 symbol
     * @param admin DEFAULT_ADMIN_ROLE address
     * @param manager MANAGER_ROLE address
     * @param trader TRADER_ROLE address
     */
    constructor(
        string memory name,
        string memory symbol,
        address admin,
        address manager,
        address trader
    ) ERC20(
        name,
        symbol
    ) {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MANAGER_ROLE, manager);
        _setupRole(TRADER_ROLE, trader);
    }

    modifier whenNotPaused {
        require(!isPaused, "paused");
        _;
    }

    modifier whenPaused {
        require(isPaused, "not_paused");
        _;
    }

    receive() external payable { }

    /// @notice BFarm always has the same decimals() as the underlying farm LP token.
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Invest all underlying tokens present on the contract's balance into the underlying farm.
     * This method mints BFarm tokens to `msg.sender`.
     * @dev only `TRADER_ROLE` can call this
     */
    function invest() public onlyRole(TRADER_ROLE) whenNotPaused virtual {}

    /**
     * @notice Burn `amount` BFarm tokens from sender and withdraw the corresponding amount of liquidity from the underlying farm.
     * Call `collectTokens()` afterwards to collect withdrawn tokens to sender.
     * @param amount BFarm token amounts to burn
     * @dev only `TRADER_ROLE` can call this
     */
    function withdraw(uint256 amount) public onlyRole(TRADER_ROLE) virtual {}

    /// @notice Withdraw all of the `msg.sender`'s balance in emergency mode, disregarding rewards. Not all farms implement this.
    /// @dev only `TRADER_ROLE` can call this
    function emergencyWithdraw() public onlyRole(TRADER_ROLE) virtual {}

    /// @notice Harvest rewards from the underlying farm to the BFarm contract.
    /// @dev only `TRADER_ROLE` can call this
    function harvest() public onlyRole(TRADER_ROLE) virtual {}

    /**
     * @notice Actually add liquidity to the underlying farm. Does NOT mint BFarm tokens.
     * This method is meant to be internal but declared public for harvesting and compounding reasons. I.e. when compounding
     * we want to increase our position in the underlying farm while keeping BFarm's totalSupply the same.
     * @return Underlying farm tokens minted
     * @dev only `TRADER_ROLE` can call this
     */
    function addLiquidity() public onlyRole(TRADER_ROLE) virtual returns (uint256) {}

    /**
     * @notice Remove the specified amount of underlying farm tokens while not burning any BFarm tokens.
     * This method is meant to be internal but declared public for harvesting and compounding reasons should they arise.
     * @param liquidity amount of underlying farm tokens to withdraw
     * @dev only `TRADER_ROLE` can call this
     */
    function removeLiquidity(uint256 liquidity) public onlyRole(TRADER_ROLE) virtual {}

    /// @notice Stake all unstaked underlying farm's tokens into a staking contract if present. Only used in stake-based farms (BFarmSushiswap, etc).
    function stakeTokens() public onlyRole(TRADER_ROLE) virtual {}

    /**
     * @notice Unstake `amount` of underlying farm's tokens from a staking contract if present. Only used in stake-based farms (BFarmSushiswap, etc).
     * @param amount underlying farm's amount to unstake
     */
    function unstakeTokens(uint256 amount) public onlyRole(TRADER_ROLE) virtual {}

    /// @notice Get underlying farm's LP tokens balance.
    /// @return LP tokens balance
    function lpBalance() public virtual view returns (uint256) {}

    /// @notice Admin method.
    /// @dev only `MANAGER_ROLE` can call this
    function pause() public onlyRole(MANAGER_ROLE) {
        isPaused = true;
    }

    /// @notice Admin method.
    /// @dev only `MANAGER_ROLE` can call this
    function unpause() public onlyRole(MANAGER_ROLE) {
        isPaused = false;
    }

    /// @notice Admin method. Executes `selfdestruct` on the contract.
    /// @param to selfdestruct argument, who will get all native tokens (ETH).
    /// @dev only `MANAGER_ROLE` can call this
    function shutdown(address to) public onlyRole(MANAGER_ROLE) whenPaused {
        selfdestruct(payable(to));
    }

    /// @notice Admin method. Collect all `tokens` from BFarm contract to `to`.
    /// @param tokens list of token addresses
    /// @param to recipient of the tokens
    /// @dev only `TRADER_ROLE` can call this
    function collectTokens(address[] memory tokens, address to) public onlyRole(TRADER_ROLE) {
        for (uint i=0; i<tokens.length; i++) {
            collectToken(tokens[i], to);
        }
    }

    /// @notice Admin method, internal implementation for `collectTokens()`.
    function collectToken(address tokenAddress, address to) internal {
        uint256 _balance = IERC20(tokenAddress).balanceOf(address(this));
        if (_balance == 0) {
            return;
        }

        IERC20(tokenAddress).safeTransfer(to, _balance);
    }
}
