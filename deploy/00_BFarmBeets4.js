module.exports = async function({ deployments }) {
  const [ owner ] = await ethers.getSigners();

  const args = [
    '0xf3A602d30dcB723A74a0198313a7551FEacA7DAc',
    '0x8166994d9ebBe5829EC86Bd81258149B87faCfd3',
    17,
    `Ariadne Late Quartet`,
    `aLQ`
  ];

  await deployments.deploy('BFarmBeets4', {
    from: owner.address,
    args,
    log: true
  });
};

module.exports.tags = ['BFarmBeets4'];
