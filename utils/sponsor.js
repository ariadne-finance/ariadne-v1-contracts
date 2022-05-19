// https://blog.euler.finance/brute-force-storage-layout-discovery-in-erc20-contracts-with-hardhat-7ff9342143ed

const SPONSOR_ADDRESS_MAINNET = '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503'; // binance

const slotNumByTokenAddress = {};
const decimalsByTokenAddress = {};

async function getDecimals(token) {
  if (decimalsByTokenAddress[token]) {
    return decimalsByTokenAddress[token];
  }

  const contract = await ethers.getContractAt('ERC20', token);
  const decimals = parseInt(await contract.decimals(), 10);

  decimalsByTokenAddress[token] = decimals;
  return decimals;
}

async function findBalancesSlotWithCache(token) {
  if (slotNumByTokenAddress[token]) {
    return slotNumByTokenAddress[token];
  }

  const slotNum = await findBalancesSlot(token);
  slotNumByTokenAddress[token] = slotNum;

  return slotNum;
}

async function findBalancesSlot(token) {
  const account = ethers.constants.AddressZero;

  const probeA = ethers.utils.defaultAbiCoder.encode(['uint'], [111]);
  const probeB = ethers.utils.defaultAbiCoder.encode(['uint'], [222]);

  const contract = await ethers.getContractAt('ERC20', token);

  for (let i = 0; i < 100; i++) {
    let probedSlot = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(['address', 'uint'], [account, i])
    );

    // remove padding for JSON RPC
    while (probedSlot.startsWith('0x0')) {
      probedSlot = '0x' + probedSlot.slice(3);
    }

    const prev = await network.provider.send(
      'eth_getStorageAt',
      [token, probedSlot, 'latest']
    );

    // make sure the probe will change the slot value
    const probe = prev === probeA ? probeB : probeA;

    await network.provider.send('hardhat_setStorageAt', [
      token,
      probedSlot,
      probe
    ]);

    const balance = await contract.balanceOf(account);

    // reset to previous value
    await network.provider.send('hardhat_setStorageAt', [
      token,
      probedSlot,
      prev
    ]);

    if (balance.eq(ethers.BigNumber.from(probe))) {
      return i;
    }
  }

  return null;
}

async function sponsorWithToken({ token, slotNum, account, value }) {
  const storageData = ethers.utils.defaultAbiCoder.encode(['uint'], [value]);

  let slot = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(['address', 'uint'], [account, slotNum])
  );

  // remove padding for JSON RPC
  while (slot.startsWith('0x0')) {
    slot = '0x' + slot.slice(3);
  }

  await network.provider.send('hardhat_setStorageAt', [
    token,
    slot,
    storageData
  ]);
}


async function sponsor_ganache({ token, accounts, amount }) {
  const me = await ethers.getSigner();

  await me.sendTransaction({
    to: SPONSOR_ADDRESS_MAINNET,
    value: ethers.utils.parseEther('1')
  });

  const decimals = await getDecimals(token);
  const value = ethers.BigNumber.from(amount).mul(ethers.BigNumber.from(10).pow(decimals));

  const signer = await ethers.getSigner(SPONSOR_ADDRESS_MAINNET);

  const tokenContract = (await ethers.getContractAt('ERC20', token)).connect(signer);

  await Promise.all(accounts.map(account => tokenContract.transfer(account, value)));
}

async function sponsor_hardhat({ token, accounts, amount }) {
  const slotNum = await findBalancesSlotWithCache(token);
  if (slotNum === null) {
    throw new Error("Cannot find slot num");
  }

  const decimals = await getDecimals(token);

  const value = ethers.BigNumber.from(amount).mul(ethers.BigNumber.from(10).pow(decimals));

  await Promise.all(
    accounts.map(
      account => sponsorWithToken({
        token,
        slotNum,
        account,
        value
      })
    )
  );
}

async function sponsor({ token, accounts, amount }) {
  try {
    await hre.network.provider.request({
      method: 'hardhat_getAutomine',
      params: [],
    });

    console.log("Running hardhat");

    return sponsor_hardhat({ token, accounts, amount });

  } catch (e) {
    console.log("Not running hardhat");

    return sponsor_ganache({ token, accounts, amount });
  }
}

module.exports = {
  sponsor
};
