module.exports = async function({ deployments }) {
  const [ owner ] = await ethers.getSigners();

  const ExtranetTokenQueued = await deployments.get('ExtranetTokenQueued');
  const ARDN = await deployments.get('ARDN');

  await deployments.deploy('Farming', {
    from: owner.address,
    log: true,
    args: [ExtranetTokenQueued.address, ARDN.address, 'farming contract', 'xSOMETHING']
  });
};

module.exports.tags = ['Farming'];
module.exports.dependencies = ['ExtranetTokenQueued', 'ARDN'];
