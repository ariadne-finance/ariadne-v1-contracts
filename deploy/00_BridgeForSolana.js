// mainnet only
module.exports = async function({ deployments }) {
  const [ owner, user, trader ] = await ethers.getSigners();

  const BFarm = await deployments.get('BFarm');
  const bFarm = await ethers.getContractAt(BFarm.abi, BFarm.address);

  const BRIDGE = await deployments.deploy('Bridge', {
    from: owner.address,
    args: [0xbaddad, bFarm.address],
    log: true
  });

  console.log("Settings roles");

  const bridge = await ethers.getContractAt(BRIDGE.abi, BRIDGE.address);

  await bFarm.approve(bridge.address, ethers.constants.MaxUint256);

  await bridge.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MANAGER_ROLE')), owner.address);
  await bridge.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TRADER_ROLE')), trader.address);
};

module.exports.tags = ['BridgeForSolana'];
module.exports.dependencies = ['BFarm'];
