const chai = require('chai');
const { solidity } = require('ethereum-waffle');
const { parseAddressFromEnv, swapOneETHForEachToken, wrapFiveETH, getEverything } = require('../utils/BFarmUtils.js');
const EthereumMatchers = require('./utilities/EthereumMatchers.js');

chai.use(solidity);
chai.use(EthereumMatchers);

const expect = chai.expect;

const tokenAAddress = parseAddressFromEnv(process.env.TOKENA, 'token A');
const tokenBAddress = parseAddressFromEnv(process.env.TOKENB, 'token B');
const routerAddress = parseAddressFromEnv(process.env.ROUTER, 'router');

describe('BFarmUniswap', function () {
  let bFarmUniswap;
  let traderAccount, managerAccount;
  let router, token0, token1, WETH;

  before(async () => {
    [ deployerAccount, traderAccount, managerAccount ] = await hre.ethers.getSigners();

    ({ router, token0, token1, WETH } = await getEverything({ routerAddress, tokenAAddress, tokenBAddress }));

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

    await WETH.connect(traderAccount).approve(router.address, ethers.constants.MaxUint256);

    await token0.connect(traderAccount).approve(bFarmUniswap.address, ethers.constants.MaxUint256);
    await token1.connect(traderAccount).approve(bFarmUniswap.address, ethers.constants.MaxUint256);

    await wrapFiveETH({ WETH, account: traderAccount });

    await swapOneETHForEachToken({ WETH, token0, token1, router, account: traderAccount });

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it('should invest and withdraw', async () => {
    await token1.connect(traderAccount).transfer(bFarmUniswap.address, await token1.balanceOf(traderAccount.address));
    await token0.connect(traderAccount).transfer(bFarmUniswap.address, await token0.balanceOf(traderAccount.address));

    expect(await bFarmUniswap.lpBalance()).to.be.eq(0);

    let contractBalancesBefore = await chai.util.snapshotBalances(bFarmUniswap.address, [ token0, token1 ]);

    await bFarmUniswap.connect(traderAccount).invest();

    let contractBalancesAfter = await chai.util.snapshotBalances(bFarmUniswap.address, [ token0, token1 ]);

    expect(contractBalancesBefore).balancesDecreased(contractBalancesAfter);
    expect(contractBalancesAfter).balancesOneIsZero;

    expect(await bFarmUniswap.lpBalance()).to.be.gt(0);

    expect(await token0.balanceOf(traderAccount.address)).to.be.eq(0);
    expect(await token1.balanceOf(traderAccount.address)).to.be.eq(0);

    let lpTokenBalance = await bFarmUniswap.balanceOf(traderAccount.address);
    expect(lpTokenBalance).to.be.gt(0);

    await bFarmUniswap.connect(managerAccount).setSlippagePercentMultiplier(9990);

    contractBalancesBefore = await chai.util.snapshotBalances(bFarmUniswap.address, [ token0, token1 ]);

    await bFarmUniswap.connect(traderAccount).withdraw(lpTokenBalance.div(2));

    contractBalancesAfter = await chai.util.snapshotBalances(bFarmUniswap.address, [ token0, token1 ]);
    expect(contractBalancesBefore).balancesIncreased(contractBalancesAfter);

    const traderAccountBalances = await chai.util.snapshotBalances(traderAccount.address, [ token0, token1 ]);
    expect(traderAccountBalances).balancesAllAreZero;

    let lpTokenBalance2 = await bFarmUniswap.balanceOf(traderAccount.address);

    expect(lpTokenBalance2).to.be.within(lpTokenBalance.div(2).sub(1), lpTokenBalance.div(2).add(1));

    await bFarmUniswap.connect(managerAccount).setSlippagePercentMultiplier(9990);
    await bFarmUniswap.connect(traderAccount).withdraw(await bFarmUniswap.balanceOf(traderAccount.address));

    expect(await bFarmUniswap.balanceOf(traderAccount.address)).to.be.eq(0);
  });

  it('should collect tokens', async () => {
    const balanceToken0Before = await token0.balanceOf(traderAccount.address);
    const balanceToken1Before = await token1.balanceOf(traderAccount.address);

    await token0.connect(traderAccount).transfer(bFarmUniswap.address, balanceToken0Before);
    await token1.connect(traderAccount).transfer(bFarmUniswap.address, balanceToken1Before);

    await bFarmUniswap.connect(traderAccount).invest();

    const traderAccountBalances = await chai.util.snapshotBalances(traderAccount.address, [ token0, token1 ]);
    expect(traderAccountBalances).balancesAllAreZero;

    await bFarmUniswap.connect(managerAccount).setSlippagePercentMultiplier(9990);

    const lpTokenBalance = await bFarmUniswap.balanceOf(traderAccount.address);
    await bFarmUniswap.connect(traderAccount).withdraw(lpTokenBalance);

    await bFarmUniswap.connect(traderAccount).collectTokens([ token0.address, token1.address ], traderAccount.address);

    expect(await token0.balanceOf(traderAccount.address)).to.be.within(balanceToken0Before.mul(100).div(102), balanceToken0Before.mul(100).div(98));
    expect(await token1.balanceOf(traderAccount.address)).to.be.within(balanceToken1Before.mul(100).div(102), balanceToken1Before.mul(100).div(98));
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

  it('should support addLiquidity and properly collect', async () => {
    // await bFarmUniswap.connect(managerAccount).setSlippagePercentMultiplier(9990);

    const token0HalfAmount = (await token0.balanceOf(traderAccount.address)).div(2).sub(1);
    const token1HalfAmount = (await token1.balanceOf(traderAccount.address)).div(2).sub(1);

    await bFarmUniswap.connect(traderAccount).transferAndInvest(token0HalfAmount, token1HalfAmount);

    expect(await token0.balanceOf(traderAccount.address)).to.be.closeTo(token0HalfAmount, 4);
    expect(await token1.balanceOf(traderAccount.address)).to.be.closeTo(token1HalfAmount, 4);

    const totalSupplyAfterInvest = await bFarmUniswap.totalSupply();
    expect(totalSupplyAfterInvest).to.be.gt(0);

    const bFarmBalanceAfterInvest = await bFarmUniswap.lpBalance();
    expect(bFarmBalanceAfterInvest).to.be.gt(0);

    const traderBFarmBalanceAfterInvest = await bFarmUniswap.balanceOf(traderAccount.address);
    expect(traderBFarmBalanceAfterInvest).to.be.gt(0);

    await token0.connect(traderAccount).transfer(bFarmUniswap.address, token0HalfAmount);
    await token1.connect(traderAccount).transfer(bFarmUniswap.address, token1HalfAmount);

    expect(await token0.balanceOf(traderAccount.address)).to.be.lte(4);
    expect(await token1.balanceOf(traderAccount.address)).to.be.lte(4);

    await bFarmUniswap.connect(traderAccount).addLiquidity();

    // burn
    await bFarmUniswap.connect(traderAccount).collectTokens([ token0.address, token1.address ], ethers.constants.AddressZero);
    expect(await token0.balanceOf(bFarmUniswap.address)).to.be.eq(0);
    expect(await token1.balanceOf(bFarmUniswap.address)).to.be.eq(0);

    expect(await bFarmUniswap.totalSupply()).to.be.eq(totalSupplyAfterInvest);
    expect(await bFarmUniswap.balanceOf(traderAccount.address)).to.be.eq(traderBFarmBalanceAfterInvest);
    expect(await bFarmUniswap.lpBalance()).to.be.closeTo(bFarmBalanceAfterInvest.mul(2), 4);

    await bFarmUniswap.connect(traderAccount).withdrawAndCollect(traderBFarmBalanceAfterInvest.div(3));

    expect(await bFarmUniswap.lpBalance()).to.be.closeTo(bFarmBalanceAfterInvest.mul(2).div(3).mul(2), 9);
    expect(await bFarmUniswap.totalSupply()).to.be.closeTo(totalSupplyAfterInvest.div(3).mul(2), 9);

    const traderBFarmBalanceAfterOneThirdWithdrawn = await bFarmUniswap.balanceOf(traderAccount.address);
    expect(traderBFarmBalanceAfterOneThirdWithdrawn).to.be.closeTo(traderBFarmBalanceAfterInvest.div(3).mul(2), 9);

    const token0BalanceAfterOneThirdWithdrawn = await token0.balanceOf(traderAccount.address);
    expect(token0BalanceAfterOneThirdWithdrawn).to.gt(4);

    const token1BalanceAfterOneThirdWithdrawn = await token1.balanceOf(traderAccount.address);
    expect(token1BalanceAfterOneThirdWithdrawn).to.gt(4);

    await bFarmUniswap.connect(traderAccount).withdrawAndCollect(traderBFarmBalanceAfterOneThirdWithdrawn);

    expect(await bFarmUniswap.lpBalance()).to.be.eq(0);
    expect(await bFarmUniswap.totalSupply()).to.be.eq(0);
    expect(await bFarmUniswap.balanceOf(traderAccount.address)).to.be.eq(0);

    expect(await token0.balanceOf(traderAccount.address)).to.be.closeTo(token0BalanceAfterOneThirdWithdrawn.mul(3), 10000000);
    expect(await token1.balanceOf(traderAccount.address)).to.be.closeTo(token1BalanceAfterOneThirdWithdrawn.mul(3), 10000000);
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
