module.exports = async function({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { owner } = await getNamedAccounts();

  await deploy('TestToken', {
    from: owner,
    args: ['TUSDT', 6],
    log: true
  });
};

module.exports.tags = ['TestToken'];
