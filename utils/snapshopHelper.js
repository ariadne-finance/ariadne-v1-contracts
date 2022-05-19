module.exports = hre => {
  let lastSnapshot = null;

  hre.takeSnapshot = async () => {
    lastSnapshot = await hre.network.provider.request({
      method: 'evm_snapshot',
      params: []
    });
  };

  hre.revertToSnapShot = async () => {
    await hre.network.provider.request({
      method: 'evm_revert',
      params: [ lastSnapshot ]
    });

    lastSnapshot = null;
  };

  hre.increaseTime = async (time) => {
    await hre.network.provider.request({
      method: 'evm_increaseTime',
      params: [ time ]
    });
  };

  hre.mineOneBlock = async () => {
    await hre.network.provider.request({
      method: 'evm_mine',
      params: []
    });
  };

  hre.advanceTimeAndBlock = async (time) => {
    await hre.increaseTime(time);
    await hre.mineOneBlock();
  };
};
