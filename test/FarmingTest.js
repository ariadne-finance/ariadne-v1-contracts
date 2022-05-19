const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Farming', () => {
  let alice, bob, custodian;
  let lpToken, rewardToken, farming;

  before(async () => {
    this.testTokenFactory = await ethers.getContractFactory('TestToken');
    this.farmingFactory = await ethers.getContractFactory('Farming');

    [ alice, bob, custodian ] = await ethers.getSigners();
  });

  beforeEach(async () => {
    lpToken = await this.testTokenFactory.deploy('LP', 18);
    rewardToken = await this.testTokenFactory.deploy('ARDN', 18);

    // farming is a farming contract with `lp` as a token to stake and `incent` as a reward token
    farming = await this.farmingFactory.deploy(lpToken.address, rewardToken.address, 'TEST', 'xTEST');

    // make sure we all have something in possession
    await lpToken.mintTo(alice.address, 100);
    await lpToken.mintTo(bob.address, 100);

    // make sure there are some incent token to incent farmers
    await rewardToken.mintTo(custodian.address, 200);

    // we don't really test ERC20 here, so bulk approve and forget
    await lpToken.connect(bob).approve(farming.address, 100000);
    await lpToken.connect(alice).approve(farming.address, 100000);
  });

  it('should see the expected balance after entrance and after leave', async () => {
    await farming.enter(100);
    // we can see the balance
    expect(await farming.balanceOf(alice.address)).to.equal(100);
    await farming.leave();

    // no balance on farming
    expect(await farming.balanceOf(alice.address)).to.equal(0);

    // LP tokens given back properly
    expect(await lpToken.balanceOf(alice.address)).to.equal(100);
  });

  it('second investor should have no rewards', async () => {
    await farming.enter(100);

    await rewardToken.connect(custodian).transfer(farming.address, 50);
    await farming.onIncent(50);

    await farming.connect(bob).enter(100);

    expect(await farming.rewardAmount(bob.address)).to.equal(0);
    await farming.connect(bob).leave();
    expect(await farming.rewardAmount(bob.address)).to.equal(0);

    expect(await farming.balanceOf(bob.address)).to.equal(0);
    expect(await rewardToken.balanceOf(bob.address)).to.equal(0);
  });

  it('should show proper reward amounts', async () => {
    await farming.enter(100);

    // what reward? we have just met!
    expect(await farming.rewardAmount(alice.address)).to.equal(0);

    await rewardToken.connect(custodian).transfer(farming.address, 6);
    await farming.onIncent(6);

    // Oh I like you, here's some rewards for you. In fact, all of it, because you're the only one
    expect(await farming.rewardAmount(alice.address)).to.equal(6);

    // new guy on the block
    await farming.connect(bob).enter(100);

    // alice is still entitled to what she was before she met bob
    expect(await farming.rewardAmount(alice.address)).to.equal(6);

    // bob is not entitled to anything yet
    expect(await farming.rewardAmount(bob.address)).to.equal(0);

    // cookies!!
    await rewardToken.connect(custodian).transfer(farming.address, 6);
    await farming.onIncent(6);

    // alice is entitled to previous reward + half of new cookies
    expect(await farming.rewardAmount(alice.address)).to.equal(9);

    // half of six cookies as he's got half of LP pool tokens in farming
    expect(await farming.rewardAmount(bob.address)).to.equal(3);

    // alice had fun
    await farming.leave();

    // she has really gone for good
    expect(await farming.balanceOf(alice.address)).to.equal(0);
    expect(await farming.rewardAmount(alice.address)).to.equal(0);

    // took her incent tokens
    expect(await rewardToken.balanceOf(alice.address)).to.equal(9);

    // and left residual incent tokens
    expect(await rewardToken.balanceOf(farming.address)).to.equal(3);

    // bob's reward hasn't changed
    expect(await farming.rewardAmount(bob.address)).to.equal(3);

    // six more cakes
    await rewardToken.connect(custodian).transfer(farming.address, 6);
    await farming.onIncent(6);

    // alice who?
    expect(await farming.rewardAmount(alice.address)).to.equal(0);

    // bob has 3 plus additional 6
    expect(await farming.rewardAmount(bob.address)).to.equal(9);

    // apocalypse
    await farming.connect(bob).leave();

    expect(await farming.balanceOf(bob.address)).to.equal(0);
    expect(await farming.rewardAmount(bob.address)).to.equal(0);
    expect(await rewardToken.balanceOf(bob.address)).to.equal(9);
  });

  it('should not allow transfers', async () => {
    await farming.enter(100);
    await expect(farming.transfer(bob.address, 1)).to.be.revertedWith('TRANSFERS_NOT_ALLOWED');
  });

  // This is what could happen if transfers are allowed!
  it.skip('hack via transfers', async () => {
    await farming.enter(100);

    await rewardToken.connect(custodian).transfer(farming.address, 50);
    await farming.onIncent(50);

    await farming.connect(bob).enter(100);

    expect(await farming.rewardAmount(bob.address)).to.equal(0);

    const eve = custodian;
    await farming.connect(bob).transfer(eve.address, 100);
    expect(await farming.rewardAmount(eve.address)).to.equal(50);
  });

  it('should not leave if has no share', async () => {
    await expect(farming.leave()).to.be.revertedWith('zero');
  });
});
