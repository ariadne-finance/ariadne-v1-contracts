module.exports = async function({ deployments }) {
  const [ owner ] = await ethers.getSigners();

  const ARDN = await deployments.get('ARDN');

  const SingleChef = await deployments.deploy('SingleChef', {
    from: owner.address,
    log: true,
    args: [ARDN.address, owner.address]
  });

  await ARDN.approve(SingleChef.address, ethers.constants.MaxUint256);
};

module.exports.tags = ['SingleChef'];
module.exports.dependencies = ['ARDN'];
