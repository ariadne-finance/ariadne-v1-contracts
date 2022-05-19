module.exports = async function({ deployments }) {
  const [ owner ] = await ethers.getSigners();

  await deployments.deploy('ARDN', {
    from: owner.address,
    contract: 'TestToken',
    args: ['ARDN', 18],
    log: true
  });
};

module.exports.tags = ['ARDN'];
