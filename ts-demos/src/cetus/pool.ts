import fs from 'fs';
import { CetusClmmSDK, Pool } from '@cetusprotocol/sui-clmm-sdk';
import { PoolMetadata, FetchedPool, PoolWithTvl, PoolMetadaWithDynamicData } from './types';
import { getSuiClient } from '../../helpers/rpc';
import PoolMetadatas from './pool-metadatas.json';
import PoolTvls from './pool-tvls.json';
import * as coinHelper from '../../helpers/coin';
const suiClient = getSuiClient();
import { getLogger } from '@sui-dex/common';
const logger = getLogger('CetusPool');

const clmmSdk = CetusClmmSDK.createSDK({ sui_client: suiClient });

const poolMetadatas: PoolMetadata[] = [...PoolMetadatas];
const poolTvls: PoolWithTvl[] = PoolTvls.filter(pool => pool !== null) as PoolWithTvl[];

export async function getPoolById(poolId: string): Promise<Pool | null> {
  logger.info('====Get pool by id====', poolId);
  const pool = await clmmSdk.Pool.getPool(poolId);
  if (!pool) {
    logger.warn('====Pool not found====', poolId);
    return null;
  }

  return pool;
}

export async function getAndSavePoolMetadataById(poolId: string): Promise<PoolMetadata | null> {
  const existedPoolMetadata = poolMetadatas.find(poolMetadata => poolMetadata.id === poolId);

  if (existedPoolMetadata) return existedPoolMetadata;

  const newPoolMetadata = await getPoolMetadataById(poolId);
  if (!newPoolMetadata) return null;

  poolMetadatas.push(newPoolMetadata);
  poolMetadatas.sort((a, b) => a.index - b.index);

  fs.writeFileSync('./src/dexs/cetus/pool-metadatas.json', JSON.stringify(poolMetadatas, null, 2));
  logger.info('====Save new pool metadata====', newPoolMetadata.name);

  return newPoolMetadata;
}

export async function getPoolMetadataById(poolId: string): Promise<PoolMetadata | null> {
  const pool = await getPoolById(poolId);
  if (!pool) return null;

  return {
    id: pool.id,
    pool_type: pool.pool_type,
    coin_type_a: pool.coin_type_a,
    coin_type_b: pool.coin_type_b,
    name: pool.name,
    index: pool.index,
    fee_rate: String(pool.fee_rate),
  };
}

export async function fetchPoolsByCoinTypes(coinTypes: string[]): Promise<FetchedPool[]> {
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      return await _fetchPoolsByCoinTypes(coinTypes);
    } catch (error) {
      logger.debug(
        `Error getting pools by coin type:, retries: ${retries}, coinTypes: ${coinTypes.join(',')}, error: ${error}`
      );
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    }
  }

  throw new Error(`Failed to get pools by coin types after ${maxRetries} retries, ${coinTypes}`);
}

async function _fetchPoolsByCoinTypes(coinTypes: string[]): Promise<FetchedPool[]> {
  coinTypes.sort();
  let url = clmmSdk.sdkOptions.stats_pools_url!;
  url += `?order_by=-tvl&limit=50&has_mining=true&has_farming=true&no_incentives=true&display_all_pools=true&coin_type=${coinTypes.join(',')}`;

  let lpList: any[] = [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 1000); // 5s 超时

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  const resp = (await response.json()) as {
    code: number;
    msg: string;
    data: { lp_list: any[] };
  };

  if (resp.code === 0) {
    lpList = resp.data.lp_list || [];
    const pools = _convertLoListToPools(lpList);
    return pools;
  } else {
    logger.warn('====Error fetching pools====', resp.code, resp.msg, coinTypes);
  }

  return [];
}

function _convertLoListToPools(lpList: any[]): FetchedPool[] {
  return lpList.map(item => {
    item.id = item.address;
    item.coin_type_a = item.coin_a.address;
    item.coin_type_b = item.coin_b.address;

    return item;
  }) as FetchedPool[];
}

