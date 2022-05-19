const debug = require('debug')("BFarm:utils");

async function createETHFundedAccount(deployerAccount) {
  const a = ethers.Wallet.createRandom().connect(hre.ethers.provider);

  await deployerAccount.sendTransaction({
    to: a.address,
    value: ethers.utils.parseEther('10')
  });

  return a;
}

function parseAddressFromEnv(env, name) {
  if (!ethers.utils.isAddress(env)) {
    console.error(`Wrong ${name} address`);
    process.exit(0);
  }

  return env;
}

async function swapOneETHForEachToken({ WETH, token0, token1, account, router }) {
  const deadline = Math.floor(Date.now() / 1000) + 86400;

  if (token0.address.toLowerCase() !== WETH.address.toLowerCase()) {
    await router.connect(account).swapExactTokensForTokens(
      ethers.utils.parseEther('1'),
      0,
      [ WETH.address, token0.address ],
      account.address,
      deadline
    );
  }

  if (token1.address.toLowerCase() !== WETH.address.toLowerCase()) {
    await router.connect(account).swapExactTokensForTokens(
      ethers.utils.parseEther('1'),
      0,
      [ WETH.address, token1.address ],
      account.address,
      deadline
    );
  }

  const [ b0, b1 ] = await Promise.all([ token0.balanceOf(account.address), token1.balanceOf(account.address) ]);

  debug(`After swap got token0 ${b0} and token1 ${b1}`);
}

async function wrapFiveETH({ WETH, account }) {
  return await account.sendTransaction({
    to: WETH.address,
    value: ethers.utils.parseEther('5')
  });
}

async function getEverything({ routerAddress, tokenAAddress, tokenBAddress }) {
  const router = await ethers.getContractAt('IUniswapV2Router02', routerAddress);
  const factory = await ethers.getContractAt('IUniswapV2Factory', await router.factory());

  debug("Loaded WETH, factory and router");

  const pairAddress = await factory.getPair(tokenAAddress, tokenBAddress);
  if (pairAddress == ethers.constants.AddressZero) {
    console.error("Cannot find pair for tokens %s/%s", tokenAAddress, tokenBAddress);
    process.exit(0);
  }

  debug("Found pair address %s", pairAddress);

  const pair = await ethers.getContractAt('IUniswapV2Pair', pairAddress);

  const token0 = await ethers.getContractAt('ERC20', await pair.token0());
  const token1 = await ethers.getContractAt('ERC20', await pair.token1());

  const WETH = await ethers.getContractAt('ERC20', await router.WETH());

  const [ symbol0, symbol1 ] = await Promise.all([
    token0.symbol(),
    token1.symbol()
  ]);

  debug(`Pair ${symbol0}/${symbol1}`);

  return { router, factory, pair, token0, token1, WETH };
}

async function burnTokens(contracts, account) {
  const burner = ethers.Wallet.createRandom();

  for (const contract of contracts) {
    const balance = await contract.balanceOf(account.address);

    if (balance.gt(0)) {
      await contract.connect(account).transfer(burner.address, balance);
      debug(`Burned ${balance} of ${contract.address}`);
    }
  }
}

// locatePoolIdFromMasterChef is the same as in MasterChefUtils.mjs... fuck the CJS/ES modules mess!

async function getLPTokenFromMasterChef(_contract, index) {
  const poolInfo = await _contract.poolInfo(index);
  return poolInfo.lpToken;
}

async function getLPTokenFromMasterChefV2(_contract, index) {
  return await _contract.lpToken(index);
}

async function getLPTokenFromBeethovenxMasterChef(_contract, index) {
  return await _contract.lpTokens(index);
}

async function locatePoolIdFromMasterChef(contract, pairAddress) {
  let _method = getLPTokenFromMasterChef;

  if (contract.lpToken) {
    _method = getLPTokenFromMasterChefV2;

  } else if (contract.lpTokens) {
    _method = getLPTokenFromBeethovenxMasterChef;
  }

  const poolLength = parseInt(await contract.poolLength());
  debug(`Pool length ${poolLength}`);

  for (let i=0; i<poolLength; i++) {
    const lpToken = await _method(contract, i);

    if (lpToken == pairAddress) {
      debug(`Pool ${i.toString().padStart(3, ' ')}    ${lpToken}    FOUND!`);
      return i;
    }

    debug(`Pool ${i.toString().padStart(3, ' ')}    ${lpToken}`);
  }

  debug(`Did not found pair ${pairAddress}`);

  return null;
}

module.exports = {
  createETHFundedAccount,
  locatePoolIdFromMasterChef,
  parseAddressFromEnv,
  swapOneETHForEachToken,
  wrapFiveETH,
  getEverything,
  burnTokens
};
