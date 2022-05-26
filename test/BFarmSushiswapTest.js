const debug = require('debug')("BFarm:test");
const chai = require('chai');
const { solidity } = require('ethereum-waffle');
const { locatePoolIdFromMasterChef, parseAddressFromEnv, swapOneETHForEachToken, wrapFiveETH, getEverything, burnTokens } = require('../utils/BFarmUtils.js');
const EthereumMatchers = require('./utilities/EthereumMatchers.js');

chai.use(solidity);
chai.use(EthereumMatchers);
const expect = chai.expect;

const tokenAAddress = parseAddressFromEnv(process.env.TOKENA, 'token A');
const tokenBAddress = parseAddressFromEnv(process.env.TOKENB, 'token B');
const routerAddress = parseAddressFromEnv(process.env.ROUTER, 'router');
const masterChefAddress = parseAddressFromEnv(process.env.MASTERCHEF, 'MasterChef');
const isV2 = Boolean(process.env.V2);

describe(isV2 ? 'BFarmSushiswapV2' : 'BFarmSushiswap', function () {
  let bFarmSushiswap;
  let masterChef, poolId;
  let router, token0, token1, WETH;
  let traderAccount, managerAccount;
  let primaryRewardToken;
  const rewardTokenContracts = [];
  let tokensToCollectContracts = [], tokensToCollectAddresses = [];

  async function getRewardBalances(account) {
    const balances = [];
    for (const contract of rewardTokenContracts) {
      const balance = await contract.balanceOf(account);
      debug(`Reward ${contract.address} balance ${balance}`);
      balances.push(balance);
    }

    return balances;
  }

  before(async () => {
    let deployerAccount;
    [ deployerAccount, traderAccount, managerAccount ] = await hre.ethers.getSigners();

    let pair;
    ({ router, token0, token1, WETH, pair } = await getEverything({ routerAddress, tokenAAddress, tokenBAddress }));

    masterChef = await ethers.getContractAt(isV2 ? 'ISushiswapMasterChefV2' : 'ISushiswapMasterChef', masterChefAddress);

    poolId = await locatePoolIdFromMasterChef(masterChef, pair.address);

    if (poolId === null) {
      throw new Error("FAILED, cannot find poolId for pair address " + pair.address);
    }

    let primaryRewardTokenAddress = null;

    if (masterChef.address == '0x3838956710bcc9D122Dd23863a0549ca8D5675D6') {
      const _masterChef = await ethers.getContractAt(['function TRI() public view returns (address)'], masterChefAddress);
      primaryRewardTokenAddress = await _masterChef.TRI();
      debug(`Got primary reward token ${primaryRewardTokenAddress} from trisolaris' masterChefV2`);

    } else if (masterChef.address == '0x1f1Ed214bef5E83D8f5d0eB5D7011EB965D0D79B') {
      const _masterChef = await ethers.getContractAt(['function tri() public view returns (address)'], masterChefAddress);
      primaryRewardTokenAddress = await _masterChef.tri();
      debug(`Got primary reward token ${primaryRewardTokenAddress} from trisolaris' masterChef`);

    } else if (masterChef.SUSHI) {
      primaryRewardTokenAddress = await masterChef.SUSHI();
      debug(`Got primary reward token ${primaryRewardTokenAddress} from classic masterChef.SUSHI()`);

    } else if (masterChef.sushi) {
      primaryRewardTokenAddress = await masterChef.sushi();
      debug(`Got primary reward token ${primaryRewardTokenAddress} from classic masterChef.sushi()`);
    }

    primaryRewardToken = await ethers.getContractAt('ERC20', primaryRewardTokenAddress);

    rewardTokenContracts.push(primaryRewardToken);
    debug(`Primary rewarder ${primaryRewardToken.address} ${primaryRewardToken.address}`);

    if (masterChef.rewarder) {
      const rewarderContract = await ethers.getContractAt('IRewarder', await masterChef.rewarder(poolId));
      debug(`Loaded rewarder ${rewarderContract.address}`);

      const pendingTokensResult = await rewarderContract.pendingTokens(poolId, ethers.constants.AddressZero, 1);
      const rewardTokenAddresses = pendingTokensResult[0];
      debug(`Loaded reward tokens list length = ${rewardTokenAddresses.length}`);

      for (const rewardTokenAddress of rewardTokenAddresses) {
        const contract = await ethers.getContractAt('ERC20', rewardTokenAddress);
        rewardTokenContracts.push(contract);
        debug(`Rewarder ${contract.address} ${contract.address}`);
      }
    }

    tokensToCollectContracts = [
      ...rewardTokenContracts,
      token0,
      token1
    ];

    tokensToCollectAddresses = tokensToCollectContracts.map(c => c.address);

    const BFarmSushiswap = await ethers.getContractFactory(isV2 ? 'BFarmSushiswapV2' : 'BFarmSushiswap');

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

    debug("Deployed");

    await WETH.connect(traderAccount).approve(router.address, ethers.constants.MaxUint256);

    debug(`WETH approved`);

    await wrapFiveETH({ WETH, account: traderAccount });

    debug(`WETH wrapped`);

    await swapOneETHForEachToken({ WETH, token0, token1, router, account: traderAccount });

    debug(`Pair tokens swapped`);

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it('should harvest', async () => {
    await token0.connect(traderAccount).transfer(bFarmSushiswap.address, await token0.balanceOf(traderAccount.address));
    await token1.connect(traderAccount).transfer(bFarmSushiswap.address, await token1.balanceOf(traderAccount.address));

    await bFarmSushiswap.connect(traderAccount).invest();

    // collect what's left after invest
    await bFarmSushiswap.connect(traderAccount).collectTokens(tokensToCollectAddresses, traderAccount.address);

    // we need to clear tokens to properly compare with zero later on
    await burnTokens(tokensToCollectContracts, traderAccount);

    expect(await bFarmSushiswap.lpBalance()).to.be.gt(0);
    expect(await bFarmSushiswap.balanceOf(traderAccount.address)).to.be.gt(0);

    for (let i = 0; i < 30; i++) {
      await advanceTimeAndBlock(1); // we only need to mine blocks, not time
    }

    const rewardBalancesBefore = await getRewardBalances(traderAccount.address);

    for (let i=0; i<rewardTokenContracts.length; i++) {
      expect(rewardBalancesBefore[i]).to.be.eq(0);
    }

    await bFarmSushiswap.connect(traderAccount).harvest();
    await bFarmSushiswap.connect(traderAccount).collectTokens(tokensToCollectAddresses, traderAccount.address);

    const rewardBalancesAfter = await getRewardBalances(traderAccount.address);

    for (let i=0; i<rewardTokenContracts.length; i++) {
      expect(rewardBalancesBefore[i]).to.be.lt(rewardBalancesAfter[i]);
    }
  });

  it('should withdraw', async () => {
    await token0.connect(traderAccount).transfer(bFarmSushiswap.address, await token0.balanceOf(traderAccount.address));
    await token1.connect(traderAccount).transfer(bFarmSushiswap.address, await token1.balanceOf(traderAccount.address));

    expect(await bFarmSushiswap.balanceOf(traderAccount.address)).to.be.eq(0);

    await bFarmSushiswap.connect(traderAccount).invest();

    // collect what's left after invest
    await bFarmSushiswap.connect(traderAccount).collectTokens(tokensToCollectAddresses, traderAccount.address);

    // we need to clear tokens to properly compare with zero later on
    await burnTokens(tokensToCollectContracts, traderAccount);

    const lpTokensAfterInvest = await bFarmSushiswap.balanceOf(traderAccount.address);
    expect(lpTokensAfterInvest).to.be.gt(0);

    await bFarmSushiswap.connect(managerAccount).setSlippagePercentMultiplier(9990);
    await bFarmSushiswap.connect(traderAccount).withdraw(lpTokensAfterInvest.div(2));

    await bFarmSushiswap.connect(traderAccount).collectTokens(tokensToCollectAddresses, traderAccount.address);

    expect(await bFarmSushiswap.balanceOf(traderAccount.address)).to.be.lt(lpTokensAfterInvest);

    const balances = await chai.util.snapshotBalances(traderAccount.address, [ token0, token1 ]);
    expect(balances).balancesNoneAreZero;
  });

  it('should emergency withdraw', async () => {
    await token0.connect(traderAccount).transfer(bFarmSushiswap.address, await token0.balanceOf(traderAccount.address));
    await token1.connect(traderAccount).transfer(bFarmSushiswap.address, await token1.balanceOf(traderAccount.address));

    await bFarmSushiswap.connect(traderAccount).invest();

    // collect what's left after invest
    await bFarmSushiswap.connect(traderAccount).collectTokens(tokensToCollectAddresses, traderAccount.address);

    // we need to clear tokens to properly compare with zero later on
    await burnTokens(tokensToCollectContracts, traderAccount);

    await bFarmSushiswap.connect(managerAccount).setSlippagePercentMultiplier(9990);
    await bFarmSushiswap.connect(traderAccount).emergencyWithdraw();

    await bFarmSushiswap.connect(traderAccount).collectTokens(tokensToCollectAddresses, traderAccount.address);

    expect(await bFarmSushiswap.balanceOf(traderAccount.address)).to.be.eq(0);

    const balances = await chai.util.snapshotBalances(traderAccount.address, [ token0, token1 ]);
    expect(balances).balancesNoneAreZero;
  });

  const MISSING_ROLE_REASON = 'is missing role';
  it('should disallow trader methods by stranger and by manager', async () => {
    await Promise.all([
      expect(bFarmSushiswap.harvest()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswap.invest()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswap.withdraw(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswap.stakeTokens()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswap.unstakeTokens(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswap.addLiquidity()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswap.removeLiquidity(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswap.emergencyWithdraw()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswap.collectTokens([ ethers.constants.AddressZero ], ethers.constants.AddressZero)).to.be.revertedWith(MISSING_ROLE_REASON),

      expect(bFarmSushiswap.pause()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswap.unpause()).to.be.revertedWith(MISSING_ROLE_REASON),
    ]);

    const bFarmSushiswapAsManager = bFarmSushiswap.connect(managerAccount);

    await Promise.all([
      expect(bFarmSushiswapAsManager.harvest()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswapAsManager.invest()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswapAsManager.withdraw(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswapAsManager.stakeTokens()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswapAsManager.unstakeTokens(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswapAsManager.addLiquidity()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswapAsManager.removeLiquidity(1)).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswapAsManager.emergencyWithdraw()).to.be.revertedWith(MISSING_ROLE_REASON),
      expect(bFarmSushiswapAsManager.collectTokens([ ethers.constants.AddressZero ], ethers.constants.AddressZero)).to.be.revertedWith(MISSING_ROLE_REASON),
    ]);
  });
});
