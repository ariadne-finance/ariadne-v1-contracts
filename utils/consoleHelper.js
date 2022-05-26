const fs = require('fs');
const path = require('path');

module.exports = hre => {
  for (const contractName of 'ExtranetTokenQueued BFarmBase BFarmUniswap BFarmSushiswapV2 BFarmSushiswap BFarmEllipsis ERC20 Bridge Farming'.split(' ')) {
    hre[contractName] = async address => {
      return await ethers.getContractAt(contractName, address);
    };
  }

  for (const contractName of 'UniswapV2Router02 UniswapV2Factory UniswapV2Pair'.split(' ')) {
    hre[contractName] = async address => {
      return await ethers.getContractAt('I' + contractName, address);
    };
  }

  hre.E = async address => {
    return await ethers.getContractAt('ExtranetTokenQueued', address);
  };

  hre.readAbi = function(contractName) {
    let fullpath = path.join(process.cwd(), 'abi', contractName + '.json');
    if (fs.existsSync(fullpath)) {
      return JSON.parse(fs.readFileSync(fullpath).toString());
    }

    fullpath = path.join(process.cwd(), 'abi-additional', contractName + '.json');
    if (fs.existsSync(fullpath)) {
      return JSON.parse(fs.readFileSync(fullpath).toString());
    }

    console.error("ABI '%s' not found", contractName);
    return null;
  }
};
