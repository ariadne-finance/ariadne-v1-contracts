const crypto = require('crypto');
const chai = require('chai');
const { solidity } = require('ethereum-waffle');
const { createETHFundedAccount } = require('../utils/BFarmUtils.js');

chai.use(solidity);
const expect = chai.expect;

function randomTxHash() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

describe("ExtranetTokenQueued", function () {
  let extranetToken, quoteToken;
  let myAccount, managerAccount, traderAccount;
  const deadlineInTheFuture = Math.floor(Date.now() / 1000) + 86400;

  before(async () => {
    [ myAccount, managerAccount, traderAccount ] = await hre.ethers.getSigners();

    const QuoteToken = await ethers.getContractFactory('TestToken');
    quoteToken = await QuoteToken.deploy('USDTEST', 6);
    await quoteToken.deployed();

    const ExtranetToken = await ethers.getContractFactory('ExtranetTokenQueued');
    extranetToken = await ExtranetToken.deploy(
      18,
      quoteToken.address,
      ethers.constants.AddressZero,
      0,
      "Extranet something/something",
      "arSMTH",
      managerAccount.address,
      managerAccount.address,
      traderAccount.address
    );
    await extranetToken.deployed();

    await quoteToken.connect(myAccount).approve(extranetToken.address, ethers.constants.MaxUint256);

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it("should mint and burn tokens", async () => {
    expect(await extranetToken.balanceOf(extranetToken.address)).to.equal(0);
    expect(await extranetToken.totalSupply()).to.equal(0);

    await extranetToken.connect(traderAccount).mint(100, randomTxHash());

    expect(await extranetToken.balanceOf(extranetToken.address)).to.equal(100);
    expect(await extranetToken.totalSupply()).to.equal(100);

    await extranetToken.connect(traderAccount).burn(30);

    expect(await extranetToken.balanceOf(extranetToken.address)).to.equal(70);
    expect(await extranetToken.totalSupply()).to.equal(70);
  });

  it("non-trader cannot mint or burn", async () => {
    await expect(extranetToken.mint(100, randomTxHash())).to.be.revertedWith('is missing role');
    await expect(extranetToken.burn(100)).to.be.revertedWith('is missing role');
  });

  it("only trader can collectTokens", async () => {
    await expect(extranetToken.collectTokens([ quoteToken.address ], ethers.constants.AddressZero)).to.be.revertedWith('is missing role');
  });

  it("only trader can run queues", async () => {
    await expect(extranetToken.runInvestmentQueue(1, 1, 1, deadlineInTheFuture)).to.be.revertedWith('is missing role');
    await expect(extranetToken.runWithdrawalQueue(1, 1, 1, deadlineInTheFuture)).to.be.revertedWith('is missing role');
  });

  it('only manager can set properties', async () => {
    await Promise.all([
      expect(extranetToken.cancelInvestmentForAccountAtIndex(ethers.constants.AddressZero, 0)).to.be.revertedWith('is missing role'),
      expect(extranetToken.cancelWithdrawalForAccountAtIndex(ethers.constants.AddressZero, 0)).to.be.revertedWith('is missing role'),
      expect(extranetToken.cancelTopInvestments(1)).to.be.revertedWith('is missing role'),
      expect(extranetToken.cancelTopWithdrawals(1)).to.be.revertedWith('is missing role'),
      expect(extranetToken.withdrawForAddress(myAccount.address)).to.be.revertedWith('is missing role'),
      expect(extranetToken.setBridge(myAccount.address, 0)).to.be.revertedWith('is missing role'),
      expect(extranetToken.setFeeTo(myAccount.address)).to.be.revertedWith('is missing role'),
      expect(extranetToken.pause()).to.be.revertedWith('is missing role'),
      expect(extranetToken.unpause()).to.be.revertedWith('is missing role'),
      expect(extranetToken.shutdown(myAccount.address)).to.be.revertedWith('is missing role'),
      expect(extranetToken.setLimits(1,1)).to.be.revertedWith('is missing role')
    ]);
  });

  it("should respect limits", async () => {
    await quoteToken.mint(1);
    await extranetToken.connect(managerAccount).setLimits(10, 20);
    await expect(extranetToken.invest(1)).to.be.revertedWith('min');
    await expect(extranetToken.withdraw(11)).to.be.revertedWith('min');
  });

  it("should emit Burn and Mint events", async () => {
    const tx = randomTxHash();
    await expect(extranetToken.connect(traderAccount).mint(100, tx)).to.emit(extranetToken, 'BridgeMint').withArgs(100, tx);
    await expect(extranetToken.connect(traderAccount).burn(100)).to.emit(extranetToken, 'BridgeBurn').withArgs(100);
  });

  it("duplicate transactions are reverted", async () => {
    const txHash = randomTxHash();
    await extranetToken.connect(traderAccount).mint(100, txHash);
    await expect(extranetToken.connect(traderAccount).mint(100, txHash)).to.be.revertedWith('tx already minted');
  });

  it("should not let me invest when paused", async () => {
    await extranetToken.connect(managerAccount).pause();
    await expect(extranetToken.invest(100)).to.be.revertedWith('paused');
  });

  it("should invest via queue", async () => {
    await quoteToken.mint(30); // mint more than we invest
    await extranetToken.connect(traderAccount).mint(100, randomTxHash()); // mint more than we will receive

    await extranetToken.invest(10);
    expect(await quoteToken.balanceOf(myAccount.address)).to.be.eq(20);
    expect(await quoteToken.balanceOf(extranetToken.address)).to.be.eq(10);

    let queueInfo = await extranetToken.queueInfo();
    expect(queueInfo.investmentAddressListLength).to.be.eq(1);
    expect(queueInfo.investmentTotalAmount).to.be.eq(10);

    expect(await extranetToken.balanceOf(myAccount.address)).to.be.eq(0);

    await extranetToken.connect(traderAccount).runInvestmentQueue(
      10,  // quoteTokenAmount
      2,   // extranetTokenAmount
      2,   // upToExtranetTokenAmount
      deadlineInTheFuture
    );

    // indeed gave me tokens
    expect(await extranetToken.balanceOf(myAccount.address)).to.be.eq(2);

    // quote token stays on contract
    expect(await quoteToken.balanceOf(extranetToken.address)).to.be.eq(10);

    queueInfo = await extranetToken.queueInfo();
    expect(queueInfo.investmentAddressListLength).to.be.eq(0);
    expect(queueInfo.investmentTotalAmount).to.be.eq(0);
  });

  it("should withdraw via queue", async () => {
    await quoteToken.mint(30); // mint more than we invest
    await extranetToken.connect(traderAccount).mint(100, randomTxHash()); // mint more than we will receive

    await extranetToken.invest(10);

    await extranetToken.connect(traderAccount).runInvestmentQueue(
      10,  // quoteTokenAmount
      2,   // extranetTokenAmount
      2,   // upToExtranetTokenAmount
      deadlineInTheFuture
    );

    // I have 2
    await extranetToken.withdraw(1);
    expect(await extranetToken.balanceOf(myAccount.address)).to.be.eq(1);

    queueInfo = await extranetToken.queueInfo();
    expect(queueInfo.withdrawalAddressListLength).to.be.eq(1);
    expect(queueInfo.withdrawalTotalAmount).to.be.eq(1);

    await extranetToken.connect(traderAccount).runWithdrawalQueue(
      10,    // quoteTokenAmount
      1,     // extranetTokenAmount
      10,    // upToQuoteTokenAmount
      deadlineInTheFuture
    ); // one extranetToken now costs two times more

    expect(await extranetToken.balanceOf(myAccount.address)).to.be.eq(1); // did not change

    expect(await quoteToken.balanceOf(myAccount.address)).to.be.eq(30); // received 10 quote for 1 extranet

    queueInfo = await extranetToken.queueInfo();
    expect(queueInfo.investmentAddressListLength).to.be.eq(0);
    expect(queueInfo.investmentTotalAmount).to.be.eq(0);
    expect(queueInfo.withdrawalAddressListLength).to.be.eq(0);
    expect(queueInfo.withdrawalTotalAmount).to.be.eq(0);
  });

  it("should respect the deadline", async () => {
    await quoteToken.mint(10000);
    await extranetToken.invest(10000);

    await extranetToken.connect(traderAccount).mint(40, randomTxHash());
    await expect(extranetToken.connect(traderAccount).runInvestmentQueue(1000, 4, 40, 1)).to.be.revertedWith("expired");
  });

  it("runInvestmentQueue must not be greater than balance tokens", async () => {
    await quoteToken.mint(10000);
    await extranetToken.invest(10000);

    await extranetToken.connect(traderAccount).mint(30, randomTxHash());

    await expect(extranetToken.connect(traderAccount).runInvestmentQueue(10000, 40, 40, deadlineInTheFuture)).to.be.revertedWith('balance');
  });

  it("should runInvestmentQueue until amount", async () => {
    const people1 = await createETHFundedAccount(myAccount);
    const people2 = await createETHFundedAccount(myAccount);

    await quoteToken.mint(10000);
    await extranetToken.invest(10000);

    await quoteToken.connect(people1).approve(extranetToken.address, ethers.constants.MaxUint256);
    await quoteToken.connect(people1).mint(10000);
    await extranetToken.connect(people1).invest(10000);

    await quoteToken.connect(people2).approve(extranetToken.address, ethers.constants.MaxUint256);
    await quoteToken.connect(people2).mint(10000);
    await extranetToken.connect(people2).invest(10000);

    await extranetToken.connect(traderAccount).mint(80, randomTxHash());

    await extranetToken.connect(traderAccount).runInvestmentQueue(1000, 4, 80, deadlineInTheFuture);

    await extranetToken.connect(traderAccount).mint(80, randomTxHash());
    await extranetToken.connect(traderAccount).runInvestmentQueue(1000, 4, 80, deadlineInTheFuture);
  });

  it("should runWithdrawalQueue until amount", async () => {
    const people1 = await createETHFundedAccount(myAccount);
    const people2 = await createETHFundedAccount(myAccount);

    await quoteToken.mint(10000);
    await extranetToken.invest(10000);

    await quoteToken.connect(people1).approve(extranetToken.address, ethers.constants.MaxUint256);
    await quoteToken.connect(people1).mint(10000);
    await extranetToken.connect(people1).invest(10000);

    await quoteToken.connect(people2).approve(extranetToken.address, ethers.constants.MaxUint256);
    await quoteToken.connect(people2).mint(10000);
    await extranetToken.connect(people2).invest(10000);

    await extranetToken.connect(traderAccount).mint(120, randomTxHash());
    await extranetToken.connect(traderAccount).runInvestmentQueue(10000, 40, 120, deadlineInTheFuture);

    await extranetToken.withdraw(40);
    await extranetToken.connect(people1).withdraw(40);
    await extranetToken.connect(people2).withdraw(40);

    await extranetToken.connect(traderAccount).runWithdrawalQueue(10000, 40, 20000, deadlineInTheFuture);

    await extranetToken.connect(traderAccount).runWithdrawalQueue(10000, 40, 10000, deadlineInTheFuture);
  });

  it("should collect fee on withdraw", async () => {
    await quoteToken.mint(10000);
    await extranetToken.invest(10000);

    await extranetToken.connect(traderAccount).mint(40, randomTxHash());
    await extranetToken.connect(traderAccount).runInvestmentQueue(1000, 4, 40, deadlineInTheFuture);

    const feeTo = ethers.Wallet.createRandom();
    await extranetToken.connect(managerAccount).setFeeTo(feeTo.address);

    const feeDecimals = parseInt(await extranetToken.withdrawalFeePercentDecimals());
    await extranetToken.connect(managerAccount).setWithdrawalFeePercent(20 * 10**feeDecimals);

    await extranetToken.withdraw(40); // all of it
    await extranetToken.connect(traderAccount).runWithdrawalQueue(1000, 8, 5000, deadlineInTheFuture); // one extranetToken now costs two times less
    expect(await quoteToken.balanceOf(myAccount.address)).to.be.eq(4000);
    expect(await quoteToken.balanceOf(feeTo.address)).to.equal(1000);
  });

  it("should collectTokens", async () => {
    const beggar = await createETHFundedAccount(myAccount);

    await quoteToken.mint(30);
    await extranetToken.invest(30);
    await extranetToken.connect(traderAccount).collectTokens([ quoteToken.address ], beggar.address);

    expect(await quoteToken.balanceOf(beggar.address)).to.equal(30);
  });

  it('should cancel investment', async () => {
    await quoteToken.mint(10000);
    await extranetToken.invest(10000);

    const pendingInvestmentAddressList = await extranetToken.getPendingInvestmentAddressList();
    const index = pendingInvestmentAddressList.indexOf(myAccount.address);
    expect(index).to.be.gte(0);

    await extranetToken.cancelInvestment(index);

    expect(await quoteToken.balanceOf(myAccount.address)).to.be.eq(10000);

    const queueInfo = await extranetToken.queueInfo();
    expect(queueInfo.investmentAddressListLength).to.be.eq(0);
    expect(queueInfo.investmentTotalAmount).to.be.eq(0);
    expect(queueInfo.withdrawalAddressListLength).to.be.eq(0);
    expect(queueInfo.withdrawalTotalAmount).to.be.eq(0);
  });

  it('should cancel investment for account', async () => {
    await quoteToken.mint(10000);
    await extranetToken.invest(10000);

    const pendingInvestmentAddressList = await extranetToken.getPendingInvestmentAddressList();
    const index = pendingInvestmentAddressList.indexOf(myAccount.address);
    expect(index).to.be.gte(0);

    await extranetToken.connect(managerAccount).cancelInvestmentForAccountAtIndex(myAccount.address, index);

    expect(await quoteToken.balanceOf(myAccount.address)).to.be.eq(10000);

    const queueInfo = await extranetToken.queueInfo();
    expect(queueInfo.investmentAddressListLength).to.be.eq(0);
    expect(queueInfo.investmentTotalAmount).to.be.eq(0);
    expect(queueInfo.withdrawalAddressListLength).to.be.eq(0);
    expect(queueInfo.withdrawalTotalAmount).to.be.eq(0);
  });

  it('check for stuck entries in pendingInvestmentAddressList', async () => {
    await quoteToken.mint(20000);
    await extranetToken.invest(10000);
    await extranetToken.invest(10000);

    const pendingInvestmentAddressList = await extranetToken.getPendingInvestmentAddressList();
    expect(pendingInvestmentAddressList.length).to.be.eq(1);
    const index = pendingInvestmentAddressList.indexOf(myAccount.address);
    expect(index).to.be.eq(0);

    await extranetToken.connect(managerAccount).cancelInvestmentForAccountAtIndex(myAccount.address, index);

    expect(await quoteToken.balanceOf(myAccount.address)).to.be.eq(20000);

    const queueInfo = await extranetToken.queueInfo();
    expect(queueInfo.investmentAddressListLength).to.be.eq(0);
    expect(queueInfo.investmentTotalAmount).to.be.eq(0);
    expect(queueInfo.withdrawalAddressListLength).to.be.eq(0);
    expect(queueInfo.withdrawalTotalAmount).to.be.eq(0);
  });

  it('should cancel top investments when paused', async () => {
    await expect(extranetToken.connect(managerAccount).cancelTopInvestments(1)).to.be.revertedWith('not_paused');
  });

  it('should cancel top investments', async () => {
    const otherGuy = await createETHFundedAccount(traderAccount);

    await quoteToken.connect(otherGuy).approve(extranetToken.address, ethers.constants.MaxUint256);

    await quoteToken.mint(10000);
    await extranetToken.invest(10000);

    await quoteToken.mintTo(otherGuy.address, 10000);
    await extranetToken.connect(otherGuy).invest(10000);

    await extranetToken.connect(managerAccount).pause();
    await extranetToken.connect(managerAccount).cancelTopInvestments(1);

    const balanceMy = await quoteToken.balanceOf(myAccount.address);
    const balanceOtherGuy = await quoteToken.balanceOf(otherGuy.address);

    expect(balanceMy.add(balanceOtherGuy)).to.be.eq(10000);

    const queueInfo = await extranetToken.queueInfo();
    expect(queueInfo.investmentAddressListLength).to.be.eq(1);
    expect(queueInfo.investmentTotalAmount).to.be.eq(10000);
  });

  it('should cancel withdrawal', async () => {
    await quoteToken.mint(10000);
    await extranetToken.connect(traderAccount).mint(40, randomTxHash());

    await extranetToken.invest(10000);
    await extranetToken.connect(traderAccount).runInvestmentQueue(1000, 4, 40, deadlineInTheFuture);
    await extranetToken.withdraw(40);

    const pendingWithdrawalAddressList = await extranetToken.getPendingWithdrawalAddressList();
    const index = pendingWithdrawalAddressList.indexOf(myAccount.address);
    expect(index).to.be.gte(0);

    await extranetToken.cancelWithdrawal(index);

    expect(await quoteToken.balanceOf(myAccount.address)).to.be.eq(0);
    expect(await extranetToken.balanceOf(myAccount.address)).to.be.eq(40);

    const queueInfo = await extranetToken.queueInfo();
    expect(queueInfo.investmentAddressListLength).to.be.eq(0);
    expect(queueInfo.investmentTotalAmount).to.be.eq(0);
    expect(queueInfo.withdrawalAddressListLength).to.be.eq(0);
    expect(queueInfo.withdrawalTotalAmount).to.be.eq(0);
  });

  it("should withdraw for account", async () => {
    await quoteToken.mint(10000);
    await extranetToken.invest(10000);

    await extranetToken.connect(traderAccount).mint(40, randomTxHash());
    await extranetToken.connect(traderAccount).runInvestmentQueue(1000, 4, 40, deadlineInTheFuture);

    await extranetToken.connect(managerAccount).withdrawForAddress(myAccount.address);

    await extranetToken.connect(traderAccount).runWithdrawalQueue(1000, 8, 5000, deadlineInTheFuture); // one extranetToken now costs two times less

    expect(await quoteToken.balanceOf(myAccount.address)).to.be.eq(5000);
  });
});
