import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { CetusFlashLoanType, PoolMetadaWithDynamicData } from './types';
import * as coinHelper from '../../helpers/coin';
import CetusConstants from './constants';
import { getMaxTvlPool, getLeastFeePool } from './pool';
import constants from '../../constants';
import * as txbHelper from '../../helpers/txb';
import { getLogger } from '@sui-dex/common';
const logger = getLogger('Cetus');
const USE_LEAST_FEE_POOL_COINS = [
  constants.COINS.USDC.COIN_TYPE,
  constants.COINS.SUIUSDT.COIN_TYPE,
  constants.COINS.WUSDT.COIN_TYPE,
  constants.COINS.WUSDC.COIN_TYPE,
  constants.COINS.SUI.COIN_TYPE,
];

export function calculateFlashLoanFee(amount: BN, feeRate: BN): BN {
  const feeBase = amount.mul(feeRate);
  const divisor = new BN(1000000); // 固定值
  // 必须丝毫不差，否则会报错
  const fee = feeBase.div(divisor).add(feeBase.mod(divisor).gt(new BN(0)) ? new BN(1) : new BN(0));
  return fee;
}

export async function flashLoanWithCallback(
  tx: Transaction,
  args: CetusFlashLoanType,
  cb: (
    tx: Transaction,
    borrowedCoin: TransactionObjectArgument,
    repayAmount: BN
  ) => Promise<{
    repayCoin: TransactionObjectArgument;
  }>
): Promise<void> {
  logger.debug('Cetus flashloan...');

  const { coinType, amount } = args;
  const coinSymbol = await coinHelper.getSymbolByType(coinType);
  let borrowAmount = amount;

  let pool = await getBestPoolForFlashloan(coinType);

  if (!pool) throw new Error(`No pool found for ${coinSymbol}`);

  const { id: poolId, name: symbol, tvl: pure_tvl_in_usd, fee_rate: feeRatio } = pool;
  const feeRate = new BN(Number(feeRatio) * 10000); // 0.01(%） -> 100

  logger.info(
    `Found pool for flashloan ${coinSymbol}: pool(${symbol}), tvl(${Number(pure_tvl_in_usd).toFixed(4)}), fee(${Number(feeRatio) + '%'}), poolId(${poolId})`
  );

  const coinAType = pool.coin_type_a;
  const coinBType = pool.coin_type_b;
  const loanA = coinType === coinAType;
  const borrowCoinType = loanA ? coinAType : coinBType;
  const borrowCoinName = loanA ? pool.coinA.name : pool.coinB.name;

  if (loanA) {
    const balanceInPool = Number(pool.coinA.balance);
    const decimal = pool.coinA.decimals;
    const balanceInPoolInBaseUnit = new BN((balanceInPool * 10 ** decimal).toFixed(0));

    if (balanceInPoolInBaseUnit.lt(amount)) {
      logger.warn(
        `Insufficient balance for coinA [${borrowCoinName}], pool balance: ${balanceInPool}, borrow amount: ${amount.div(new BN(10 ** decimal))}`
      );
      // borrow 1% of the pool balance
      borrowAmount = balanceInPoolInBaseUnit.div(new BN(100));
    }
  }

  if (!loanA) {
    const balanceInPool = Number(pool.coinB.balance);
    const decimal = pool.coinB.decimals;
    const balanceInPoolInBaseUnit = new BN((balanceInPool * 10 ** decimal).toFixed(0));

    if (balanceInPoolInBaseUnit.lt(amount)) {
      logger.warn(
        `Insufficient balance for coinB [${borrowCoinName}], pool balance: ${balanceInPool}, borrow amount: ${amount.div(new BN(10 ** decimal))}`
      );
      // borrow 1% of the pool balance
      borrowAmount = balanceInPoolInBaseUnit.div(new BN(100));
    }
  }

  logger.debug('Borrowing flashloan...', borrowAmount.toString());
  let [coinABalance, coinBBalance, receipt] = tx.moveCall({
    target: `${CetusConstants.clmmContractAddr}::pool::flash_loan`,
    typeArguments: [coinAType, coinBType],
    arguments: [
      tx.object(CetusConstants.globalConfig),
      tx.object(poolId),
      tx.pure.bool(loanA),
      tx.pure.u64(borrowAmount.toString()),
    ],
  });

  const fee = calculateFlashLoanFee(borrowAmount, feeRate);
  const repayAmount = borrowAmount.add(fee);

  const borrowedBalance = loanA ? coinABalance : coinBBalance;
  const borrowedCoin = txbHelper.createCoinFromBalance(tx, borrowCoinType, borrowedBalance);

  let repayCoin;
  try {
    logger.info('Calling flashloan callback...', {
      borrowCoinType,
      borrowAmount: borrowAmount.toString(),
      fee: fee.toString(),
      repayAmount: repayAmount.toString(),
      rate:
        new Decimal(fee.toString()).div(new Decimal(borrowAmount.toString())).mul(100).toFixed(4) +
        '%',
    });
    const result = await cb(tx, borrowedCoin, repayAmount);
    repayCoin = result.repayCoin;
  } catch (error) {
    logger.error('Error in flashloan callback:', error);
    throw error;
  }

  if (!repayCoin) {
    throw new Error('payCoin is null');
  }

  logger.debug('Repaying flashloan...', repayAmount.toString(), fee.toString());

  const repayBalance = txbHelper.convertCoinIntoBalance(tx, borrowCoinType, repayCoin);

  if (loanA) {
    coinABalance = repayBalance;
  } else {
    coinBBalance = repayBalance;
  }

  tx.moveCall({
    target: `${CetusConstants.clmmContractAddr}::pool::repay_flash_loan`,
    typeArguments: [coinAType, coinBType],
    arguments: [
      tx.object(CetusConstants.globalConfig),
      tx.object(poolId),
      coinABalance,
      coinBBalance,
      receipt,
    ],
  });
}

export async function getBestPoolForFlashloan(
  coinType: string
): Promise<PoolMetadaWithDynamicData | null> {
  if (USE_LEAST_FEE_POOL_COINS.includes(coinType)) {
    return getLeastFeePool([coinType]);
  } else {
    return getMaxTvlPool([coinType]);
  }
}
