module.exports = async function({ deployments }) {
  const [ owner ] = await ethers.getSigners();

  const tokenA = await ethers.getContractAt('ERC20', '0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d');
  const tokenASymbol = await tokenA.symbol();
  console.log('tokenA', tokenASymbol, tokenA.address);

  const tokenB = await ethers.getContractAt('ERC20', '0xea62791aa682d455614eaA2A12Ba3d9A2fD197af');
  const tokenBSymbol = await tokenB.symbol();
  console.log('tokenB', tokenBSymbol, tokenB.address);

  const name = `${tokenASymbol}/${tokenBSymbol}`;
  const symbol = `a${name}`;

  const args = [
    '0x2CB45Edb4517d5947aFdE3BEAbF95A582506858B', // router
    tokenA.address,
    tokenB.address,
    name,
    symbol,
    '0x3838956710bcc9D122Dd23863a0549ca8D5675D6', // masterchef
    8 // pool id
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

  const bFarm = await ethers.getContractAt(BFarm.abi, BFarm.address);
  await bFarm.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MANAGER_ROLE')), owner.address);
  await bFarm.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE')), owner.address);
};

module.exports.tags = ['BFarmTrisolaris'];
