module.exports = async function({ deployments }) {
  const [ owner, user, trader ] = await ethers.getSigners();

  const tokenA = await ethers.getContractAt('ERC20', '0xA487bF43cF3b10dffc97A9A744cbB7036965d3b9'); // DERI
  const tokenASymbol = await tokenA.symbol();
  console.log('tokenA', tokenASymbol, tokenA.address);

  const tokenB = await ethers.getContractAt('ERC20', '0xdAC17F958D2ee523a2206206994597C13D831ec7'); // USDT
  const tokenBSymbol = await tokenB.symbol();
  console.log('tokenB', tokenBSymbol, tokenB.address);

  const name = `${tokenASymbol}/${tokenBSymbol}`;
  const symbol = `a${name}`;

  console.log(`Deploying farm ${name}`);

  const args = [
    '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', // router
    tokenA.address,
    tokenB.address,
    name,
    symbol,
    '0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd', // masterchef
    152 // pool id for DERI/USDT
  ];

  const BFarm = await deployments.deploy('BFarm', {
    contract: 'BFarmSushiswap',
    from: owner.address,
    args,
    log: true
  });

  if (!BFarm.newlyDeployed) {
    return;
  }

  console.log(`Giving TRADER_ROLE and MANAGER_ROLE to ${owner.address}`);

  const bFarm = await ethers.getContractAt(BFarm.abi, BFarm.address);
  await bFarm.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MANAGER_ROLE')), owner.address);
  await bFarm.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE')), trader.address);
};

module.exports.tags = ['BFarmSushiswap'];
