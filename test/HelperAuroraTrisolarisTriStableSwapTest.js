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

describe('HelperAuroraTrisolarisTriStableSwap', function () {
  let bFarm;

  const tenThousandsUSDT = ethers.BigNumber.from(10_000n * 10n**6n);

  let usdt;
  let traderAccount, managerAccount, rewarderAccount;
  let harvestHelper;

  before(async () => {
    let deployerAccount;
    [ deployerAccount, traderAccount, managerAccount ] = await hre.ethers.getSigners();

    rewarderAccount = managerAccount; // reuse of accounts, who cares

    const BFarmTriStableSwap = await ethers.getContractFactory('BFarmTriStableSwap');
    bFarm = await BFarmTriStableSwap.deploy(
      managerAccount.address,
      managerAccount.address,
      traderAccount.address
    );

    await bFarm.deployed();

    const HarvestHelper = await ethers.getContractFactory('HelperAuroraTrisolarisTriStableSwap');
    harvestHelper = await HarvestHelper.deploy(bFarm.address);

    debug("Deployed");

    usdt = await ethers.getContractAt('ERC20', '0x4988a896b1227218e4A686fdE5EabdcAbd91571f');

    await bFarm.connect(managerAccount).grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE')), harvestHelper.address);
    await usdt.connect(traderAccount).approve(bFarm.address, 2n**256n-1n);

    await sponsor({
      token: usdt.address,
      accounts: [ traderAccount.address ],
      amount: 100_000
    });

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it("should invest then harvest", async () => {
    await bFarm.connect(traderAccount).transferAndInvest([ 0, tenThousandsUSDT, 0 ]);

    const lpBalanceBefore = await bFarm.lpBalance();
    expect(lpBalanceBefore).to.be.gt(0);

    expect(await bFarm.balanceOf(traderAccount.address)).to.be.gt(0);

    for (let i = 0; i < 60; i++) {
      await advanceTimeAndBlock(1000);
    }

    const bFarmTotalSupplyBefore = await bFarm.totalSupply();
    await harvestHelper.harvest(0, ethers.constants.AddressZero);
    const bFarmTotalSupplyAfter = await bFarm.totalSupply();

    expect(bFarmTotalSupplyAfter).to.be.eq(bFarmTotalSupplyBefore);

    await advanceTimeAndBlock(1000);

    await bFarm.connect(traderAccount).withdraw(bFarmTotalSupplyAfter);
  });

  it("should emit event", async () => {
    await bFarm.connect(traderAccount).transferAndInvest([ 0, tenThousandsUSDT, 0 ]);

    for (let i = 0; i < 60; i++) {
      await advanceTimeAndBlock(1000);
    }

    await expect(harvestHelper.harvest(0, ethers.constants.AddressZero)).to.emit(harvestHelper, 'Harvest');
  });

  it('should disallow harvest method by stranger', async () => {
    await expect(harvestHelper.connect(traderAccount).harvest(0, ethers.constants.AddressZero)).to.be.revertedWith("caller is not the owner");
  });
});
