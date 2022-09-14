module.exports = async function({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const [ owner ] = await ethers.getSigners();

  const farmAddress = process.env.FARM_ADDRESS;
  if (!farmAddress) {
    console.log("FARM_ADDRESS");
    process.exit(1);
  }

  const farm = await ethers.getContractAt('BFarmBase', farmAddress);
  const TRADER_ROLE = await farm.TRADER_ROLE();

  console.log(`Farm ok, TRADER_ROLE=${TRADER_ROLE}`);

  await deploy('HelperAuroraTrisolarisTriStableSwap02', {
    from: owner.address,
    args: [farm.address],
    log: true
  });
};

module.exports.tags = ['HelperAuroraTrisolarisTriStableSwap02'];
