# ariadne-v1-contracts

# General tests

```bash
./hardhat test test/FarmingTest.js
./hardhat test test/ExtranetTokenQueuedTest.js
./hardhat test test/BridgeTest.js
```

# Farms tests

## Tests on mainnet fork

Fork:

```bash
./hardhat node --no-deploy --port 7545 --fork https://cloudflare-eth.com/v1/mainnet
```

Uniswap test:

```bash
TOKENA=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2 \
TOKENB=0xdac17f958d2ee523a2206206994597c13d831ec7 \
ROUTER=0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D \
./hardhat --network forked test test/BFarmUniswapTest.js
```

Sushiswap test with MasterChefV2:

```bash
V2=1 \
TOKENA=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 \
TOKENB=0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF \
ROUTER=0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F \
MASTERCHEF=0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d \
./hardhat --network forked test test/BFarmSushiswapTest.js
```

Sushiswap test with MasterChef (v1):

```bash
TOKENA=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 \
TOKENB=0xdAC17F958D2ee523a2206206994597C13D831ec7 \
ROUTER=0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F \
MASTERCHEF=0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd \
./hardhat --network forked test test/BFarmSushiswapTest.js
```

Sushiswap test with no rewards (uniswap):

```bash
TOKENA=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 \
TOKENB=0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF \
ROUTER=0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F \
./hardhat --network forked test test/BFarmUniswaptest.js
```

## Tests on Polygon

Fork:

```bash
./hardhat node --no-deploy --port 7545 --fork https://polygon-rpc.com
```

Sushiswap test with MiniChef (v2) on Polygon:

```bash
V2=1 \
TOKENA=0x7ceb23fd6bc0add59e62ac25578270cff1b9f619     \
TOKENB=0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270     \
ROUTER=0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506     \
MASTERCHEF=0x0769fd68dFb93167989C6f7254cd0D766Fb2841F \
./hardhat --network forked test test/BFarmSushiswapTest.js
```

Sushiswap test with no rewards (uniswap) on Polygon:

```bash
TOKENA=0x7ceb23fd6bc0add59e62ac25578270cff1b9f619     \
TOKENB=0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270     \
ROUTER=0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506     \
./hardhat --network forked test test/BFarmUniswapTest.js
```

## Tests on aurora fork

Fork:

```bash
./hardhat node --no-deploy --port 7545 --fork https://mainnet.aurora.dev
```

Trisolaris test with MasterChef v2 on Aurora:

```bash
V2=1 \
TOKENA=0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d \
TOKENB=0xea62791aa682d455614eaA2A12Ba3d9A2fD197af \
ROUTER=0x2CB45Edb4517d5947aFdE3BEAbF95A582506858B \
MASTERCHEF=0x3838956710bcc9D122Dd23863a0549ca8D5675D6 \
./hardhat --network forked test test/BFarmSushiswapTest.js
```

Trisolaris test with MasterChef v1 on Aurora:

```bash
TOKENA=0x4988a896b1227218e4A686fdE5EabdcAbd91571f \
TOKENB=0xB12BFcA5A55806AaF64E99521918A4bf0fC40802 \
ROUTER=0x2CB45Edb4517d5947aFdE3BEAbF95A582506858B \
MASTERCHEF=0x1f1Ed214bef5E83D8f5d0eB5D7011EB965D0D79B \
./hardhat --network forked test test/BFarmSushiswapTest.js
```
