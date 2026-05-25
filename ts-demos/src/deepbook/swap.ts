import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { getPoolInfo } from "./pool";
import {
  SwapParams,
  LimitOrderParams,
  SwapAmmParams,
  SwapAmmResult,
} from "./types";
import DeepBookConstants from "./constants";
import * as coinHelper from "../helpers/coin";
const logger = console;

/**
 * Build a market order swap transaction
 * Market orders are executed immediately at the best available price
 *
 * @param txb Transaction block
 * @param params Swap parameters
 * @returns Transaction result containing the output coin
 */
export async function buildMarketSwap(
  txb: Transaction,
  params: SwapParams,
): Promise<TransactionObjectArgument> {
  const {
    poolId,
    balanceManagerId,
    inputCoinType,
    outputCoinType,
    amount,
    minAmountOut,
    payWithDeep = false,
    deepAmount = 0n,
  } = params;

  // Get pool information
  const poolInfo = await getPoolInfo(poolId);
  if (!poolInfo) {
    throw new Error(`Pool not found: ${poolId}`);
  }

  // Determine if this is a buy (bid) or sell (ask) order
  // In DeepBook, base asset is always the first type argument
  const isBid = inputCoinType === poolInfo.quoteAsset;

  logger.info(
    `Building market swap: ${isBid ? "buy" : "sell"} ${amount} in pool ${poolId}`,
  );

  // Generate trade proof
  const tradeProof = txb.moveCall({
    target: `${DeepBookConstants.PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
    arguments: [txb.object(balanceManagerId)],
  });

  // Place market order
  const [baseCoin, quoteCoin, deepCoin] = txb.moveCall({
    target: `${DeepBookConstants.PACKAGE_ID}::pool::place_market_order`,
    typeArguments: [poolInfo.baseAsset, poolInfo.quoteAsset],
    arguments: [
      txb.object(poolId),
      txb.object(balanceManagerId),
      tradeProof,
      txb.pure.u64(amount),
      txb.pure.bool(isBid),
      txb.pure.u64(minAmountOut),
      txb.pure.bool(payWithDeep),
      txb.object("0x6"), // Clock object
    ],
  });

  // Return the output coin (base for buy orders, quote for sell orders)
  return isBid ? baseCoin : quoteCoin;
}

/**
 * Build a limit order placement transaction
 * Limit orders are placed in the order book at a specific price
 *
 * @param txb Transaction block
 * @param params Limit order parameters
 * @returns Order ID
 */
export async function buildLimitOrder(
  txb: Transaction,
  params: LimitOrderParams,
): Promise<TransactionObjectArgument> {
  const {
    poolId,
    balanceManagerId,
    price,
    quantity,
    isBid,
    expireTimestamp,
    payWithDeep = false,
    clientOrderId = 0n,
    selfMatchingOption = 0,
  } = params;

  const poolInfo = await getPoolInfo(poolId);
  if (!poolInfo) {
    throw new Error(`Pool not found: ${poolId}`);
  }

  logger.info(
    `Building limit order: ${isBid ? "bid" : "ask"} ${quantity} @ ${price} in pool ${poolId}`,
  );

  // Generate trade proof
  const tradeProof = txb.moveCall({
    target: `${DeepBookConstants.PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
    arguments: [txb.object(balanceManagerId)],
  });

  // Calculate expiration (default: 30 days from now if not provided)
  const expiration =
    expireTimestamp || BigInt(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Place limit order
  const [orderId, baseCoin, quoteCoin, deepCoin] = txb.moveCall({
    target: `${DeepBookConstants.PACKAGE_ID}::pool::place_limit_order`,
    typeArguments: [poolInfo.baseAsset, poolInfo.quoteAsset],
    arguments: [
      txb.object(poolId),
      txb.object(balanceManagerId),
      tradeProof,
      txb.pure.u64(clientOrderId),
      txb.pure.u8(selfMatchingOption),
      txb.pure.u64(price),
      txb.pure.u64(quantity),
      txb.pure.bool(isBid),
      txb.pure.bool(payWithDeep),
      txb.pure.u64(expiration),
      txb.object("0x6"), // Clock object
    ],
  });

  return orderId;
}

/**
 * Cancel a limit order
 *
 * @param txb Transaction block
 * @param poolId Pool object ID
 * @param balanceManagerId Balance Manager object ID
 * @param orderId Order ID to cancel
 * @param baseAsset Base asset type
 * @param quoteAsset Quote asset type
 */
export async function buildCancelOrder(
  txb: Transaction,
  poolId: string,
  balanceManagerId: string,
  orderId: bigint,
  baseAsset: string,
  quoteAsset: string,
) {
  logger.info(`Cancelling order ${orderId} in pool ${poolId}`);

  // Generate trade proof
  const tradeProof = txb.moveCall({
    target: `${DeepBookConstants.PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
    arguments: [txb.object(balanceManagerId)],
  });

  // Cancel order
  txb.moveCall({
    target: `${DeepBookConstants.PACKAGE_ID}::pool::cancel_order`,
    typeArguments: [baseAsset, quoteAsset],
    arguments: [
      txb.object(poolId),
      txb.object(balanceManagerId),
      tradeProof,
      txb.pure.u128(orderId),
      txb.object("0x6"), // Clock object
    ],
  });
}

/**
 * Build swap through multiple pools (routing)
 * Useful for swapping between tokens without direct pools
 *
 * @param txb Transaction block
 * @param inputCoinType Input coin type
 * @param inputCoin Input coin object
 * @param swapPath Array of swap parameters for each hop
 * @returns Final output coin
 */
export async function buildSwapThroughPools(
  txb: Transaction,
  inputCoinType: string,
  inputCoin: TransactionObjectArgument,
  swapPath: SwapParams[],
): Promise<{
  outputCoinType: string;
  outputCoin: TransactionObjectArgument;
}> {
  let currentCoinType = inputCoinType;
  let currentCoin = inputCoin;

  for (const swapParams of swapPath) {
    logger.info(
      `Routing swap hop: ${currentCoinType} -> ${swapParams.outputCoinType}`,
    );

    const outputCoin = await buildMarketSwap(txb, {
      ...swapParams,
      inputCoinType: currentCoinType,
    });

    currentCoinType = swapParams.outputCoinType;
    currentCoin = outputCoin;
  }

  return {
    outputCoinType: currentCoinType,
    outputCoin: currentCoin,
  };
}

/**
 * Get quote for a market order (estimate output amount)
 * Note: This is a simplified implementation. For accurate quotes,
 * you should query the order book depth or use DeepBook's view functions.
 *
 * @param poolId Pool object ID
 * @param amount Input amount
 * @param isBid Whether this is a buy order
 * @param client Optional SuiClient instance
 * @returns Estimated output amount (currently returns 0n, needs proper implementation)
 */
export async function getSwapQuote(
  poolId: string,
  amount: bigint,
  isBid: boolean,
  client?: SuiClient,
): Promise<bigint> {
  try {
    // TODO: Implement proper quote calculation by querying order book
    // This would require calling DeepBook's view functions or
    // calculating based on the order book state
    logger.warn("getSwapQuote is not fully implemented. Returns 0n for now.");
    return 0n;
  } catch (error) {
    logger.error(`Error getting swap quote for pool ${poolId}:`, error);
    return 0n;
  }
}

/**
 * Build a swap transaction using AMM-style interface (swap_exact_quantity)
 * This function does not require a BalanceManager and works directly with Coin objects
 * Similar to typical AMM interfaces like Uniswap
 *
 * @param txb Transaction block
 * @param params Swap AMM parameters
 * @returns Result containing base, quote, and deep coins
 */
export async function buildSwapAmm(
  txb: Transaction,
  params: SwapAmmParams,
): Promise<SwapAmmResult> {
  const {
    poolId,
    inputCoinType,
    inputCoin,
    outputCoinType,
    deepCoin,
    minAmountOut = 0n,
  } = params;

  // Get pool information to determine base and quote assets
  const poolInfo = await getPoolInfo(poolId);
  if (!poolInfo) {
    throw new Error(`Pool not found: ${poolId}`);
  }

  // Determine swap direction
  const isBaseToQuote = coinHelper.isSameCoinType(
    inputCoinType,
    poolInfo.baseAsset,
  );
  const isQuoteToBase = coinHelper.isSameCoinType(
    inputCoinType,
    poolInfo.quoteAsset,
  );

  if (!isBaseToQuote && !isQuoteToBase) {
    throw new Error(
      `Input coin type ${inputCoinType} does not match pool assets. Expected ${poolInfo.baseAsset} or ${poolInfo.quoteAsset}`,
    );
  }

  // Verify output coin type matches expected
  const expectedOutputType = isBaseToQuote
    ? poolInfo.quoteAsset
    : poolInfo.baseAsset;
  if (!coinHelper.isSameCoinType(outputCoinType, expectedOutputType)) {
    throw new Error(
      `Output coin type ${outputCoinType} does not match expected ${expectedOutputType}`,
    );
  }

  logger.info(
    `Building AMM swap: ${isBaseToQuote ? "base → quote" : "quote → base"} in pool ${poolId}`,
  );

  // Create zero coin for the opposite direction
  const zeroCoinType = isBaseToQuote ? poolInfo.quoteAsset : poolInfo.baseAsset;
  const zeroCoin = txb.moveCall({
    target: "0x2::coin::zero",
    typeArguments: [zeroCoinType],
  });

  // Prepare arguments based on swap direction
  const baseCoinArg = isBaseToQuote ? inputCoin : zeroCoin;
  const quoteCoinArg = isQuoteToBase ? inputCoin : zeroCoin;

  // Call swap_exact_quantity
  const [baseCoin, quoteCoin, deepCoinOut] = txb.moveCall({
    target: `${DeepBookConstants.PACKAGE_ID}::pool::swap_exact_quantity`,
    typeArguments: [poolInfo.baseAsset, poolInfo.quoteAsset],
    arguments: [
      txb.object(poolId),
      baseCoinArg,
      quoteCoinArg,
      deepCoin,
      txb.pure.u64(minAmountOut),
      txb.object("0x6"),
    ],
  });

  return {
    baseCoin,
    quoteCoin,
    deepCoin: deepCoinOut,
  };
}

export default {
  buildMarketSwap,
  buildLimitOrder,
  buildCancelOrder,
  buildSwapThroughPools,
  getSwapQuote,
  buildSwapAmm,
};
