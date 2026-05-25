import BN from 'bn.js';

export type PoolMetadata = {
  id: string;
  pool_type: string;
  coin_type_a: string;
  coin_type_b: string;
  name: string;
  index: number;
  fee_rate: string;
};

export interface FetchedPool {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  fee: string;
  tick_spacing: string;
  pool_type: string;
  address: string;
  coin_a_address: string;
  coin_type_a: string;
  coin_b_address: string;
  coin_type_b: string;
  coin_a: FetchedPoolCoinType;
  coin_b: FetchedPoolCoinType;
  price: string;
  object: FetchedPoolObject;
  pure_tvl_in_usd: string;
  [key: string]: any;
}

export interface FetchedPoolCoinType {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  balance: string; // 实际数量
  [key: string]: any;
}

export interface FetchedPoolObject {
  coin_a: number;
  coin_b: number;
  tick_spacing: number;
  fee_rate: number;
  liquidity: string;
  current_sqrt_price: string;
  [key: string]: any;
}

export type PoolWithTvl = {
  id: string;
  name: string;
  tvl: number;
  coinA: FetchedPoolCoinType;
  coinB: FetchedPoolCoinType;
};

export type PoolMetadaWithDynamicData = {
  id: string;
  pool_type: string;
  coin_type_a: string;
  coin_type_b: string;
  name: string;
  index: number;
  fee_rate: string;
  tvl: number;
  coinA: FetchedPoolCoinType;
  coinB: FetchedPoolCoinType;
};

export interface CetusFlashLoanType {
  coinType: string;
  amount: BN;
}
