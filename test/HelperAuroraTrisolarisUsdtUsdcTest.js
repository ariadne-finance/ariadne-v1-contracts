const debug = require('debug')("BFarm:test");
const chai = require('chai');
const { solidity } = require('ethereum-waffle');
const { ethers } = require('hardhat');
const { getEverything } = require('../utils/BFarmUtils.js');
const { sponsor } = require('../utils/sponsor');
const EthereumMatchers = require('./utilities/EthereumMatchers.js');

chai.use(solidity);
chai.use(EthereumMatchers);
const expect = chai.expect;

const tokenAAddress = ethers.utils.getAddress('0xB12BFcA5A55806AaF64E99521918A4bf0fC40802');
const tokenBAddress = ethers.utils.getAddress('0x4988a896b1227218e4A686fdE5EabdcAbd91571f');
const routerAddress = ethers.utils.getAddress('0x2CB45Edb4517d5947aFdE3BEAbF95A582506858B');
const masterChefAddress = ethers.utils.getAddress('0x1f1Ed214bef5E83D8f5d0eB5D7011EB965D0D79B');

describe('Helper', function () {
  let bFarmSushiswap;

  const oneThousandUSDT = ethers.BigNumber.from(1000n * 10n**6n);

  const poolId = 3;
  let masterChef, pair;
  let router, token0, token1;
  let traderAccount, managerAccount, rewarderAccount;
  let harvestHelper;

  before(async () => {
    let deployerAccount;
    [ deployerAccount, traderAccount, managerAccount ] = await hre.ethers.getSigners();

    rewarderAccount = managerAccount; // reuse of accounts, who cares

    ({ router, token0, token1, pair } = await getEverything({ routerAddress, tokenAAddress, tokenBAddress }));

    masterChef = await ethers.getContractAt('ISushiswapMasterChef', masterChefAddress);

    const BFarmSushiswap = await ethers.getContractFactory('BFarmSushiswap');

    bFarmSushiswap = await BFarmSushiswap.deploy(
      router.address,
      token0.address,
      token1.address,
      masterChef.address,
      poolId,
      `Farm TEST/TEST`,
      `aTEST`,
      managerAccount.address,
      managerAccount.address,
      traderAccount.address
    );

    await bFarmSushiswap.deployed();

    const HarvestHelper = await ethers.getContractFactory('HelperAuroraTrisolarisUsdtUsdc');
    harvestHelper = await HarvestHelper.deploy(bFarmSushiswap.address);

    await token0.connect(rewarderAccount).approve(harvestHelper.address, 2n**256n-1n);

    debug("Deployed");

    await bFarmSushiswap.connect(managerAccount).grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE')), harvestHelper.address);
    await token0.connect(traderAccount).approve(bFarmSushiswap.address, 2n**256n-1n);
    await token1.connect(traderAccount).approve(bFarmSushiswap.address, 2n**256n-1n);

    await sponsor({
      token: token0.address,
      accounts: [ traderAccount.address ],
      amount: 100_000
    });

    await token0.connect(traderAccount).approve(router.address, 2n**256n-1n);

    await router.connect(traderAccount).swapExactTokensForTokens(
      10_000n * 10n**6n,
      0,
      [ token0.address, token1.address ],
      traderAccount.address,
      Math.floor(Date.now() / 1000) + 86400
    );

    await router.connect(traderAccount).swapExactTokensForTokens(
      10_000n * 10n**6n,
      0,
      [ token0.address, token1.address ],
      traderAccount.address,
      Math.floor(Date.now() / 1000) + 86400
    );

    await token0.connect(traderAccount).transfer(rewarderAccount.address, 10000n * 10n**6n);

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it("should harvest masterchef's awards", async () => {
    await bFarmSushiswap.connect(traderAccount).transferAndInvest(oneThousandUSDT, oneThousandUSDT);

    const lpBalanceBefore = await bFarmSushiswap.lpBalance();
    expect(lpBalanceBefore).to.be.gt(0);

    expect(await bFarmSushiswap.balanceOf(traderAccount.address)).to.be.gt(0);

    let lpTotalSupply = await pair.totalSupply();
    let reservesBefore = await pair.getReserves();

    let balance = reservesBefore.reserve0.mul(2).mul(lpBalanceBefore).div(lpTotalSupply);
    expect(balance).to.be.closeTo(oneThousandUSDT.mul(2), oneThousandUSDT.mul(2).div(100));

    for (let i = 0; i < 60; i++) {
      await advanceTimeAndBlock(1000);
    }

    const bFarmTotalSupplyBefore = await bFarmSushiswap.totalSupply();
    await harvestHelper.harvest(0, ethers.constants.AddressZero);
    const bFarmTotalSupplyAfter = await bFarmSushiswap.totalSupply();

    expect(bFarmTotalSupplyAfter).to.be.eq(bFarmTotalSupplyBefore);

    const lpBalanceAfter = await bFarmSushiswap.lpBalance();
    expect(lpBalanceAfter).to.be.gt(lpBalanceBefore);

    let reservesAfter = await pair.getReserves();
    expect(reservesAfter.reserve0).to.be.gt(reservesBefore.reserve0);
    expect(reservesAfter.reserve1).to.be.gt(reservesBefore.reserve1);

    await advanceTimeAndBlock(1000);

    await bFarmSushiswap.connect(traderAccount).withdraw(bFarmTotalSupplyAfter);
  });

  it("should harvest and add reward", async () => {
    await bFarmSushiswap.connect(traderAccount).transferAndInvest(oneThousandUSDT, oneThousandUSDT);

    const lpBalanceBeforeWithNoRewards = await bFarmSushiswap.lpBalance();

    for (let i = 0; i < 60; i++) {
      await advanceTimeAndBlock(1000);
    }

    await harvestHelper.harvest(0, ethers.constants.AddressZero);

    const lpBalanceAfterWithNoRewards = await bFarmSushiswap.lpBalance();

    const bFarmTotalSupply = await bFarmSushiswap.totalSupply();

    await bFarmSushiswap.connect(traderAccount).withdrawAndCollect(bFarmTotalSupply);
    await harvestHelper.harvest(0, ethers.constants.AddressZero); // just to clear

    await bFarmSushiswap.connect(traderAccount).transferAndInvest(oneThousandUSDT, oneThousandUSDT);

    const lpBalanceBeforeWithRewards = await bFarmSushiswap.lpBalance();

    for (let i = 0; i < 60; i++) {
      await advanceTimeAndBlock(1000);
    }

    const usdtBalanceBefore = await token0.balanceOf(rewarderAccount.address);

    await harvestHelper.harvest(10000 * 1000, rewarderAccount.address);

    const usdtBalanceAfter = await token0.balanceOf(rewarderAccount.address);
    expect(usdtBalanceAfter).to.be.lt(usdtBalanceBefore);

    const lpBalanceAfterWithRewards = await bFarmSushiswap.lpBalance();

    expect(lpBalanceAfterWithRewards - lpBalanceBeforeWithRewards).to.be.gt(lpBalanceAfterWithNoRewards - lpBalanceBeforeWithNoRewards);
  });

  it("should emit event", async () => {
    await bFarmSushiswap.connect(traderAccount).transferAndInvest(oneThousandUSDT, oneThousandUSDT);

    for (let i = 0; i < 60; i++) {
      await advanceTimeAndBlock(1000);
    }

    await expect(harvestHelper.harvest(10000 * 1000, rewarderAccount.address)).to.emit(harvestHelper, 'Harvest');
  });

  it('should disallow harvest method by stranger', async () => {
    await expect(harvestHelper.connect(traderAccount).harvest(0, ethers.constants.AddressZero)).to.be.revertedWith("caller is not the owner");
  });
});
