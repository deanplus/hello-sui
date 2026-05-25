import { cacheService } from '../../utils/cache';
import * as cetusAggregator from './aggregator';
import { getLogger } from '@sui-dex/common';
const logger = getLogger('CetusPrice');

export async function getPrice(fromCoinType: string, toCoinType?: string): Promise<number | null> {
  const price = await cetusAggregator.getPrice(fromCoinType, toCoinType);
  if (price) return price;
  logger.warn(`Get price by Cetus: No price found for ${fromCoinType} to ${toCoinType}`);
  return null;
}
