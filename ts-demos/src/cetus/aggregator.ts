import { AggregatorClient } from "@cetusprotocol/aggregator-sdk";
import BN from "bn.js";
import * as coinHelper from "../helpers/coin";
import constants from "../constants";
import { getSuiClient } from "../helpers/rpc";

const logger = console;
const suiClient = getSuiClient();

const aggregator = new AggregatorClient({
  client: suiClient as any,
  signer: "0x1",
});

export async function getPrice(
  fromCoinType: string,
  toCoinType?: string
): Promise<number | null> {
  if (!toCoinType) toCoinType = constants.COINS.USDC.COIN_TYPE;

  if (fromCoinType === toCoinType) return 1;

  const fromCoinDecimals = await coinHelper.getDecimalsByType(fromCoinType);
  const toCoinDecimals = await coinHelper.getDecimalsByType(toCoinType);

  const amount = new BN(10).pow(new BN(fromCoinDecimals));

  const routers = await aggregator.findRouters({
    from: fromCoinType,
    target: toCoinType,
    amount,
    byAmountIn: true,
  });

  if (!routers?.paths || routers.paths.length === 0) {
    logger.error("getPrice: No paths found", fromCoinType, toCoinType);
    return null;
  }

  // Calculate weighted average price
  let totalAmountIn = new BN(0);
  let totalAmountOut = new BN(0);

  for (const path of routers.paths) {
    const { amountIn, amountOut } = path;
    totalAmountIn = totalAmountIn.add(new BN(amountIn));
    totalAmountOut = totalAmountOut.add(new BN(amountOut));
  }

  // Calculate average price by dividing total output by total input
  const precisionMultiplier = new BN(10).pow(new BN(18)); // 10^18 for better precision
  const fromCoinDecimalBN = new BN(10).pow(new BN(fromCoinDecimals));
  const toCoinDecimalBN = new BN(10).pow(new BN(toCoinDecimals));

  const avgPriceBN = totalAmountOut
    .mul(precisionMultiplier)
    .mul(fromCoinDecimalBN)
    .div(toCoinDecimalBN)
    .div(totalAmountIn);

  const avgPriceStr = Number(
    (Number(avgPriceBN) / Number(precisionMultiplier)).toFixed(12)
  );

  return avgPriceStr;
}
