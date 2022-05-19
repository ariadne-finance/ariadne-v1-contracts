const chai = require('chai');
const fs = require('fs');
const { solidity } = require('ethereum-waffle');
const { locatePoolIdFromMasterChef } = require('../utils/BFarmUtils.js');

chai.use(solidity);
const expect = chai.expect;

const poolAddress = '0xf3A602d30dcB723A74a0198313a7551FEacA7DAc';

function readAbi(name) {
  return JSON.parse(fs.readFileSync(__dirname + '/../../' + name + '.json').toString());
}

describe('BFarmBeets4', function () {
  let bFarmBeets;
  let traderAccount, managerAccount;
  let wftm, pool, masterChef, masterChefPoolId, beets;

  before(async () => {
    let deployerAccount;
    [ deployerAccount, traderAccount, managerAccount ] = await hre.ethers.getSigners();

    masterChef = new ethers.Contract('0x8166994d9ebBe5829EC86Bd81258149B87faCfd3', readAbi('abi-additional/beets/BeethovenxMasterChef'), ethers.provider);

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

    pool = new ethers.Contract(poolAddress, readAbi('abi-additional/beets/WeightedPool'), ethers.provider);

    const vault = new ethers.Contract(await pool.getVault(), readAbi('abi-additional/beets/Vault'), ethers.provider);
    wftm = new ethers.Contract(await vault.WETH(), readAbi('abi-additional/WFTM'), traderAccount);

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
