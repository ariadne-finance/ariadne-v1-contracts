const chai = require('chai');
const { solidity } = require('ethereum-waffle');
const { locatePoolIdFromMasterChef } = require('../utils/BFarmUtils.js');

chai.use(solidity);
const expect = chai.expect;

const poolAddress = '0xf3A602d30dcB723A74a0198313a7551FEacA7DAc';

describe('BFarmBeets4', function () {
  let bFarmBeets;
  let traderAccount, managerAccount;
  let wftm, pool, masterChef, masterChefPoolId, beets;

  before(async () => {
    let deployerAccount;
    [ deployerAccount, traderAccount, managerAccount ] = await hre.ethers.getSigners();

    masterChef = new ethers.Contract('0x8166994d9ebBe5829EC86Bd81258149B87faCfd3', BeetsBeethovenxMasterChefAbi, ethers.provider);

    masterChefPoolId = await locatePoolIdFromMasterChef(masterChef, poolAddress);
    if (masterChefPoolId === null) {
      throw new Error("FAILED, cannot find masterchef poolId for pair address " + poolAddress);
    }

    beets = await ethers.getContractAt('ERC20', await masterChef.beets());

    const BFarmBeets = await ethers.getContractFactory('BFarmBeets4');
    bFarmBeets = await BFarmBeets.deploy(
      poolAddress,
      masterChef.address,
      masterChefPoolId,
      `Ariadne Late Quartet`,
      `aLQ`
    );

    await bFarmBeets.deployed();

    console.log("Deployed");

    const TRADER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE'));
    const MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MANAGER_ROLE'));

    await bFarmBeets.grantRole(MANAGER_ROLE, managerAccount.address);
    await bFarmBeets.grantRole(TRADER_ROLE, traderAccount.address);
    pool = new ethers.Contract(poolAddress, BeetsWeightedPoolAbi, ethers.provider);

    const vault = new ethers.Contract(await pool.getVault(), BeetsVaultAbi, ethers.provider);
    wftm = new ethers.Contract(await vault.WETH(), WFTMAbi, traderAccount);

    await wftm.deposit({
      value: ethers.utils.parseUnits('1', 18)
    });

    console.log("Wrapped 1 FTM");

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it('should invest and withdraw', async () => {
    const wftmBalanceInitial = await wftm.balanceOf(traderAccount.address);
    await wftm.connect(traderAccount).transfer(bFarmBeets.address, wftmBalanceInitial);
    await bFarmBeets.connect(traderAccount).invest();

    // no reward yet
    expect(await beets.balanceOf(bFarmBeets.address)).to.be.eq(0);

    const lpBalanceAfterInvest = await bFarmBeets.lpBalance();
    expect(lpBalanceAfterInvest).to.be.gt(0);

    // all wftm has been collected from farm
    expect(await wftm.balanceOf(bFarmBeets.address)).to.be.eq(0);

    await bFarmBeets.connect(traderAccount).withdraw(lpBalanceAfterInvest.div(2));
    expect(await bFarmBeets.lpBalance()).to.closeTo(lpBalanceAfterInvest.div(2), 4);

    await bFarmBeets.connect(traderAccount).collectPoolTokens(traderAccount.address);
    await bFarmBeets.connect(traderAccount).collectTokens([ beets.address ], traderAccount.address);

    const wftmBalanceAfterWithdraw = await wftm.balanceOf(traderAccount.address);

    expect(wftmBalanceAfterWithdraw).to.be.closeTo(
      wftmBalanceInitial.div(4).div(2),
      wftmBalanceInitial.div(4).div(2).div(10)
    );

    // reward landed
    expect(await beets.balanceOf(traderAccount.address)).to.be.gt(0);
  });

  it('should harvest', async () => {
    const wftmBalanceInitial = await wftm.balanceOf(traderAccount.address);
    await wftm.connect(traderAccount).transfer(bFarmBeets.address, wftmBalanceInitial);
    await bFarmBeets.connect(traderAccount).invest();

    // no reward yet
    expect(await beets.balanceOf(bFarmBeets.address)).to.be.eq(0);

    await bFarmBeets.connect(traderAccount).harvest();

    // reward landed
    expect(await beets.balanceOf(bFarmBeets.address)).to.be.gt(0);
  });

  it('should emergency withdraw', async () => {
    const wftmBalanceInitial = await wftm.balanceOf(traderAccount.address);
    await wftm.connect(traderAccount).transfer(bFarmBeets.address, wftmBalanceInitial);
    await bFarmBeets.connect(traderAccount).invest();

    await bFarmBeets.connect(traderAccount).emergencyWithdraw();
    expect(await bFarmBeets.lpBalance()).to.eq(0);

    await bFarmBeets.connect(traderAccount).collectPoolTokens(traderAccount.address);

    const wftmBalanceAfterWithdraw = await wftm.balanceOf(traderAccount.address);

    expect(wftmBalanceAfterWithdraw).to.be.closeTo(
      wftmBalanceInitial.div(4),
      wftmBalanceInitial.div(4).div(10)
    );
  });

  const MISSING_ROLE_REASON = 'is missing role';
  it('should disallow trader methods by stranger and by manager', async () => {
    await Promise.all([
      expect(bFarmBeets.harvest()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeets.invest()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeets.withdraw(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeets.stakeTokens()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeets.unstakeTokens(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeets.addLiquidity()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeets.removeLiquidity(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeets.emergencyWithdraw()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeets.collectTokens([ ethers.constants.AddressZero ], ethers.constants.AddressZero)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeets.collectPoolTokens(ethers.constants.AddressZero)).to.be.revertedWith(MISSING_ROLE_REASON),

      expect(bFarmBeets.pause()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeets.unpause()).to.be.revertedWith(MISSING_ROLE_REASON),
    ]);

    const bFarmBeetsAsManager = bFarmBeets.connect(managerAccount);

    await Promise.all([
      expect(bFarmBeetsAsManager.harvest()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeetsAsManager.invest()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeetsAsManager.withdraw(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeetsAsManager.stakeTokens()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeetsAsManager.unstakeTokens(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeetsAsManager.addLiquidity()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeetsAsManager.removeLiquidity(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeetsAsManager.emergencyWithdraw()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeetsAsManager.collectTokens([ ethers.constants.AddressZero ], ethers.constants.AddressZero)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmBeetsAsManager.collectPoolTokens(ethers.constants.AddressZero)).to.be.revertedWith(MISSING_ROLE_REASON),
    ]);
  });
});

const BeetsWeightedPoolAbi = [
	"constructor(address vault, string name, string symbol, address[] tokens, uint256[] normalizedWeights, uint256 swapFeePercentage, uint256 pauseWindowDuration, uint256 bufferPeriodDuration, address owner)",
	"event Approval(address indexed owner, address indexed spender, uint256 value)",
	"event PausedStateChanged(bool paused)",
	"event SwapFeePercentageChanged(uint256 swapFeePercentage)",
	"event Transfer(address indexed from, address indexed to, uint256 value)",
	"function DOMAIN_SEPARATOR() view returns (bytes32)",
	"function allowance(address owner, address spender) view returns (uint256)",
	"function approve(address spender, uint256 amount) returns (bool)",
	"function balanceOf(address account) view returns (uint256)",
	"function decimals() pure returns (uint8)",
	"function decreaseApproval(address spender, uint256 amount) returns (bool)",
	"function getActionId(bytes4 selector) view returns (bytes32)",
	"function getAuthorizer() view returns (address)",
	"function getInvariant() view returns (uint256)",
	"function getLastInvariant() view returns (uint256)",
	"function getNormalizedWeights() view returns (uint256[])",
	"function getOwner() view returns (address)",
	"function getPausedState() view returns (bool paused, uint256 pauseWindowEndTime, uint256 bufferPeriodEndTime)",
	"function getPoolId() view returns (bytes32)",
	"function getRate() view returns (uint256)",
	"function getSwapFeePercentage() view returns (uint256)",
	"function getVault() view returns (address)",
	"function increaseApproval(address spender, uint256 amount) returns (bool)",
	"function name() view returns (string)",
	"function nonces(address owner) view returns (uint256)",
	"function onExitPool(bytes32 poolId, address sender, address recipient, uint256[] balances, uint256 lastChangeBlock, uint256 protocolSwapFeePercentage, bytes userData) returns (uint256[], uint256[])",
	"function onJoinPool(bytes32 poolId, address sender, address recipient, uint256[] balances, uint256 lastChangeBlock, uint256 protocolSwapFeePercentage, bytes userData) returns (uint256[], uint256[])",
	"function onSwap(tuple(uint8 kind, address tokenIn, address tokenOut, uint256 amount, bytes32 poolId, uint256 lastChangeBlock, address from, address to, bytes userData) request, uint256 balanceTokenIn, uint256 balanceTokenOut) view returns (uint256)",
	"function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
	"function queryExit(bytes32 poolId, address sender, address recipient, uint256[] balances, uint256 lastChangeBlock, uint256 protocolSwapFeePercentage, bytes userData) returns (uint256 bptIn, uint256[] amountsOut)",
	"function queryJoin(bytes32 poolId, address sender, address recipient, uint256[] balances, uint256 lastChangeBlock, uint256 protocolSwapFeePercentage, bytes userData) returns (uint256 bptOut, uint256[] amountsIn)",
	"function setPaused(bool paused)",
	"function setSwapFeePercentage(uint256 swapFeePercentage)",
	"function symbol() view returns (string)",
	"function totalSupply() view returns (uint256)",
	"function transfer(address recipient, uint256 amount) returns (bool)",
	"function transferFrom(address sender, address recipient, uint256 amount) returns (bool)"
];

const BeetsVaultAbi = [
	"constructor(address authorizer, address weth, uint256 pauseWindowDuration, uint256 bufferPeriodDuration)",
	"event AuthorizerChanged(address indexed newAuthorizer)",
	"event ExternalBalanceTransfer(address indexed token, address indexed sender, address recipient, uint256 amount)",
	"event FlashLoan(address indexed recipient, address indexed token, uint256 amount, uint256 feeAmount)",
	"event InternalBalanceChanged(address indexed user, address indexed token, int256 delta)",
	"event PausedStateChanged(bool paused)",
	"event PoolBalanceChanged(bytes32 indexed poolId, address indexed liquidityProvider, address[] tokens, int256[] deltas, uint256[] protocolFeeAmounts)",
	"event PoolBalanceManaged(bytes32 indexed poolId, address indexed assetManager, address indexed token, int256 cashDelta, int256 managedDelta)",
	"event PoolRegistered(bytes32 indexed poolId, address indexed poolAddress, uint8 specialization)",
	"event RelayerApprovalChanged(address indexed relayer, address indexed sender, bool approved)",
	"event Swap(bytes32 indexed poolId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)",
	"event TokensDeregistered(bytes32 indexed poolId, address[] tokens)",
	"event TokensRegistered(bytes32 indexed poolId, address[] tokens, address[] assetManagers)",
	"function WETH() view returns (address)",
	"function batchSwap(uint8 kind, tuple(bytes32 poolId, uint256 assetInIndex, uint256 assetOutIndex, uint256 amount, bytes userData)[] swaps, address[] assets, tuple(address sender, bool fromInternalBalance, address recipient, bool toInternalBalance) funds, int256[] limits, uint256 deadline) payable returns (int256[] assetDeltas)",
	"function deregisterTokens(bytes32 poolId, address[] tokens)",
	"function exitPool(bytes32 poolId, address sender, address recipient, tuple(address[] assets, uint256[] minAmountsOut, bytes userData, bool toInternalBalance) request)",
	"function flashLoan(address recipient, address[] tokens, uint256[] amounts, bytes userData)",
	"function getActionId(bytes4 selector) view returns (bytes32)",
	"function getAuthorizer() view returns (address)",
	"function getDomainSeparator() view returns (bytes32)",
	"function getInternalBalance(address user, address[] tokens) view returns (uint256[] balances)",
	"function getNextNonce(address user) view returns (uint256)",
	"function getPausedState() view returns (bool paused, uint256 pauseWindowEndTime, uint256 bufferPeriodEndTime)",
	"function getPool(bytes32 poolId) view returns (address, uint8)",
	"function getPoolTokenInfo(bytes32 poolId, address token) view returns (uint256 cash, uint256 managed, uint256 lastChangeBlock, address assetManager)",
	"function getPoolTokens(bytes32 poolId) view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)",
	"function getProtocolFeesCollector() view returns (address)",
	"function hasApprovedRelayer(address user, address relayer) view returns (bool)",
	"function joinPool(bytes32 poolId, address sender, address recipient, tuple(address[] assets, uint256[] maxAmountsIn, bytes userData, bool fromInternalBalance) request) payable",
	"function managePoolBalance(tuple(uint8 kind, bytes32 poolId, address token, uint256 amount)[] ops)",
	"function manageUserBalance(tuple(uint8 kind, address asset, uint256 amount, address sender, address recipient)[] ops) payable",
	"function queryBatchSwap(uint8 kind, tuple(bytes32 poolId, uint256 assetInIndex, uint256 assetOutIndex, uint256 amount, bytes userData)[] swaps, address[] assets, tuple(address sender, bool fromInternalBalance, address recipient, bool toInternalBalance) funds) returns (int256[])",
	"function registerPool(uint8 specialization) returns (bytes32)",
	"function registerTokens(bytes32 poolId, address[] tokens, address[] assetManagers)",
	"function setAuthorizer(address newAuthorizer)",
	"function setPaused(bool paused)",
	"function setRelayerApproval(address sender, address relayer, bool approved)",
	"function swap(tuple(bytes32 poolId, uint8 kind, address assetIn, address assetOut, uint256 amount, bytes userData) singleSwap, tuple(address sender, bool fromInternalBalance, address recipient, bool toInternalBalance) funds, uint256 limit, uint256 deadline) payable returns (uint256 amountCalculated)"
];

const WFTMAbi = [
	"constructor()",
	"event Approval(address indexed owner, address indexed spender, uint256 value)",
	"event Paused(address account)",
	"event PauserAdded(address indexed account)",
	"event PauserRemoved(address indexed account)",
	"event Transfer(address indexed from, address indexed to, uint256 value)",
	"event Unpaused(address account)",
	"function ERR_INVALID_ZERO_VALUE() view returns (uint256)",
	"function ERR_NO_ERROR() view returns (uint256)",
	"function addPauser(address account)",
	"function allowance(address owner, address spender) view returns (uint256)",
	"function approve(address spender, uint256 value) returns (bool)",
	"function balanceOf(address account) view returns (uint256)",
	"function decimals() view returns (uint8)",
	"function decreaseAllowance(address spender, uint256 subtractedValue) returns (bool)",
	"function deposit() payable returns (uint256)",
	"function increaseAllowance(address spender, uint256 addedValue) returns (bool)",
	"function isPauser(address account) view returns (bool)",
	"function name() view returns (string)",
	"function pause()",
	"function paused() view returns (bool)",
	"function renouncePauser()",
	"function symbol() view returns (string)",
	"function totalSupply() view returns (uint256)",
	"function transfer(address to, uint256 value) returns (bool)",
	"function transferFrom(address from, address to, uint256 value) returns (bool)",
	"function unpause()",
	"function withdraw(uint256 amount) returns (uint256)"
];

const BeetsBeethovenxMasterChefAbi = [
	"constructor(address _beets, address _treasuryAddress, uint256 _beetsPerBlock, uint256 _startBlock)",
	"event Deposit(address indexed user, uint256 indexed pid, uint256 amount, address indexed to)",
	"event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount, address indexed to)",
	"event Harvest(address indexed user, uint256 indexed pid, uint256 amount)",
	"event LogPoolAddition(uint256 indexed pid, uint256 allocPoint, address indexed lpToken, address indexed rewarder)",
	"event LogSetPool(uint256 indexed pid, uint256 allocPoint, address indexed rewarder, bool overwrite)",
	"event LogUpdatePool(uint256 indexed pid, uint256 lastRewardBlock, uint256 lpSupply, uint256 accBeetsPerShare)",
	"event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
	"event SetTreasuryAddress(address indexed oldAddress, address indexed newAddress)",
	"event UpdateEmissionRate(address indexed user, uint256 _beetsPerSec)",
	"event Withdraw(address indexed user, uint256 indexed pid, uint256 amount, address indexed to)",
	"function POOL_PERCENTAGE() view returns (uint256)",
	"function TREASURY_PERCENTAGE() view returns (uint256)",
	"function add(uint256 _allocPoint, address _lpToken, address _rewarder)",
	"function beets() view returns (address)",
	"function beetsPerBlock() view returns (uint256)",
	"function deposit(uint256 _pid, uint256 _amount, address _to)",
	"function emergencyWithdraw(uint256 _pid, address _to)",
	"function harvest(uint256 _pid, address _to)",
	"function harvestAll(uint256[] _pids, address _to)",
	"function lpTokens(uint256) view returns (address)",
	"function massUpdatePools(uint256[] pids)",
	"function owner() view returns (address)",
	"function pendingBeets(uint256 _pid, address _user) view returns (uint256 pending)",
	"function poolInfo(uint256) view returns (uint256 allocPoint, uint256 lastRewardBlock, uint256 accBeetsPerShare)",
	"function poolLength() view returns (uint256)",
	"function renounceOwnership()",
	"function rewarder(uint256) view returns (address)",
	"function set(uint256 _pid, uint256 _allocPoint, address _rewarder, bool overwrite)",
	"function startBlock() view returns (uint256)",
	"function totalAllocPoint() view returns (uint256)",
	"function transferOwnership(address newOwner)",
	"function treasury(address _treasuryAddress)",
	"function treasuryAddress() view returns (address)",
	"function updateEmissionRate(uint256 _beetsPerBlock)",
	"function updatePool(uint256 _pid) returns (tuple(uint256 allocPoint, uint256 lastRewardBlock, uint256 accBeetsPerShare) pool)",
	"function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)",
	"function withdrawAndHarvest(uint256 _pid, uint256 _amount, address _to)"
];

