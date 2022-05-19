module.exports = async function({ deployments }) {
  const [ owner, user, trader ] = await ethers.getSigners();

  const tokenA = await ethers.getContractAt('ERC20', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
  const tokenASymbol = await tokenA.symbol();
  console.log('tokenA', tokenASymbol, tokenA.address);

  const tokenB = await ethers.getContractAt('ERC20', '0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF');
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
    '0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d', // masterchef
    0 // pool id
  ];

  const BFarm = await deployments.deploy('BFarm', {
    contract: 'BFarmSushiswapV2',
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

module.exports.tags = ['BFarmSushiswapV2'];
