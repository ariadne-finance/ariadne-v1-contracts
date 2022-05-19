const chai = require('chai');
const fs = require('fs');
const { solidity } = require('ethereum-waffle');
const { ethers } = require('hardhat');

chai.use(solidity);
const expect = chai.expect;

function readAbi(name) {
  return JSON.parse(fs.readFileSync(__dirname + '/../../' + name + '.json').toString());
}

describe('BFarmEllipsis', function () {
  let bFarmEllipsis, pool, ellipsisLpStaking, rewardTokenContract;
  let traderAccount, managerAccount;
  let usdt, usdtDecimals;

  before(async () => {
    let deployerAccount;
    [ deployerAccount, traderAccount, managerAccount ] = await hre.ethers.getSigners();

    const BFarmEllipsis = await ethers.getContractFactory('BFarmEllipsis');
    bFarmEllipsis = await BFarmEllipsis.deploy();

    await bFarmEllipsis.deployed();

    console.log("Deployed");

    const TRADER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE'));
    const MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MANAGER_ROLE'));

    await bFarmEllipsis.grantRole(MANAGER_ROLE, managerAccount.address);
    await bFarmEllipsis.grantRole(TRADER_ROLE, traderAccount.address);

    const usdtAddress = await bFarmEllipsis.COIN(3);
    usdt = await ethers.getContractAt('ERC20', usdtAddress);
    usdtDecimals = Number(await usdt.decimals());

    for (let i=0; i<=3; i++) {
      const address = await bFarmEllipsis.COIN(i);
      const contract = await ethers.getContractAt('ERC20', address);
      await contract.connect(traderAccount).approve(bFarmEllipsis.address, 2n**256n-1n);
    }

    const poolAddress = await bFarmEllipsis.pool();
    pool = new ethers.Contract(poolAddress, readAbi('abi-additional/ellipsis/StableSwap'), ethers.provider);

    const ellipsisLpStakingAddress = await bFarmEllipsis.ellipsisLpStaking();
    ellipsisLpStaking = new ethers.Contract(ellipsisLpStakingAddress, readAbi('abi-additional/ellipsis/EllipsisLpStaking'), ethers.provider);

    const rewardTokenAddress = await ellipsisLpStaking.rewardToken();
    rewardTokenContract = await ethers.getContractAt('ERC20', rewardTokenAddress);

    const router = await ethers.getContractAt('IUniswapV2Router02', '0x10ED43C718714eb63d5aA57B78B54704E256024E');
    const wethAddress = await router.WETH();

    const weth = await ethers.getContractAt('ERC20', wethAddress);

    await traderAccount.sendTransaction({
      to: wethAddress,
      value: ethers.utils.parseEther('1')
    });

    await weth.connect(traderAccount).approve(router.address, 2n**256n-1n);

    await router.connect(traderAccount).swapExactTokensForTokens(
      ethers.utils.parseEther('1'),
      0,
      [ wethAddress, usdtAddress ],
      traderAccount.address,
      Math.floor(Date.now() / 1000) + 86400
    );

    await takeSnapshot();
  });

  afterEach("Revert snapshot after test", async () => {
    await revertToSnapShot();
    await takeSnapshot();
  });

  it('should invest, harvest and withdraw', async () => {
    const usdtAmount = ethers.utils.parseUnits('10', usdtDecimals);

    const virtualPrice = await pool.get_virtual_price();

    await bFarmEllipsis.connect(traderAccount).transferAndInvest([0, 0, 0, usdtAmount]);

    const lpBalanceAfterInvest = await bFarmEllipsis.lpBalance();

    // LP almost eq original investment amount
    expect(lpBalanceAfterInvest).to.be.closeTo(usdtAmount, usdtAmount.div(100));

    // virtual_price almost eq 1 USD
    expect(lpBalanceAfterInvest.mul(virtualPrice).div(10n**18n)).to.be.closeTo(usdtAmount, usdtAmount.div(100));

    const rewardBalanceAfterInvest = await rewardTokenContract.balanceOf(bFarmEllipsis.address);

    await bFarmEllipsis.connect(traderAccount).harvest();
    expect(await rewardTokenContract.balanceOf(bFarmEllipsis.address)).to.be.gt(rewardBalanceAfterInvest);

    const usdtBalanceAfterInvest = await usdt.balanceOf(traderAccount.address);

    await bFarmEllipsis.connect(traderAccount).withdrawAndCollect(lpBalanceAfterInvest);

    const usdtBalanceAfterWithdraw = await usdt.balanceOf(traderAccount.address);
    expect(usdtBalanceAfterWithdraw.sub(usdtBalanceAfterInvest)).to.be.closeTo(usdtAmount, usdtAmount.div(100));
  });
});
