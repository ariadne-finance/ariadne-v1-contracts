// fantom only
const fUSDT = '0x049d68029688eAbF473097a2fC38ef61633A3C7A';

module.exports = async function({ deployments }) {
  const [ owner ] = await ethers.getSigners();

  const BFarmBeets4 = await deployments.get('BFarmBeets4');
  const bFarmBeets4 = await ethers.getContractAt(BFarmBeets4.abi, BFarmBeets4.address);

  const BRIDGE = await deployments.deploy('Bridge', {
    from: owner.address,
    args: ['Extranet', 0, bFarmBeets4.address],
    log: true
  });

  const EXTRANET_TOKEN = await deployments.deploy('ExtranetTokenQueued', {
    from: owner.address,
    args: ['Wrapped something', 'wSMTH', await bFarmBeets4.decimals(), fUSDT, BRIDGE.address],
    log: true
  });


  if (!EXTRANET_TOKEN.newlyDeployed) {
    return;
  }

  const usdt = await ethers.getContractAt('ERC20', fUSDT);

  console.log("Approving");

  await usdt.approve(EXTRANET_TOKEN.address, ethers.constants.MaxUint256);
  await bFarmBeets4.approve(BRIDGE.address, ethers.constants.MaxUint256);
};

module.exports.tags = ['ExtranetTokenQueuedBFarmBeets4'];
module.exports.dependencies = ['BFarmBeets4'];
