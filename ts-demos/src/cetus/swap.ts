import {
  Transaction,
  TransactionObjectArgument,
  TransactionResult,
} from "@mysten/sui/transactions";
import * as coinHelper from "../helpers/coin";
import CetusConstants from "./constants";
import PoolMetadatas from "./pool-metadatas.json";
const logger = console;

export async function buildSwapByCoin(
  txb: Transaction,
  params: {
    fromCoinType: string;
    toCoinType: string;
    inputCoin: TransactionObjectArgument;
    poolId: string;
  },
): Promise<TransactionResult> {
  const { fromCoinType, toCoinType, inputCoin, poolId } = params;

  const pool = PoolMetadatas.find((pool) => pool.id === poolId);
  if (!pool) {
    throw new Error(`Pool not found for poolId: ${poolId}`);
  }

  const { coin_type_a: coinTypeA, coin_type_b: coinTypeB } = pool;

  const fromCoinSymbol = await coinHelper.getSymbolByType(fromCoinType);
  const toCoinSymbol = await coinHelper.getSymbolByType(toCoinType);
  logger.info(
    `buildSwapByCoin: Cetus swap ${fromCoinSymbol} to ${toCoinSymbol} on pool ${poolId}`,
  );

  const swapDirectionFuncName =
    pool.coin_type_a === fromCoinType ? "swap_a2b" : "swap_b2a";

  const args = [
    txb.object(CetusConstants.globalConfig),
    txb.object(poolId),
    txb.object(CetusConstants.partner),
    inputCoin,
    txb.object("0x6"),
  ];

  const receieveCoin = txb.moveCall({
    target: `${CetusConstants.aggregatorContractAddr}::cetus::${swapDirectionFuncName}`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: args,
  });

  return receieveCoin;
}

export async function buildSwapThrowPools(
  txb: Transaction,
  inputCoinType: string,
  inputCoin: TransactionObjectArgument,
  poolIds: string[],
): Promise<{
  outputCoinType: string;
  outputCoin: TransactionObjectArgument;
}> {
  let middleCoinType = inputCoinType;
  let middleCoin = inputCoin;

  for (const poolId of poolIds) {
    const pool = PoolMetadatas.find((pool) => pool.id === poolId);
    if (!pool) {
      throw new Error(`Pool not found for poolId: ${poolId}`);
    }

    const { coin_type_a: coinTypeA, coin_type_b: coinTypeB } = pool;
    // Use isSameCoinType for safe comparison (handles format differences like 0x2::sui::SUI vs 0x000...002::sui::SUI)
    const isCoinA = coinHelper.isSameCoinType(middleCoinType, coinTypeA);
    const fromCoinType = isCoinA ? coinTypeA : coinTypeB;
    const toCoinType = isCoinA ? coinTypeB : coinTypeA;

    const swapedCoin = await buildSwapByCoin(txb, {
      fromCoinType,
      toCoinType,
      inputCoin: middleCoin,
      poolId,
    });

    middleCoinType = toCoinType;
    middleCoin = swapedCoin;
  }

  return { outputCoinType: middleCoinType, outputCoin: middleCoin };
}