export function getLocalPoolMetadatas() {
  return poolMetadatas;
}

export function getLocalPoolMetadata(poolId: string) {
  return poolMetadatas.find(poolMetadata => poolMetadata.id === poolId);
}

export function getPoolTvlById(poolId: string): PoolWithTvl | null {
  const poolTvl = poolTvls.find(poolTvl => poolTvl.id === poolId);

  if (!poolTvl) {
    logger.warn('====Pool tvl not found====', poolId);
    return null;
  }

  return poolTvl;
}

export function getMaxTvlPool(coinTypes: string[]): PoolMetadaWithDynamicData | null {
  let pools: PoolMetadaWithDynamicData[] = [];
  let tvlPools: PoolWithTvl[] = [];

  const coinLength = coinTypes.length;

  if (coinLength === 1) {
    const coinType = coinHelper.formatCoinType(coinTypes[0]);
    tvlPools = poolTvls.filter(
      pool =>
        coinHelper.formatCoinType(pool.coinA.address) === coinType ||
        coinHelper.formatCoinType(pool.coinB.address) === coinType
    );
  } else {
    const targetCoinPair = coinTypes
      .map(coinType => coinHelper.formatCoinType(coinType))
      .sort()
      .join(',');

    tvlPools = poolTvls.filter(pool => {
      const coinTypeA = pool.coinA.address;
      const coinTypeB = pool.coinB.address;

      const coinPair = [coinTypeA, coinTypeB]
        .map(coinType => coinHelper.formatCoinType(coinType))
        .sort()
        .join(',');

      return coinPair === targetCoinPair;
    });
  }

  for (const poolTvl of tvlPools) {
    const poolMetadata = poolMetadatas.find(poolMetadata => poolMetadata.id === poolTvl.id);
    if (!poolMetadata) {
      logger.warn('====Pool metadata not found====', poolTvl.id);
      continue;
    }

    pools.push({
      ...poolMetadata,
      tvl: poolTvl.tvl,
      coinA: poolTvl.coinA,
      coinB: poolTvl.coinB,
    });
  }

  return pools.sort((a, b) => b.tvl - a.tvl)[0] || null;
}

export function getLeastFeePool(coinTypes: string[]): PoolMetadaWithDynamicData | null {
  let pools: PoolMetadaWithDynamicData[] = [];
  let metadataPools: PoolMetadata[] = [];

  const coinLength = coinTypes.length;

  if (coinLength === 1) {
    const coinType = coinHelper.formatCoinType(coinTypes[0]);
    metadataPools = poolMetadatas.filter(
      poolMetadata =>
        coinHelper.formatCoinType(poolMetadata.coin_type_a) === coinType ||
        coinHelper.formatCoinType(poolMetadata.coin_type_b) === coinType
    );
  } else {
    const targetCoinPair = coinTypes
      .map(coinType => coinHelper.formatCoinType(coinType))
      .sort()
      .join(',');

    metadataPools = poolMetadatas.filter(pool => {
      const coinTypeA = pool.coin_type_a;
      const coinTypeB = pool.coin_type_b;

      const coinPair = [coinTypeA, coinTypeB]
        .map(coinType => coinHelper.formatCoinType(coinType))
        .sort()
        .join(',');

      return coinPair === targetCoinPair;
    });
  }

  for (const poolMetadata of metadataPools) {
    const poolTvl = poolTvls.find(poolTvl => poolTvl.id === poolMetadata.id);
    if (!poolTvl) {
      logger.warn('====Pool tvl not found====', poolMetadata.id);
      continue;
    }

    pools.push({
      ...poolMetadata,
      tvl: poolTvl.tvl,
      coinA: poolTvl.coinA,
      coinB: poolTvl.coinB,
    });
  }

  return pools.sort((a, b) => Number(a.fee_rate) - Number(b.fee_rate))[0] || null;
}
