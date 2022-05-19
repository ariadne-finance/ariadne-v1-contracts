const chai = require('chai');
const { solidity } = require('ethereum-waffle');

chai.use(solidity);
const expect = chai.expect;

describe("Bridge", function () {
  let bridge;
  let bFarmToken;
  let myAccount, managerAccount, traderAccount;

  before(async () => {
    [ myAccount, managerAccount, traderAccount ] = await hre.ethers.getSigners();

    const BFarmToken = await ethers.getContractFactory('TestToken');
    bFarmToken = await BFarmToken.deploy('USDTEST', 6);
    await bFarmToken.deployed();

    const Bridge = await ethers.getContractFactory('Bridge');
    bridge = await Bridge.deploy(0x03, bFarmToken.address);

    await bridge.deployed();


    const TRADER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE'));
    const MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MANAGER_ROLE'));


    await bridge.grantRole(MANAGER_ROLE, managerAccount.address);
    await bridge.grantRole(TRADER_ROLE, traderAccount.address);

    await bFarmToken.connect(traderAccount).mint(100);
    await bFarmToken.connect(traderAccount).approve(bridge.address, 10000);

    // anyone can lock
    await bFarmToken.connect(myAccount).mint(100);
    await bFarmToken.connect(myAccount).approve(bridge.address, 10000);

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it("should emit Lock event", async () => {
    await expect(bridge.lock(10)).to.emit(bridge, 'BridgeLock').withArgs(10); // anyone can lock
    expect(await bFarmToken.balanceOf(bridge.address)).to.equal(10);
  });

  it("should lock and unlock tokens", async () => {
    await bridge.lock(10); // myAccount is locking funds
    expect(await bFarmToken.balanceOf(myAccount.address)).to.equal(90);
    expect(await bFarmToken.balanceOf(bridge.address)).to.equal(10);

    await bridge.connect(traderAccount).unlock(7, ethers.utils.arrayify('0x6392eca1adeb678494c809695bba33213f0d24182afaed2b9386fd2ec8081479'));

    expect(await bFarmToken.balanceOf(bridge.address)).to.equal(3);
    expect(await bridge.lockedAmount()).to.equal(3); // the same
    expect(await bFarmToken.balanceOf(traderAccount.address)).to.equal(107); // but traderAccount is receiving unlocked funds
  });

  it("only traderSigner can unlock", async () => {
    const dummyTx = ethers.utils.arrayify('0x6392eca1adeb678494c809695bba33213f0d24182afaed2b9386fd2ec8081478');
    await bridge.connect(traderAccount).lock(10);

    await expect(bridge.unlock(7, dummyTx)).to.be.revertedWith('is missing role');
    await expect(bridge.connect(managerAccount).unlock(7, dummyTx)).to.be.revertedWith('is missing role');

    await bridge.connect(traderAccount).unlock(7, dummyTx);
  });

  it("cannot lock when paused", async () => {
    await bridge.connect(managerAccount).pause();
    await expect(bridge.lock(10)).to.be.revertedWith('paused');
    await bridge.connect(managerAccount).unpause();
    await bridge.connect(traderAccount).lock(10);
  });

  it("duplicate transaction rejected", async () => {
    const dummyTx = ethers.utils.arrayify('0x6392eca1adeb678494c809695bba33213f0d24182afaed2b9386fd2ec8081473');
    await bridge.lock(10);

    await bridge.connect(traderAccount).unlock(7, dummyTx);
    await expect(bridge.connect(traderAccount).unlock(8, dummyTx)).to.be.revertedWith('already');
  });

  it('should only set properties via owner account', async () => {
    await Promise.all([
      expect(bridge.shutdown(myAccount.address)).to.be.revertedWith('is missing role'),
      expect(bridge.pause()).to.be.revertedWith('is missing role'),
      expect(bridge.unpause()).to.be.revertedWith('is missing role')
    ]);
  });
});
