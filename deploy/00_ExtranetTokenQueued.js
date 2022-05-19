// mainnet only
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

module.exports = async function({ deployments }) {
  const [ owner, user, trader ] = await ethers.getSigners();

  const BFarm = await deployments.get('BFarm');
  const bFarm = await ethers.getContractAt(BFarm.abi, BFarm.address);

  const BRIDGE = await deployments.deploy('Bridge', {
    from: owner.address,
    args: [0x7a69, bFarm.address],
    log: true
  });

  const BUSD = await deployments.deploy('TestToken', {
    from: owner.address,
    args: ['BBUSD', 18],
    log: true
  });

  const busd = await ethers.getContractAt(BUSD.abi, BUSD.address);
  await busd.mintTo(owner.address, 100_000n * 10n**18n);
  await busd.mintTo(user.address, 100_000n * 10n**18n);
  await busd.mintTo(trader.address, 100_000n * 10n**18n);

  const EXTRANET_TOKEN = await deployments.deploy('ExtranetTokenQueued', {
    from: owner.address,
    args: ['Wrapped something', 'wSMTH', await bFarm.decimals(), busd.address, BRIDGE.address, 0x7a69],
    log: true
  });

  if (!EXTRANET_TOKEN.newlyDeployed) {
    return;
  }

  console.log("Settings roles");

  const bridge = await ethers.getContractAt(BRIDGE.abi, BRIDGE.address);
  await bridge.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MANAGER_ROLE')), owner.address);
  await bridge.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE')), trader.address);

  const extranetToken = await ethers.getContractAt(EXTRANET_TOKEN.abi, EXTRANET_TOKEN.address);
  await extranetToken.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MANAGER_ROLE')), owner.address);
  await extranetToken.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE')), trader.address);
};

module.exports.tags = ['ExtranetTokenQueued'];
// module.exports.dependencies = ['BFarmSushiswapV2'];
