// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

uint256 constant UNIQUE_TRANSACTIONS_RING_SIZE = 100;

uint256 constant DIVISION_PRECISION = 10**18;

/**
@notice Extranet token representing part in underlying farm on homenet. It is an ERC20 token that is 1:1 bridged with BFarm.
*/
contract ExtranetTokenQueued is ERC20, AccessControlEnumerable {
    /// @notice This role can change farm settings
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    /// @notice This role can actually manage and bridge liquidity
    bytes32 public constant TRADER_ROLE = keccak256("TRADER_ROLE");

    using SafeERC20 for IERC20;

    /// @notice correspnding bridge address on homenet
    address public bridgeAddress;

    /// @notice homenet chainId
    uint256 public bridgeChainId;

    /// @notice USDT address on the extranet
    address public quoteToken;

    /// @notice Address of withdrawal fee collector
    address public feeTo;

    /// @notice Withdrawal fee percent decimals
    uint8 public constant withdrawalFeePercentDecimals = 6;

    /// @notice Withdrawal fee percent
    uint256 public withdrawalFeePercent = 0;

    /// @notice Only investments are paused when this is true
    bool public isPaused = false;

    /// @notice List of Bridge `lock()` transaction hashes, used to prevent accidental double `mint()`s.  It is a ring buffer.
    bytes32[] public mintedTransactions;

    /// @notice Position of the last element in a ring buffer.
    uint8 private mintedTransactionsPos;

    /// @notice Extranet token always has the same `decimals()` as the underlying farm LP token on homenet.
    uint8 private immutable _decimals;

    // FIXME verify!! https://hackernoon.com/how-much-can-i-do-in-a-block-163q3xp2

    /// @notice Max count of elements in withdrawal or investment queues.
    uint16 public maxQueueSize = 100;

    /// @notice Min amount of USDT to invest.
    uint256 public minInvestmentQuoteTokenAmount;

    /// @notice Min amount of Extranet token to withdraw.
    uint256 public minWithdrawalExtranetTokenAmount;

    /// @notice Investment queue mapping.
    /// @dev It's a hash with enumeration, basically.
    mapping (address => uint256) public pendingInvestmentAmountByAddress;

    /// @notice Investment queue list of unique addresses
    /// @dev It's a hash with enumeration, basically.
    address[] public pendingInvestmentAddressList;

    /// @notice Accumulator of total USDT amount pending in investment queue.
    uint256 public pendingInvestmentTotalAmount;

    /// @notice Withdrawal queue mapping.
    /// @dev It's a hash with enumeration, basically.
    mapping (address => uint256) public pendingWithdrawalAmountByAddress;

    /// @notice Withdrawal queue list of unique addresses.
    /// @dev It's a hash with enumeration, basically.
    address[] public pendingWithdrawalAddressList;

    /// @notice Accumulator of total BFarm amount pending in withdrawal queue.
    uint256 public pendingWithdrawalTotalAmount;

    /// @notice Emitted on `burn()`.
    event BridgeBurn(uint256 amount);

    /// @notice Emitted on `mint()`.
    event BridgeMint(uint256 amount, bytes32 homenetTx);

    /// @notice Emmited on new investment, signaling that queue is non-empty.
    event PendingInvestment(address account, uint256 quoteTokenAmount, uint256 pendingInvestmentAddressListLength, uint256 pendingInvestmentTotalAmount);

    /// @notice Emmited on new withdrawal, signaling that queue is non-empty.
    event PendingWithdrawal(address account, uint256 extranetTokenAmount, uint256 pendingWithdrawalAddressListLength, uint256 pendingWithdrawalTotalAmount);

    /// @notice Name and symbol are not really shown anywhere.
    /// @param quoteTokenAddress address of USDT on extranet
    /// @param _bridgeAddress address of the Bridge on homenet
    /// @param _bridgeChainId chainId of homenet
    constructor(string memory name, string memory symbol, uint8 aFarmDecimals, address quoteTokenAddress, address _bridgeAddress, uint256 _bridgeChainId) ERC20(name, symbol) {
        quoteToken = quoteTokenAddress;
        bridgeAddress = _bridgeAddress;
        bridgeChainId = _bridgeChainId;

        _decimals = aFarmDecimals;

        mintedTransactionsPos = 0;
        mintedTransactions = new bytes32[](UNIQUE_TRANSACTIONS_RING_SIZE);

        feeTo = msg.sender;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Extranet token always has the same `decimals()` as the underlying farm LP token on homenet.
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    modifier uniqueTx(bytes32 _tx) {
        for (uint8 i=0; i<UNIQUE_TRANSACTIONS_RING_SIZE; i++) {
            if (mintedTransactions[i] == _tx) {
                revert("tx already minted");
            }
        }

        mintedTransactions[mintedTransactionsPos] = _tx;

        mintedTransactionsPos++;

        if (mintedTransactionsPos == UNIQUE_TRANSACTIONS_RING_SIZE) {
            mintedTransactionsPos = 0;
        }

        _;
    }

    modifier whenNotPaused() {
        require(!isPaused, "paused");
        _;
    }

    modifier whenPaused() {
        require(isPaused, "not_paused");
        _;
    }

    modifier withdrawalQueueNotFull() {
        require(pendingWithdrawalAddressList.length < maxQueueSize, "full");
        _;
    }

    modifier investmentQueueNotFull() {
        require(pendingInvestmentAddressList.length < maxQueueSize, "full");
        _;
    }

    modifier notExpired(uint32 deadline) {
        require(block.timestamp < deadline, "expired");
        _;
    }

    /// @notice Create supply of Extranet token. This is called by backend after the same amount has been `lock()`ed on the `Bridge`.
    /// @dev only `TRADER_ROLE` can call this
    function mint(uint256 amount, bytes32 homenetTx) public onlyRole(TRADER_ROLE) uniqueTx(homenetTx) {
        _mint(address(this), amount);
        emit BridgeMint(amount, homenetTx);
    }

    /// @notice Burn supply of Extranet token. This is called by backend and then the same amount is `unlock()`ed on the `Bridge`.
    /// @dev only `TRADER_ROLE` can call this
    function burn(uint256 amount) public onlyRole(TRADER_ROLE) {
        require(balanceOf(address(this)) >= amount, "balance");

        _burn(address(this), amount);
        emit BridgeBurn(amount);
    }

    /// @notice Queue lookup method
    function queueInfo() public view returns (
        uint256 withdrawalAddressListLength,
        uint256 withdrawalTotalAmount,

        uint256 investmentAddressListLength,
        uint256 investmentTotalAmount
    ) {
        withdrawalAddressListLength = pendingWithdrawalAddressList.length;
        withdrawalTotalAmount = pendingWithdrawalTotalAmount;

        investmentAddressListLength = pendingInvestmentAddressList.length;
        investmentTotalAmount = pendingInvestmentTotalAmount;
    }

    /// @notice Get list of all pending investment addresses
    /// @return list of unique addresses in investment queue
    function getPendingInvestmentAddressList() public view returns (address[] memory) {
        return pendingInvestmentAddressList;
    }

    /// @notice Get list of all pending withdrawal addresses
    /// @return list of unique addresses in withdrawal queue
    function getPendingWithdrawalAddressList() public view returns (address[] memory) {
        return pendingWithdrawalAddressList;
    }

    /// @notice Put `quoteTokenAmount` USDT into investment queue.
    /// @param quoteTokenAmount USDT amount to invest
    function invest(uint256 quoteTokenAmount) public whenNotPaused investmentQueueNotFull {
        require(quoteTokenAmount > 0, "zero");
        require(minInvestmentQuoteTokenAmount == 0 || quoteTokenAmount >= minInvestmentQuoteTokenAmount, "min");

        IERC20(quoteToken).safeTransferFrom(msg.sender, address(this), quoteTokenAmount);

        if (pendingInvestmentAmountByAddress[msg.sender] == 0) {
            pendingInvestmentAddressList.push(msg.sender);
        }

        pendingInvestmentAmountByAddress[msg.sender] += quoteTokenAmount;

        pendingInvestmentTotalAmount += quoteTokenAmount;

        emit PendingInvestment(msg.sender, quoteTokenAmount, pendingInvestmentAddressList.length, pendingInvestmentTotalAmount);
    }

    /// @notice Put `extranetTokenAmount` tokens into withdrawal queue.
    /// @param extranetTokenAmount ExtranetToken amount to withdraw
    function withdraw(uint256 extranetTokenAmount) public withdrawalQueueNotFull {
        require(extranetTokenAmount > 0, "zero");
        require(minWithdrawalExtranetTokenAmount == 0 || extranetTokenAmount >= minWithdrawalExtranetTokenAmount, "min");

        _transfer(msg.sender, address(this), extranetTokenAmount);

        if (pendingWithdrawalAmountByAddress[msg.sender] == 0) {
            pendingWithdrawalAddressList.push(msg.sender);
        }

        pendingWithdrawalAmountByAddress[msg.sender] += extranetTokenAmount;
        pendingWithdrawalTotalAmount += extranetTokenAmount;

        emit PendingWithdrawal(msg.sender, extranetTokenAmount, pendingWithdrawalAddressList.length, pendingWithdrawalTotalAmount);
    }

    /// @notice Admin method to withdraw someone's position.
    /// @param account Address to withdraw fully.
    /// @dev only `MANAGER_ROLE` can call this
    function withdrawForAddress(address account) public onlyRole(MANAGER_ROLE) withdrawalQueueNotFull {
        uint256 amount = balanceOf(account);
        require(amount > 0, "empty");

        _transfer(account, address(this), amount);

        if (pendingWithdrawalAmountByAddress[account] == 0) {
            pendingWithdrawalAddressList.push(account);
        }

        pendingWithdrawalAmountByAddress[account] += amount;
        pendingWithdrawalTotalAmount += amount;
    }

    /**
     * @notice Cancel my investment from queue and refund USDT. Can only be called by a customer.
     * Cancelation is only possible while USDT liquidity is still present on the contract and not yet bridged.
     * @param atIndex position of sender's address in pendingInvestmentAddressList
     */
    function cancelInvestment(uint256 atIndex) public {
        require(pendingInvestmentAddressList[atIndex] == msg.sender, "wrong_sender");
        _cancelInvestmentForAccountAtIndex(msg.sender, atIndex);
    }

    /**
     * @notice Admin method to cancel someone's investment from queue.
     * @param account Address to cancel
     * @param atIndex position of customer's address in pendingInvestmentAddressList
     * @dev only `MANAGER_ROLE` can call this
     */
    function cancelInvestmentForAccountAtIndex(address account, uint256 atIndex) public onlyRole(MANAGER_ROLE) {
        _cancelInvestmentForAccountAtIndex(account, atIndex);
    }

    /**
     * @notice Internal method implementing cancelation from investment queue.
     */
    function _cancelInvestmentForAccountAtIndex(address account, uint256 atIndex) internal {
        require(pendingInvestmentAddressList[atIndex] == account, "wrong_account");

        uint256 amount = pendingInvestmentAmountByAddress[account];
        require(amount > 0, "empty");

        delete pendingInvestmentAmountByAddress[account];

        if (pendingInvestmentAddressList.length == 1) {
            delete pendingInvestmentAddressList;

        } else {
            pendingInvestmentAddressList[atIndex] = pendingInvestmentAddressList[pendingInvestmentAddressList.length-1];
            pendingInvestmentAddressList.pop();
        }

        IERC20(quoteToken).safeTransfer(account, amount);
        pendingInvestmentTotalAmount -= amount;
    }

    /**
     * @notice Admin method to cancel some investments from queue when it's full.
     * @param count count of investments to refund from queue
     * @dev only `MANAGER_ROLE` can call this
     */
    function cancelTopInvestments(uint256 count) public onlyRole(MANAGER_ROLE) whenPaused {
        require(count < pendingInvestmentAddressList.length, "count");

        for (uint i=0; i<count; i++) {
            _cancelInvestmentForAccountAtIndex(pendingInvestmentAddressList[0], 0);
        }
    }

    /**
     * @notice Cancel my withdrawal from queue and refund Extranet tokens. Can only be called by a customer.
     * Cancelation is only possible while Extranet tokens are still present on the contract and not yet bridged.
     * @param atIndex position of sender's address in pendingWithdrawalAddressList
     */
    function cancelWithdrawal(uint256 atIndex) public {
        require(pendingWithdrawalAddressList[atIndex] == msg.sender, "wrong_sender");
        _cancelWithdrawalForAccountAtIndex(msg.sender, atIndex);
    }

    /**
     * @notice Admin method to cancel someone's withdrawal from queue.
     * @param account Address to cancel
     * @param atIndex position of customer's address in pendingWithdrawalAddressList
     * @dev only `MANAGER_ROLE` can call this
     */
    function cancelWithdrawalForAccountAtIndex(address account, uint256 atIndex) public onlyRole(MANAGER_ROLE) {
        _cancelWithdrawalForAccountAtIndex(account, atIndex);
    }

    /**
     * @notice Internal method implementing cancelation from withdrawal queue.
     */
    function _cancelWithdrawalForAccountAtIndex(address account, uint256 atIndex) internal {
        require(pendingWithdrawalAddressList[atIndex] == account, "wrong_account");

        uint256 amount = pendingWithdrawalAmountByAddress[account];
        require(amount > 0, "empty");

        delete pendingWithdrawalAmountByAddress[account];

        if (pendingWithdrawalAddressList.length == 1) {
            delete pendingWithdrawalAddressList;

        } else {
            pendingWithdrawalAddressList[atIndex] = pendingWithdrawalAddressList[pendingWithdrawalAddressList.length-1];
            pendingWithdrawalAddressList.pop();
        }

        _transfer(address(this), account, amount);
        pendingWithdrawalTotalAmount -= amount;
    }

    /**
     * @notice Admin method to cancel some withdrawals from queue when it's full.
     * @param count count of withdrawals to refund from queue
     * @dev only `MANAGER_ROLE` can call this
     */
    function cancelTopWithdrawals(uint256 count) public onlyRole(MANAGER_ROLE) {
        require(pendingWithdrawalAddressList.length > count, "count");

        for (uint i=0; i<count; i++) {
            _cancelWithdrawalForAccountAtIndex(pendingWithdrawalAddressList[0], 0);
        }
    }

    /**
     * @notice Internal method to distribute Extranet tokens on investment queue.
     * @param oneTokenCost cost of 1 Extranet token in USDT
     * @param upToExtranetTokenAmount stop once we reach this amount of Extranet token distributed
     */
    function sendoutInvestmentExtranetToken(uint256 oneTokenCost, uint256 upToExtranetTokenAmount) internal {
        uint256 sentExtranetTokenAmount = 0;

        do {
            address account = pendingInvestmentAddressList[pendingInvestmentAddressList.length-1];
            pendingInvestmentAddressList.pop();

            uint256 quoteTokenAmount = pendingInvestmentAmountByAddress[account];
            uint256 extranetTokenAmount = quoteTokenAmount * oneTokenCost / DIVISION_PRECISION;

            if (extranetTokenAmount == 0) { // is this possible for this to be zero?
                delete pendingInvestmentAmountByAddress[account];
                continue;
            }

            if (sentExtranetTokenAmount + extranetTokenAmount > upToExtranetTokenAmount) {
                pendingInvestmentAddressList.push(account);
                break;
            }

            _transfer(address(this), account, extranetTokenAmount);

            delete pendingInvestmentAmountByAddress[account];

            pendingInvestmentTotalAmount -= quoteTokenAmount;
            sentExtranetTokenAmount += extranetTokenAmount;
        } while (pendingInvestmentAddressList.length > 0);
    }

    /**
     * @notice Actually execute investment queue. Will distribute Extranet tokens among investors in queue according to supplied rate.
     * @param quoteTokenAmount rate variable
     * @param extranetTokenAmount rate variable
     * @param upToExtranetTokenAmount stop distribution of Extranet tokens at this amount. Required to prevent overflows
     * @param deadline the transaction must finish before `block.timestamp` reaches this time
     * @dev only `TRADER_ROLE` can call this
     */
    function runInvestmentQueue(uint256 quoteTokenAmount, uint256 extranetTokenAmount, uint256 upToExtranetTokenAmount, uint32 deadline) public onlyRole(TRADER_ROLE) notExpired(deadline) {
        require(quoteTokenAmount > 0, "zero");
        require(extranetTokenAmount > 0, "zero");

        require(pendingInvestmentAddressList.length > 0, "zero_addresses");
        require(pendingInvestmentTotalAmount > 0, "zero_amount");

        require(upToExtranetTokenAmount <= balanceOf(address(this)), "balance");

        uint256 oneTokenCost = extranetTokenAmount * DIVISION_PRECISION / quoteTokenAmount;

        sendoutInvestmentExtranetToken(oneTokenCost, upToExtranetTokenAmount);
    }

    /**
     * @notice Internal method to distribute USDT on withdrawal queue.
     * @param oneTokenCost cost of 1 Extranet token in USDT
     * @param upToQuoteTokenAmount stop once we reach this amount of USDT distributed
     */
    function sendoutWithdrawalQueueToken(uint256 oneTokenCost, uint256 upToQuoteTokenAmount) internal returns (uint256) {
        uint256 totalFeeAmount = 0;
        uint256 sentQueueTokenAmount = 0;

        do {
            address account = pendingWithdrawalAddressList[pendingWithdrawalAddressList.length-1];
            pendingWithdrawalAddressList.pop();

            uint256 extranetTokenAmount = pendingWithdrawalAmountByAddress[account];
            uint256 quoteTokenAmount = extranetTokenAmount * oneTokenCost / DIVISION_PRECISION;

            if (quoteTokenAmount == 0) { // is this possible for this to be zero?
                delete pendingWithdrawalAmountByAddress[account];
                continue;
            }

            if (sentQueueTokenAmount + quoteTokenAmount > upToQuoteTokenAmount) {
                pendingWithdrawalAddressList.push(account);
                break;
            }

            uint256 withdrawalFeeAmount = quoteTokenAmount * withdrawalFeePercent / 100 / (10 ** withdrawalFeePercentDecimals);
            uint256 amountLessFee = quoteTokenAmount - withdrawalFeeAmount;

            IERC20(quoteToken).safeTransfer(account, amountLessFee);

            delete pendingWithdrawalAmountByAddress[account];

            totalFeeAmount += withdrawalFeeAmount;

            pendingWithdrawalTotalAmount -= extranetTokenAmount;
            sentQueueTokenAmount += quoteTokenAmount;
        } while (pendingWithdrawalAddressList.length > 0);

        return totalFeeAmount;
    }

    /**
     * @notice Actually execute withdrawal queue. Will distribute USDT among investors in queue according to supplied rate.
     * @param quoteTokenAmount rate variable
     * @param extranetTokenAmount rate variable
     * @param upToQuoteTokenAmount stop distribution of USDT at this amount. Required to prevent overflows
     * @param deadline the transaction must finish before `block.timestamp` reaches this time
     * @dev only `TRADER_ROLE` can call this
     */
    function runWithdrawalQueue(uint256 quoteTokenAmount, uint256 extranetTokenAmount, uint256 upToQuoteTokenAmount, uint32 deadline) public onlyRole(TRADER_ROLE) notExpired(deadline) {
        require(quoteTokenAmount > 0, "zero");
        require(extranetTokenAmount > 0, "zero");

        require(pendingWithdrawalAddressList.length > 0, "zero_addresses");
        require(pendingWithdrawalTotalAmount > 0, "zero_amount");

        require(upToQuoteTokenAmount <= IERC20(quoteToken).balanceOf(address(this)), "balance");

        uint256 oneTokenCost = quoteTokenAmount * DIVISION_PRECISION / extranetTokenAmount;

        // uint256 pendingQuoteTokenAmount = pendingWithdrawalTotalAmount * oneTokenCost / DIVISION_PRECISION;

        uint256 totalFeeAmount = sendoutWithdrawalQueueToken(oneTokenCost, upToQuoteTokenAmount);
        if (totalFeeAmount > 0) {
            IERC20(quoteToken).safeTransfer(feeTo, totalFeeAmount);
        }
    }

    /// @notice Admin method.
    /// @dev only `MANAGER_ROLE` can call this
    function setFeeTo(address _feeTo) public onlyRole(MANAGER_ROLE) {
        feeTo = _feeTo;
    }

    /// @notice Admin method.
    /// @dev only `MANAGER_ROLE` can call this
    function setWithdrawalFeePercent(uint256 _withdrawalFeePercent) public onlyRole(MANAGER_ROLE) {
        withdrawalFeePercent = _withdrawalFeePercent;
    }

    /// @notice Admin method.
    /// @dev only `MANAGER_ROLE` can call this
    function setQuoteToken(address _quoteToken) public onlyRole(MANAGER_ROLE) {
        quoteToken = _quoteToken;
    }

    /// @notice Admin method.
    /// @dev only `MANAGER_ROLE` can call this
    function setBridge(address _bridgeAddress, uint256 _bridgeChainId) public onlyRole(MANAGER_ROLE) {
        bridgeAddress = _bridgeAddress;
        bridgeChainId = _bridgeChainId;
    }

    /// @notice Admin method.
    /// @dev only `MANAGER_ROLE` can call this
    function setMaxQueueSize(uint16 _maxQueueSize) public onlyRole(MANAGER_ROLE) {
        maxQueueSize = _maxQueueSize;
    }

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

    /// @notice Admin method.
    /// @dev only `MANAGER_ROLE` can call this
    function setLimits(uint256 _minInvestmentQuoteTokenAmount, uint256 _minWithdrawalExtranetTokenAmount) public onlyRole(MANAGER_ROLE) {
        minInvestmentQuoteTokenAmount = _minInvestmentQuoteTokenAmount;
        minWithdrawalExtranetTokenAmount = _minWithdrawalExtranetTokenAmount;
    }

    /// @notice Admin method. Collect all `tokens` from ExtranetToken contract to `to`.
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

    /// @notice Admin method, selfdestruct contract.
    function shutdown(address to) public onlyRole(MANAGER_ROLE) whenPaused {
        selfdestruct(payable(to));
    }
}
