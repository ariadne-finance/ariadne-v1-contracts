const chai = require('chai');
const { solidity } = require('ethereum-waffle');
const { ethers } = require('hardhat');

chai.use(solidity);
const expect = chai.expect;

const EllipsisStableSwapAbi = [
  'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  'event TokenExchangeUnderlying(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  'event AddLiquidity(address indexed provider, uint256[2] token_amounts, uint256[2] fees, uint256 invariant, uint256 token_supply)',
  'event RemoveLiquidity(address indexed provider, uint256[2] token_amounts, uint256[2] fees, uint256 token_supply)',
  'event RemoveLiquidityOne(address indexed provider, uint256 token_amount, uint256 coin_amount, uint256 token_supply)',
  'event RemoveLiquidityImbalance(address indexed provider, uint256[2] token_amounts, uint256[2] fees, uint256 invariant, uint256 token_supply)',
  'event RampA(uint256 old_A, uint256 new_A, uint256 initial_time, uint256 future_time)',
  'event StopRampA(uint256 A, uint256 t)',
  'constructor()',
  'function initialize(address _lp_token, address _coin, uint256 _rate_multiplier, uint256 _A, uint256 _fee) @298728',
  'function admin_fee() view returns (uint256) @456',
  'function A() view returns (uint256) @10555',
  'function A_precise() view returns (uint256) @10517',
  'function get_virtual_price() view returns (uint256) @1015326',
  'function calc_token_amount(uint256[2] _amounts, bool _is_deposit) view returns (uint256) @2009571',
  'function add_liquidity(uint256[2] _amounts, uint256 _min_mint_amount) returns (uint256) @3168321',
  'function add_liquidity(uint256[2] _amounts, uint256 _min_mint_amount, address _receiver) returns (uint256) @3168321',
  'function get_dy(int128 i, int128 j, uint256 dx) view returns (uint256) @1437364',
  'function get_dy_underlying(int128 i, int128 j, uint256 dx) view returns (uint256) @1445899',
  'function exchange(int128 i, int128 j, uint256 _dx, uint256 _min_dy) returns (uint256) @1593683',
  'function exchange(int128 i, int128 j, uint256 _dx, uint256 _min_dy, address _receiver) returns (uint256) @1593683',
  'function exchange_underlying(int128 i, int128 j, uint256 _dx, uint256 _min_dy) returns (uint256) @1616338',
  'function exchange_underlying(int128 i, int128 j, uint256 _dx, uint256 _min_dy, address _receiver) returns (uint256) @1616338',
  'function remove_liquidity(uint256 _burn_amount, uint256[2] _min_amounts) returns (uint256[2]) @170828',
  'function remove_liquidity(uint256 _burn_amount, uint256[2] _min_amounts, address _receiver) returns (uint256[2]) @170828',
  'function remove_liquidity_imbalance(uint256[2] _amounts, uint256 _max_burn_amount) returns (uint256) @3168491',
  'function remove_liquidity_imbalance(uint256[2] _amounts, uint256 _max_burn_amount, address _receiver) returns (uint256) @3168491',
  'function calc_withdraw_one_coin(uint256 _burn_amount, int128 i) view returns (uint256) @1201',
  'function remove_liquidity_one_coin(uint256 _burn_amount, int128 i, uint256 _min_received) returns (uint256) @1987275',
  'function remove_liquidity_one_coin(uint256 _burn_amount, int128 i, uint256 _min_received, address _receiver) returns (uint256) @1987275',
  'function ramp_A(uint256 _future_A, uint256 _future_time) @161397',
  'function stop_ramp_A() @157438',
  'function admin_balances(uint256 i) view returns (uint256) @7834',
  'function withdraw_admin_fees() @38799',
  'function factory() view returns (address) @3096',
  'function lp_token() view returns (address) @3126',
  'function coins(uint256 arg0) view returns (address) @3201',
  'function balances(uint256 arg0) view returns (uint256) @3231',
  'function fee() view returns (uint256) @3216',
  'function initial_A() view returns (uint256) @3246',
  'function future_A() view returns (uint256) @3276',
  'function initial_A_time() view returns (uint256) @3306',
  'function future_A_time() view returns (uint256) @3336'
];

const EllipsisLpStakingAbi = [
  'constructor(address _rewardToken, address _incentiveVoting, address _tokenLocker, uint256 _maxMintable)',
  'event ClaimedReward(address indexed caller, address indexed claimer, address indexed receiver, uint256 amount)',
  'event Deposit(address indexed user, address indexed token, uint256 amount)',
  'event EmergencyWithdraw(address indexed token, address indexed user, uint256 amount)',
  'event FeeClaimRevert(address pool)',
  'event FeeClaimSuccess(address pool)',
  'event Withdraw(address indexed user, address indexed token, uint256 amount)',
  'function addPool(address _token) returns (bool)',
  'function blockThirdPartyActions(address) view returns (bool)',
  'function claim(address _user, address[] _tokens) returns (uint256)',
  'function claimReceiver(address) view returns (address)',
  'function claimableReward(address _user, address[] _tokens) view returns (uint256[])',
  'function deposit(address _token, uint256 _amount, bool _claimRewards) returns (uint256)',
  'function emergencyWithdraw(address _token)',
  'function incentiveVoting() view returns (address)',
  'function lastFeeClaim(address) view returns (uint256)',
  'function maxMintableTokens() view returns (uint256)',
  'function mintedTokens() view returns (uint256)',
  'function poolInfo(address) view returns (uint256 adjustedSupply, uint256 rewardsPerSecond, uint256 lastRewardTime, uint256 accRewardPerShare)',
  'function poolLength() view returns (uint256)',
  'function registeredTokens(uint256) view returns (address)',
  'function rewardToken() view returns (address)',
  'function setBlockThirdPartyActions(bool _block)',
  'function setClaimReceiver(address _receiver)',
  'function startTime() view returns (uint256)',
  'function tokenLocker() view returns (address)',
  'function updateUserBoosts(address _user, address[] _tokens)',
  'function userInfo(address, address) view returns (uint256 depositAmount, uint256 adjustedAmount, uint256 rewardDebt, uint256 claimable)',
  'function withdraw(address _token, uint256 _amount, bool _claimRewards) returns (uint256)'
];

describe('BFarmEllipsis', function () {
  let bFarmEllipsis, pool, ellipsisLpStaking, rewardTokenContract;
  let traderAccount, managerAccount;
  let usdt, usdtDecimals;

  before(async () => {
    let deployerAccount;
    [ deployerAccount, traderAccount, managerAccount ] = await hre.ethers.getSigners();

    const BFarmEllipsis = await ethers.getContractFactory('BFarmEllipsis');
    bFarmEllipsis = await BFarmEllipsis.deploy(
      managerAccount.address,
      managerAccount.address,
      traderAccount.address
    );

    await bFarmEllipsis.deployed();

    console.log("Deployed");

    const usdtAddress = await bFarmEllipsis.COIN(3);
    usdt = await ethers.getContractAt('ERC20', usdtAddress);
    usdtDecimals = Number(await usdt.decimals());

    for (let i=0; i<=3; i++) {
      const address = await bFarmEllipsis.COIN(i);
      const contract = await ethers.getContractAt('ERC20', address);
      await contract.connect(traderAccount).approve(bFarmEllipsis.address, 2n**256n-1n);
    }

    const poolAddress = await bFarmEllipsis.pool();
    pool = new ethers.Contract(poolAddress, EllipsisStableSwapAbi, ethers.provider);

    const ellipsisLpStakingAddress = await bFarmEllipsis.ellipsisLpStaking();
    ellipsisLpStaking = new ethers.Contract(ellipsisLpStakingAddress, EllipsisLpStakingAbi, ethers.provider);

    const rewardTokenAddress = await ellipsisLpStaking.rewardToken();
    rewardTokenContract = await ethers.getContractAt('ERC20', rewardTokenAddress);

    const router = await ethers.getContractAt('IUniswapV2Router02', '0x10ED43C718714eb63d5aA57B78B54704E256024E');
    const wethAddress = await router.WETH();

    const weth = await ethers.getContractAt('ERC20', wethAddress);

    await traderAccount.sendTransaction({
      to: wethAddress,
      value: ethers.utils.parseEther('1')
    });

    await weth.connect(traderAccount).approve(router.address, 2n**256n-1n);

    await router.connect(traderAccount).swapExactTokensForTokens(
      ethers.utils.parseEther('1'),
      0,
      [ wethAddress, usdtAddress ],
      traderAccount.address,
      Math.floor(Date.now() / 1000) + 86400
    );

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it('should invest, harvest and withdraw', async () => {
    const usdtAmount = ethers.utils.parseUnits('10', usdtDecimals);

    const virtualPrice = await pool.get_virtual_price();

    await bFarmEllipsis.connect(traderAccount).transferAndInvest([0, 0, 0, usdtAmount]);

    const lpBalanceAfterInvest = await bFarmEllipsis.lpBalance();

    // LP almost eq original investment amount
    expect(lpBalanceAfterInvest).to.be.closeTo(usdtAmount, usdtAmount.div(100));

    // virtual_price almost eq 1 USD
    expect(lpBalanceAfterInvest.mul(virtualPrice).div(10n**18n)).to.be.closeTo(usdtAmount, usdtAmount.div(100));

    const rewardBalanceAfterInvest = await rewardTokenContract.balanceOf(bFarmEllipsis.address);

    await bFarmEllipsis.connect(traderAccount).harvest();
    expect(await rewardTokenContract.balanceOf(bFarmEllipsis.address)).to.be.gt(rewardBalanceAfterInvest);

    const usdtBalanceAfterInvest = await usdt.balanceOf(traderAccount.address);

    await bFarmEllipsis.connect(traderAccount).withdrawAndCollect(lpBalanceAfterInvest);

    const usdtBalanceAfterWithdraw = await usdt.balanceOf(traderAccount.address);
    expect(usdtBalanceAfterWithdraw.sub(usdtBalanceAfterInvest)).to.be.closeTo(usdtAmount, usdtAmount.div(100));
  });
});
