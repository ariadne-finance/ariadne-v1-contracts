// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

uint256 constant UNLOCKED_TRANSACTIONS_RING_SIZE = 20;

/**
@notice Lock vault for BFarm tokens bridged to extranet
*/
contract Bridge is AccessControlEnumerable {
    /// @notice This role can change farm settings
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    /// @notice This role can actually manage and bridge liquidity
    bytes32 public constant TRADER_ROLE = keccak256("TRADER_ROLE");

    using SafeERC20 for IERC20;

    /// @notice What network is this bridge for.
    uint256 public extranetChainId;

    /// @notice What BFarm is this bridge for.
    IERC20 public farmAddress;

    /// @notice Only `lock()`s are paused when this is true
    bool public paused = false; // FIXME rename to isPaused with a separate commit

    /// @notice List of ExtranetTokenQueued `burn()` transaction hashes, used to prevent accidental double `unlock()`s.  It is a ring buffer.
    bytes32[] public unlockedTransactions;

    /// @notice Position of the last element in a ring buffer.
    uint8 private unlockedTransactionsPos;

    /// @notice Emitted on `lock()`.
    event BridgeLock(uint256 amount);

    constructor(uint256 _extranetChainId, address _farmAddress) {
        extranetChainId = _extranetChainId;
        farmAddress = IERC20(_farmAddress);

        unlockedTransactionsPos = 0;
        unlockedTransactions = new bytes32[](UNLOCKED_TRANSACTIONS_RING_SIZE);

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Total BFarm amount locked on this bridge.
    /// @return BFarm amount locked
    function lockedAmount() public view returns (uint256) {
        return farmAddress.balanceOf(address(this));
    }

    /// @notice Transfer BFarm amount from sender to this bridge and emit `BridgeLock` event.
    /// @param farmAmount BFarm amount owner by sender to lock on the bridge.
    /// @dev It's a public method, although no one should want to call this, as refund is not possible.
    function lock(uint256 farmAmount) public {
        require(!paused, "paused");
        farmAddress.safeTransferFrom(msg.sender, address(this), farmAmount);
        emit BridgeLock(farmAmount);
    }

    /// @notice Return BFarm amount to sender. This will only succeed if `extranetTx` is unique, which is a crude
    /// protection against accidental double unlock.
    /// @param farmAmount BFarm amount to unlock and return to sender
    /// @param extranetTx tx hash of `burn()` call on ExtranetTokenQueue. Must be unique.
    /// @dev only `TRADER_ROLE` can call this
    function unlock(uint256 farmAmount, bytes32 extranetTx) public onlyRole(TRADER_ROLE) uniqueTx(extranetTx) {
        farmAddress.safeTransfer(msg.sender, farmAmount);
    }

    /// @notice Admin method
    /// @dev only `MANAGER_ROLE` can call this
    function pause() public onlyRole(MANAGER_ROLE) {
        paused = true;
    }

    /// @notice Admin method
    /// @dev only `MANAGER_ROLE` can call this
    function unpause() public onlyRole(MANAGER_ROLE) {
        paused = false;
    }

    /// @notice Admin method
    /// @dev only `MANAGER_ROLE` can call this
    function setExtranetChainId(uint256 _extranetChainId) public onlyRole(MANAGER_ROLE) {
        extranetChainId = _extranetChainId;
    }

    /// @notice Admin method
    /// @dev only `MANAGER_ROLE` can call this
    function setFarmAddress(address _farmAddress) public onlyRole(MANAGER_ROLE) {
        farmAddress = IERC20(_farmAddress);
    }

    modifier uniqueTx(bytes32 _tx) {
        for (uint8 i=0; i<UNLOCKED_TRANSACTIONS_RING_SIZE; i++) {
            if (unlockedTransactions[i] == _tx) {
                revert("tx already minted");
            }
        }

        unlockedTransactions[unlockedTransactionsPos] = _tx;

        unlockedTransactionsPos++;

        if (unlockedTransactionsPos == UNLOCKED_TRANSACTIONS_RING_SIZE) {
            unlockedTransactionsPos = 0;
        }

        _;
    }

    /// @notice Admin method. Will only `selfdestruct` if `lockedAmount()` == 0
    /// @dev only `MANAGER_ROLE` can call this
    function shutdown(address to) public onlyRole(MANAGER_ROLE) {
        require(lockedAmount() == 0, "lockedAmount");
        selfdestruct(payable(to));
    }
}
