const SushiswapRouter02Address = '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F';

module.exports = async function({ deployments }) {
  const [ owner, user, trader ] = await ethers.getSigners();

  const router = await ethers.getContractAt('IUniswapV2Router02', SushiswapRouter02Address);

  const tokenA = await ethers.getContractAt('ERC20', '0xdAC17F958D2ee523a2206206994597C13D831ec7');
  const tokenASymbol = await tokenA.symbol();
  console.log('tokenA', tokenASymbol, tokenA.address);

  const tokenB = await ethers.getContractAt('ERC20', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
  const tokenBSymbol = await tokenB.symbol();
  console.log('tokenB', tokenBSymbol, tokenB.address);

  const name = `${tokenASymbol}/${tokenBSymbol}`;
  const symbol = `a${name}`;

  const args = [
    router.address,
    tokenA.address,
    tokenB.address,
    name,
    symbol
  ];

  const BFarmUniswap = await deployments.deploy('BFarm', {
    contract: 'BFarmUniswap',
    from: owner.address,
    args,
    log: true
  });

  if (!BFarmUniswap.newlyDeployed) {
    return;
  }

  const bFarmUniswap = await ethers.getContractAt(BFarmUniswap.abi, BFarmUniswap.address);
  await bFarmUniswap.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MANAGER_ROLE')), owner.address);
  await bFarmUniswap.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE')), trader.address);
};

module.exports.tags = ['BFarmUniswap'];
