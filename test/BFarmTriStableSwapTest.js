const chai = require('chai');
const { solidity } = require('ethereum-waffle');
const { ethers } = require('hardhat');

chai.use(solidity);
const expect = chai.expect;

describe('BFarmTriStableSwap', function () {
  let bFarmTriStableSwap;
  let traderAccount, managerAccount;
  let usdt;
  let rewardTokenContracts = [];
  let masterChef;

  async function getRewardBalances(account) {
    const balances = [];
    for (const contract of rewardTokenContracts) {
      const balance = await contract.balanceOf(account);
      balances.push(balance);
    }

    return balances;
  }

  before(async () => {
    let deployerAccount;
    [ deployerAccount, traderAccount, managerAccount ] = await hre.ethers.getSigners();

    const BFarmTriStableSwap = await ethers.getContractFactory('BFarmTriStableSwap');
    bFarmTriStableSwap = await BFarmTriStableSwap.deploy(
      managerAccount.address,
      managerAccount.address,
      traderAccount.address
    );

    await bFarmTriStableSwap.deployed();

    console.log("Deployed");

    usdt = await ethers.getContractAt('ERC20', '0x4988a896b1227218e4A686fdE5EabdcAbd91571f');

    for (let i=0; i<3; i++) {
      const address = await bFarmTriStableSwap.getToken(i);
      const contract = await ethers.getContractAt('ERC20', address);
      await contract.connect(traderAccount).approve(bFarmTriStableSwap.address, 2n**256n-1n);
    }

    masterChef = await ethers.getContractAt('ISushiswapMasterChefV2', '0x3838956710bcc9D122Dd23863a0549ca8D5675D6');

    const rewarderContract = await ethers.getContractAt('IRewarder', await masterChef.rewarder(28));

    const pendingTokensResult = await rewarderContract.pendingTokens(28, ethers.constants.AddressZero, 1);
    const rewardTokenAddresses = pendingTokensResult[0];

    rewardTokenContracts.push(await ethers.getContractAt('ERC20', '0xFa94348467f64D5A457F75F8bc40495D33c65aBB')); // TRI

    for (const rewardTokenAddress of rewardTokenAddresses) {
      const contract = await ethers.getContractAt('ERC20', rewardTokenAddress);
      rewardTokenContracts.push(contract);
    }

    const router = await ethers.getContractAt('IUniswapV2Router02', '0x2CB45Edb4517d5947aFdE3BEAbF95A582506858B');
    const weth = await ethers.getContractAt('ERC20', '0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB');

    await traderAccount.sendTransaction({
      to: weth.address,
      value: ethers.utils.parseEther('1')
    });

    await weth.connect(traderAccount).approve(router.address, 2n**256n-1n);

    await router.connect(traderAccount).swapExactTokensForTokens(
      ethers.utils.parseEther('1'),
      0,
      [ weth.address, usdt.address ],
      traderAccount.address,
      Math.floor(Date.now() / 1000) + 86400
    );

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it('should invest and withdraw', async () => {
    const usdtAmount = ethers.utils.parseUnits('10', 6);
    const usdtAmount18 = usdtAmount.mul(10n**12n);

    const virtualPrice = await bFarmTriStableSwap.getVirtualPrice();

    await bFarmTriStableSwap.connect(traderAccount).transferAndInvest([0, usdtAmount, 0]);

    const usdtBalanceAfterInvest = await usdt.balanceOf(traderAccount.address);

    const lpBalanceAfterInvest = await bFarmTriStableSwap.lpBalance();

    // LP almost eq original investment amount
    expect(lpBalanceAfterInvest).to.be.closeTo(usdtAmount18, usdtAmount18.div(100));

    // virtual_price almost eq 1 USD
    expect(lpBalanceAfterInvest.mul(virtualPrice).div(10n**18n)).to.be.closeTo(usdtAmount18, usdtAmount18.div(100));

    await bFarmTriStableSwap.connect(traderAccount).withdrawAndCollect(lpBalanceAfterInvest);

    const usdtBalanceAfterWithdraw = await usdt.balanceOf(traderAccount.address);
    expect(usdtBalanceAfterWithdraw.sub(usdtBalanceAfterInvest)).to.be.closeTo(usdtAmount, usdtAmount.div(100));
  });

  it('should harvest', async () => {
    const usdtAmount = ethers.utils.parseUnits('10', 6);

    await bFarmTriStableSwap.connect(traderAccount).transferAndInvest([0, usdtAmount, 0]);

    for (let i = 0; i < 30; i++) {
      await advanceTimeAndBlock(1); // we only need to mine blocks, not time
    }

    const rewardBalancesBefore = await getRewardBalances(traderAccount.address);

    for (let i=0; i<rewardTokenContracts.length; i++) {
      expect(rewardBalancesBefore[i]).to.be.eq(0);
    }

    await bFarmTriStableSwap.connect(traderAccount).harvest();

    await bFarmTriStableSwap.connect(traderAccount).collectTokens(rewardTokenContracts.map(c => c.address), traderAccount.address);

    const rewardBalancesAfter = await getRewardBalances(traderAccount.address);

    for (let i=0; i<rewardTokenContracts.length; i++) {
      expect(rewardBalancesAfter[i]).to.be.gt(rewardBalancesBefore[i]);
    }
  });
});
