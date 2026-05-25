import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";
import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import * as deepbook from "../src/deepbook";
import * as coinHelper from "../src/helpers/coin";
import * as txbHelper from "../src/helpers/txb";
import * as keypairHelper from "../src/helpers/keypair";
import constants from "../src/constants";

async function getAllPools() {
  console.log("=== Getting all pools ===");
  const pools = await deepbook.pool.getAllPools();
  console.log(`Found ${pools.length} pools with details`);

  const filePath = path.join(__dirname, "../src/deepbook", "pools.json");

  pools.sort((a, b) => a.poolId.localeCompare(b.poolId));

  fs.writeFileSync(filePath, JSON.stringify(pools, null, 2));
  console.log(`Pools saved to ${filePath}`);
}

async function getAllPoolsDetailed() {
  console.log("\n=== Getting detailed pool information ===");
  const pools = await deepbook.pool.getAllPoolsDetailed();
  console.log(`Found ${pools.length} pools with details`);

  const filePath = path.join(
    __dirname,
    "../src/deepbook",
    "pools-detailed.json",
  );

  pools.sort((a, b) => a.poolId.localeCompare(b.poolId));

  fs.writeFileSync(filePath, JSON.stringify(pools, null, 2));
  console.log(`Pools saved to ${filePath}`);
}

async function getSupportedTokens() {
  console.log("\n=== Getting supported tokens ===");
  const coinTypes = await deepbook.pool.getSupportedTokens();
  console.log(`Found ${coinTypes.length} supported tokens`);

  const coinSymbols = coinTypes.map(async (coinType) => {
    return await coinHelper.getSymbolByType(coinType);
  });
  console.log(await Promise.all(coinSymbols));
}

async function getPoolsByTokens() {
  const SUI_TYPE = constants.COINS.SUI.COIN_TYPE;
  const USDC_TYPE = constants.COINS.USDC.COIN_TYPE;
  const coinTypes = [SUI_TYPE, USDC_TYPE];
  const pools = await deepbook.pool.getPoolsByTokens(coinTypes);
  console.log(pools);
}

async function swapByCoin() {
  // SUI/USDC pool
  const fromCoinType = constants.COINS.USDC.COIN_TYPE;
  const toCoinType = constants.COINS.SUI.COIN_TYPE;
  const DEEP_TYPE = constants.COINS.DEEP.COIN_TYPE;

  const POOL_ID = (
    await deepbook.pool.getPoolsByTokens([fromCoinType, toCoinType])
  )[0].poolId;

  const txb = new Transaction();
  const keypair = keypairHelper.getKeypairFromMnemonic(
    process.env.MNEMONIC!,
    0,
  );
  const sender = keypair.toSuiAddress();
  txb.setSender(sender);
  txb.setGasBudget(100000000);

  let inputCoin: TransactionObjectArgument;
  if (fromCoinType === constants.COINS.SUI.COIN_TYPE) {
    inputCoin = txb.splitCoins(txb.gas, [1_000_000_000n])[0]; // 1 SUI
  } else {
    const coins = await coinHelper.getCoins(sender, fromCoinType);
    if (coins.length === 0) {
      throw new Error(`No ${fromCoinType} coins found for address ${sender}`);
    }

    inputCoin = txbHelper.mergeCoin(txb, coins);
  }

  const deepCoin = (await coinHelper.getCoins(sender, DEEP_TYPE))[0];

  const {
    baseCoin,
    quoteCoin,
    deepCoin: deepCoinOut,
  } = await deepbook.swap.buildSwapAmm(txb, {
    poolId: POOL_ID,
    inputCoinType: fromCoinType,
    inputCoin,
    outputCoinType: toCoinType,
    deepCoin: txb.object(deepCoin.coinObjectId),
    minAmountOut: 0n,
  });

  txb.transferObjects([baseCoin, quoteCoin, deepCoinOut], sender);

  const resp = await txbHelper.signAndSubmitTXB(txb, keypair, 3);
  console.log(resp);
}

async function getPoolsType() {
  // Test multiple pools
  const pools = [
    {
      id: "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407",
      name: "SUI_USDC",
    },
    {
      id: "0xa0b9ebefb38c963fd115f52d71fa64501b79d1adcb5270563f92ce0442376545",
      name: "WUSDC_USDC",
    },
    {
      id: "0x4e2ca3988246e1d50b9bf209abb9c1cbfec65bd95afdacc620a36c67bdb8452f",
      name: "WUSDT_USDC",
    },
  ];

  for (const pool of pools) {
    console.log(`\n=== Testing ${pool.name} ===`);
    const poolInfo = await deepbook.pool.getPoolInfo(pool.id);
    const poolType = await deepbook.pool.getPoolType(pool.id);
    const isStable = await deepbook.pool.isStablePool(pool.id);

    if (poolInfo) {
      console.log(`Pool ID: ${pool.id}`);
      console.log(`Stable Flag: ${poolInfo.stable}`);
      console.log(`Whitelisted Flag: ${poolInfo.whitelisted}`);
      console.log(`Taker Fee: ${poolInfo.takerFee}`);
      console.log(`Maker Fee: ${poolInfo.makerFee}`);
      console.log(`Stake Required: ${poolInfo.stakeRequired}`);
    }
    console.log(`Pool Type: ${poolType}`);
    console.log(`Is Stable: ${isStable}`);
  }
}

async function main() {
  await getAllPools();
  await getAllPoolsDetailed();
  // await getSupportedTokens();
  // await swapByCoin();
  // await getPoolsByTokens();
  // await getPoolsType();
}

main().catch(console.error);
