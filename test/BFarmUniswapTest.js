const chai = require('chai');
const { solidity } = require('ethereum-waffle');
const { parseAddressFromEnv } = require('../utils/BFarmUtils.js');
const EthereumMatchers = require('./utilities/EthereumMatchers.js');

chai.use(solidity);
chai.use(EthereumMatchers);

const expect = chai.expect;

const routerAddress = parseAddressFromEnv(process.env.ROUTER, 'router');

describe('BFarmUniswap', function () {
  let bFarmUniswap;
  let traderAccount, managerAccount;
  let router, token0, token1;

  before(async () => {
    [ deployerAccount, traderAccount, managerAccount ] = await hre.ethers.getSigners();

    router = await ethers.getContractAt('IUniswapV2Router02', routerAddress);
    const factory = await ethers.getContractAt('IUniswapV2Factory', await router.factory());

    const TestTokenFactory = await ethers.getContractFactory('TestToken');

    const tokenA = await TestTokenFactory.deploy('T0', 6);
    await tokenA.deployed();

    const tokenB = await TestTokenFactory.deploy('T1', 6);
    await tokenB.deployed();

    await factory.createPair(tokenA.address, tokenB.address);
    const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
    const pair = await ethers.getContractAt('IUniswapV2Pair', pairAddress);

    token0 = await ethers.getContractAt('TestToken', await pair.token0());
    token1 = await ethers.getContractAt('TestToken', await pair.token1());

    await token0.connect(traderAccount).approve(router.address, ethers.constants.MaxUint256);
    await token1.connect(traderAccount).approve(router.address, ethers.constants.MaxUint256);

    const amount = 3000;
    await token0.connect(traderAccount).mint(amount);
    await token1.connect(traderAccount).mint(amount * 2);

    const random = ethers.Wallet.createRandom();

    await router.connect(traderAccount).addLiquidity(token0.address, token1.address, amount, amount * 2, amount, amount * 2, random.address, Math.floor(Date.now() / 1000 + 86400));

    const BFarmUniswap = await ethers.getContractFactory('BFarmUniswap');

    bFarmUniswap = await BFarmUniswap.deploy(
      router.address,
      token0.address,
      token1.address,
      `Farm TEST/TEST`,
      `aTEST`,
      managerAccount.address,
      managerAccount.address,
      traderAccount.address
    );

    await bFarmUniswap.deployed();

    await token0.connect(traderAccount).approve(bFarmUniswap.address, ethers.constants.MaxUint256);
    await token1.connect(traderAccount).approve(bFarmUniswap.address, ethers.constants.MaxUint256);

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it('should invest and withdraw', async () => {
    await token0.connect(traderAccount).mint(1000);
    await token1.connect(traderAccount).mint(2000);

    await bFarmUniswap.connect(traderAccount).transferAndInvest(1000, 2000);

    expect(await token0.balanceOf(traderAccount.address)).to.be.eq(0);
    expect(await token1.balanceOf(traderAccount.address)).to.be.eq(0);

    let bFarmTraderBalance = await bFarmUniswap.balanceOf(traderAccount.address);
    expect(bFarmTraderBalance).to.be.gt(0);

    expect(await bFarmUniswap.lpBalance()).to.be.gt(0);
    expect(await bFarmUniswap.totalSupply()).to.be.gt(0);

    await bFarmUniswap.connect(traderAccount).withdrawAndCollect(bFarmTraderBalance.div(2));

    expect(await token0.balanceOf(traderAccount.address)).to.be.eq(500);
    expect(await token1.balanceOf(traderAccount.address)).to.be.eq(1000);

    let lpTokenBalance2 = await bFarmUniswap.balanceOf(traderAccount.address);
    expect(lpTokenBalance2).to.be.eq(bFarmTraderBalance.div(2));

    await bFarmUniswap.connect(traderAccount).withdraw(await bFarmUniswap.balanceOf(traderAccount.address));

    expect(await bFarmUniswap.balanceOf(traderAccount.address)).to.be.eq(0);
  });

  it('should collect tokens', async () => {
    await token0.connect(traderAccount).mint(1000);
    await token1.connect(traderAccount).mint(2000);

    await token0.connect(traderAccount).transfer(bFarmUniswap.address, 1000);
    await token1.connect(traderAccount).transfer(bFarmUniswap.address, 2000);

    await bFarmUniswap.connect(traderAccount).collectTokens([ token0.address, token1.address ], traderAccount.address);

    expect(await token0.balanceOf(traderAccount.address)).to.be.eq(1000);
    expect(await token1.balanceOf(traderAccount.address)).to.be.eq(2000);
  });

  it('should support addLiquidity and properly calculate token0/token1 amounts', async () => {
    await token0.connect(traderAccount).mint(1000);
    await token1.connect(traderAccount).mint(2000);

    await bFarmUniswap.connect(traderAccount).transferAndInvest(1000, 2000);

    const totalSupplyAfterInvest = await bFarmUniswap.totalSupply();
    expect(totalSupplyAfterInvest).to.be.gt(0);

    const traderBFarmBalanceAfterInvest = await bFarmUniswap.balanceOf(traderAccount.address);
    expect(traderBFarmBalanceAfterInvest).to.be.eq(totalSupplyAfterInvest);

    const lpBalanceAfterInvest = await bFarmUniswap.lpBalance();
    expect(lpBalanceAfterInvest).to.be.gt(0);

    await token0.connect(traderAccount).mintTo(bFarmUniswap.address, 1000);
    await token1.connect(traderAccount).mintTo(bFarmUniswap.address, 2000);

    await bFarmUniswap.connect(traderAccount).addLiquidity();

    // neither totalSupply nor my balance have changed
    const totalSupplyAfterAddLiquidity = await bFarmUniswap.totalSupply();
    expect(totalSupplyAfterAddLiquidity).to.be.eq(totalSupplyAfterInvest);

    const lpBalanceAfterAddLiquidity = await bFarmUniswap.lpBalance();
    expect(lpBalanceAfterAddLiquidity).to.be.closeTo(lpBalanceAfterInvest.mul(2), 4);

    await bFarmUniswap.connect(traderAccount).withdrawAndCollect(traderBFarmBalanceAfterInvest.div(3));

    const traderBFarmBalanceAfterOneThirdWithdrawn = await bFarmUniswap.balanceOf(traderAccount.address);

    // 2/3 left, 1/3 withdrawn; div(3).mul(2) == 2/3
    expect(traderBFarmBalanceAfterOneThirdWithdrawn).to.be.closeTo(traderBFarmBalanceAfterInvest.div(3).mul(2), 9);
    expect(await bFarmUniswap.lpBalance()).to.be.closeTo(lpBalanceAfterAddLiquidity.div(3).mul(2), 9);
    expect(await bFarmUniswap.totalSupply()).to.be.closeTo(totalSupplyAfterAddLiquidity.div(3).mul(2), 9);

    expect(await token0.balanceOf(traderAccount.address)).to.be.eq(666);
    expect(await token1.balanceOf(traderAccount.address)).to.be.eq(1332)

    await bFarmUniswap.connect(traderAccount).withdrawAndCollect(traderBFarmBalanceAfterOneThirdWithdrawn);

    expect(await bFarmUniswap.lpBalance()).to.be.eq(0);
    expect(await bFarmUniswap.totalSupply()).to.be.eq(0);
    expect(await bFarmUniswap.balanceOf(traderAccount.address)).to.be.eq(0);

    expect(await token0.balanceOf(traderAccount.address)).to.be.eq(1999);
    expect(await token1.balanceOf(traderAccount.address)).to.be.eq(3999);
  });

  it('should disallow admin methods by stranger and by trader', async () => {
    await Promise.all([
      expect(bFarmUniswap.setDeadlineSeconds(123)).to.be.revertedWith('is missing role'),
      expect(bFarmUniswap.setSlippagePercentMultiplier(23)).to.be.revertedWith('is missing role'),
      expect(bFarmUniswap.pause()).to.be.revertedWith('is missing role'),
      expect(bFarmUniswap.unpause()).to.be.revertedWith('is missing role'),
    ]);

    const bFarmUniswapAsTrader = bFarmUniswap.connect(traderAccount);

    await Promise.all([
      expect(bFarmUniswapAsTrader.setDeadlineSeconds(123)).to.be.revertedWith('is missing role'),
      expect(bFarmUniswapAsTrader.setSlippagePercentMultiplier(23)).to.be.revertedWith('is missing role'),
      expect(bFarmUniswapAsTrader.pause()).to.be.revertedWith('is missing role'),
      expect(bFarmUniswapAsTrader.unpause()).to.be.revertedWith('is missing role'),
    ]);
  });

  const MISSING_ROLE_REASON = 'is missing role';
  it('should disallow trader methods by stranger and by manager', async () => {
    await Promise.all([
      expect(bFarmUniswap.collectTokens([ token0.address ], traderAccount.address)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmUniswap.invest()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmUniswap.withdraw(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmUniswap.addLiquidity()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmUniswap.removeLiquidity(1)).to.be.revertedWith(MISSING_ROLE_REASON)
    ]);

    const bFarmUniswapAsManager = bFarmUniswap.connect(managerAccount);

    await Promise.all([
      expect(bFarmUniswapAsManager.collectTokens([ token0.address ], traderAccount.address)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmUniswapAsManager.invest()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmUniswapAsManager.withdraw(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmUniswapAsManager.addLiquidity()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmUniswapAsManager.removeLiquidity(1)).to.be.revertedWith(MISSING_ROLE_REASON),
    ]);
  });
});
