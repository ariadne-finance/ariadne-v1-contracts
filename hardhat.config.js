const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const createKeccakHash = require('keccak');

require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-web3');
require('hardhat-deploy');
// require('@primitivefi/hardhat-dodoc');
require('hardhat-abi-exporter');
require('solidity-docgen');

const { sponsor } = require('./utils/sponsor');
extendEnvironment(require('./utils/snapshopHelper.js'));
extendEnvironment(require('./utils/consoleHelper.js'));

task('sponsor', "Add existing coins to accounts")
  .addOptionalParam('account', "The account's addresses or indexes (default: first three accounts aka '0,1,2')")
  .addOptionalParam('net', "Network to run (mainnet, polygon, moonriver, etc)", 'mainnet')
  .setAction(async (taskArgs, hre) => {
    let USDT_ADDRESS;

    if (taskArgs.net == 'polygon') {
      USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';

    } else if (taskArgs.net == 'moonriver') {
      USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';

    } else if (taskArgs.net == 'aurora') {
      USDT_ADDRESS = '0x4988a896b1227218e4A686fdE5EabdcAbd91571f';

    } else if (taskArgs.net == 'fantom') {
      USDT_ADDRESS = '0x049d68029688eAbF473097a2fC38ef61633A3C7A';

    } else if (taskArgs.net == 'bsc') {
      USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

    } else { // mainnet
      USDT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
    }

    const signers = await hre.ethers.getSigners();

    const accounts = (taskArgs.account ?? '0,1,2')
      .replace(/\s+/g, '')
      .split(',')
      .filter(a => a.length > 0)
      .map(addressOrIndex => {
        if (parseInt(addressOrIndex).toString() == addressOrIndex) {
          return signers[parseInt(addressOrIndex)].address;

        } else if (addressOrIndex.startsWith('0x')) {
          return addressOrIndex;
        }

        return null;
      })
      .filter(candidate => Boolean(candidate));

    await sponsor({
      token: USDT_ADDRESS,
      accounts,
      amount: 300_000
    });

    const usdtContract = await ethers.getContractAt('ERC20', USDT_ADDRESS);

    for (const account of accounts) {
      const balanceUsdt = await usdtContract.balanceOf(account);
      console.log("Sponsored %s to %s USDT", account, balanceUsdt.toString());
    }
  });

task('slow', "Disable automine")
  .setAction(async (taskArgs, hre) => {
    await hre.network.provider.send('evm_setAutomine', [false]);
  });

task('mine1000', "Mine 1000 blocks")
  .setAction(async (taskArgs, hre) => {
    for (let i=0; i<1000; i++) {
      await hre.network.provider.request({
        method: 'evm_mine',
        params: []
      });
    }
  });

task('mine1', "Mine 1 blocks")
  .setAction(async (taskArgs, hre) => {
    await hre.network.provider.request({
      method: 'evm_mine',
      params: []
    });
  });

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
      arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(__dirname, dirPath, file));
    }
  });

  return arrayOfFiles;
}

task('afer-docgen', "Fix docs after docgen")
  .setAction(async (taskArgs, hre) => {
    const files = getAllFiles('docs').filter(f => f.endsWith('.md'));
    for (const file of files) {
      const source = fs.readFileSync(file)
        .toString()
        .split('\n')
        .map(l => {
          if (l == '# Solidity API') {
            return '';
          }

          if (l.startsWith('#')) {
            return l.substring(1);
          }

          return l;
        })
        .map(l => l.replaceAll('&#x60;', '`'))
        .join('\n')
        .replace(/^\n+/s, '');

      fs.writeFileSync(file, source);
    }
  });

module.exports = {
  networks: {
    forked: {
      url: 'http://127.0.0.1:7545'
    },
    forked1: {
      url: 'http://127.0.0.1:7546'
    },
    aurora: {
      url: 'https://mainnet.aurora.dev/M8A2AWJQ'
    },
    bsc: {
      url: 'https://bsc-dataseed.binance.org'
    },

    polygon: {
      url: 'https://polygon-rpc.com/',
    },

    fantom: {
      url: 'https://rpc.ftm.tools/',
    },

  },

  solidity: {
    version: '0.8.15',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },

  abiExporter: {
    path: './abi',
    runOnCompile: false,
    clear: true,
    flat: true,
    spacing: 2,
    pretty: false
  },

  // docgen: {
  //   pages: 'files',
  //   runOnCompile: false // ignored by hardhat-dodoc anyway :-(
  // }
};
