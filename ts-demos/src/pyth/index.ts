import {
  SuiPriceServiceConnection,
  SuiPythClient,
  PriceFeedMetadata as PriceFeed,
} from '@pythnetwork/pyth-sui-js';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import config from '../../config';
import Decimal from 'decimal.js';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getLogger } from '@sui-dex/common';
import feeds from './feeds.json';
import feedToCoin from './feed-to-coin.json';
import constants from '../../constants';
const { COINS } = constants;
const logger = getLogger('PythHelper');

export type { PriceFeed };

export const PYTH_CONSTANTS = {
  SERVICE_URL: 'https://hermes.pyth.network/',
  PYTH_STATE_ID: '0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8',
  PYTH_PACKAGE_ID: '0x04e20ddf36af412a4096f9014f4a565af9e812db9a05cc40254846cf6ed0ad91',
  WORMHOLE_STATE_ID: '0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c',
  WORMHOLE_PACKAGE_ID: '0x5306f64e312b581766351c07af79c72fcb1cd25147157fdc2f8ad76de9a3fb6a',
};

type FEED = {
  feedId: string;
  feedObjectId: string;
};

export const COIN_TYPE_TO_FEED: Record<string, { feedId: string; feedObjectId: string }> = feeds;

export const PYTH_FEED_ID_TO_COIN: Record<string, { coinType: string; symbol: string }> =
  feedToCoin;

let lastUpdateTimeMap: Record<string, number> = {};

export class PythHelper {
  pythClient: SuiPythClient;
  connection: SuiPriceServiceConnection;
  private currentEventSource: any = null;
  private reconnectTimer: any = null;
  private isReconnecting = false;

  constructor(suiClient?: SuiClient) {
    if (!suiClient) suiClient = new SuiClient({ url: config.SUI_RPC_URL });

    this.pythClient = new SuiPythClient(
      suiClient as any,
      PYTH_CONSTANTS.PYTH_STATE_ID,
      PYTH_CONSTANTS.WORMHOLE_STATE_ID
    );

    this.connection = new SuiPriceServiceConnection(
      PYTH_CONSTANTS.SERVICE_URL
      // {
      //   priceFeedRequestConfig: { binary: true },
      // }
    );
  }

  // All pice feeds see https://hermes.pyth.network/v2/price_feeds?asset_type=crypto

  async getPriceFeedByCoinType(coinType: string): Promise<FEED | undefined> {
    const feed = COIN_TYPE_TO_FEED[coinType as keyof typeof COIN_TYPE_TO_FEED];
    return feed;
  }

  async getPriceTableInfo() {
    const priceTableInfo = await this.pythClient.getPriceTableInfo();
    return priceTableInfo;
  }

  async getLatestPriceFeeds(feedIds: string[]): Promise<any[] | null> {
    const priceFeeds = await this.connection.getLatestPriceUpdates(feedIds);
    return priceFeeds?.parsed || null;
  }

  async getLatestPrices(feedIds: string[]): Promise<{ [key: string]: number }> {
    const feedIdToPrice = {} as { [key: string]: number };

    const result = await this.connection.getLatestPriceUpdates(feedIds);
    const pasedDatas = result.parsed;
    if (!pasedDatas) {
      return feedIdToPrice;
    }

    for (const pasedData of pasedDatas) {
      const priceFeed = pasedData.id;
      const parsedPrice = pasedData.price;
      const { price, expo } = parsedPrice;
      const feedId = '0x' + priceFeed;

      const priceReadable = new Decimal(price.toString()).mul(10 ** expo).toNumber();

      feedIdToPrice[feedId] = priceReadable;
    }

    return feedIdToPrice;
  }

  async getPriceFeedObjectId(feedId: string): Promise<string | undefined> {
    const priceInfoObjectId = await this.pythClient.getPriceFeedObjectId(feedId);
    return priceInfoObjectId;
  }

  async getPrice(feedId: string): Promise<number | null> {
    const latestPrices = await this.getLatestPrices([feedId]);
    return latestPrices[feedId] || null;
  }

  async getPriceUpdatesAtTimestamp(feedIds: string[], timestamp: number): Promise<any> {
    const feedIdToPrice = {} as { [key: string]: number };

    const result = await this.connection.getPriceUpdatesAtTimestamp(timestamp, feedIds, {
      parsed: true,
    });
    const pasedDatas = result.parsed;
    if (!pasedDatas) {
      throw new Error('No price found ');
    }

    for (const pasedData of pasedDatas) {
      const priceFeed = pasedData.id;
      const parsedPrice = pasedData.price;
      const { price, expo } = parsedPrice;
      const feedId = '0x' + priceFeed;

      const priceReadable = new Decimal(price.toString()).mul(10 ** expo).toNumber();

      feedIdToPrice[feedId] = priceReadable;
    }

    return feedIdToPrice;
  }

  async getPriceAtTimestamp(feedId: string, timestamp: number): Promise<number | null> {
    const latestPrices = await this.getPriceUpdatesAtTimestamp([feedId], timestamp);
    return latestPrices[feedId] || null;
  }

  async getPricesAtTimestamp(feedIds: string[], timestamp: number): Promise<number | null> {
    const latestPrices = await this.getPriceUpdatesAtTimestamp(feedIds, timestamp);
    return latestPrices;
  }

  async getPriceAtTimestampByCoinType(coinType: string, timestamp: number): Promise<number | null> {
    if (coinType === COINS.HAWAL.COIN_TYPE) {
      coinType = COINS.WAL.COIN_TYPE;
    }

    const feedId = COIN_TYPE_TO_FEED[coinType].feedId;
    if (!feedId) {
      logger.warn(`No feedId found for coin type: ${coinType}`);
      return null;
    }

    const latestPrices = await this.getPriceUpdatesAtTimestamp([feedId], timestamp);
    return latestPrices[feedId] || null;
  }

  async updatePriceFeeds(feedIds: string[], keypair: Ed25519Keypair): Promise<Transaction> {
    const priceUpdateData = await this.connection.getPriceFeedsUpdateData(feedIds);

    const tx = new Transaction();
    tx.setGasBudget(1000000000);
    tx.setSender(keypair.toSuiAddress());

    const priceInfoObjectIds = await this.pythClient.updatePriceFeeds(
      tx as any,
      priceUpdateData,
      feedIds
    );

    if (!priceInfoObjectIds || priceInfoObjectIds.length !== feedIds.length) {
      throw new Error('priceInfoObjectIds is undefined or length is not equal to feedIds length');
    }

    return tx;
  }

  async buildUpdatePriceTx(txb: Transaction, coinTypes: string[]): Promise<Transaction> {
    let feedIds = [];

    coinTypes = Array.from(new Set(coinTypes));

    for (let coinType of coinTypes) {
      const feed = await this.getPriceFeedByCoinType(coinType);
      if (!feed) {
        logger.warn(`buildUpdatePriceTx: No price feed found for coin type: ${coinType}`);
        continue;
      }

      feedIds.push(feed.feedId);
    }

    feedIds = Array.from(new Set(feedIds));

    return this.buildUpdatePriceTxByFeedIds(txb, feedIds);
  }

  async buildUpdatePriceTxByFeedIds(txb: Transaction, feedIds: string[]): Promise<Transaction> {
    if (feedIds.length === 0) {
      logger.warn('No feedId to update');
      return txb;
    }

    feedIds = Array.from(new Set(feedIds));

    const priceUpdateData = await this.connection.getPriceFeedsUpdateData(feedIds);
    //todo 缓存

    const priceInfoObjectIds = await this.pythClient.updatePriceFeeds(
      txb as any,
      priceUpdateData,
      feedIds
    );

    if (!priceInfoObjectIds || priceInfoObjectIds.length !== feedIds.length) {
      throw new Error('priceInfoObjectIds is undefined or length is not equal to feedIds length');
    }

    return txb;
  }

  async getPriceFeedIds() {
    const priceFeeds = await this.connection.getPriceFeeds();
    return priceFeeds;
  }

  async pythFeedUpdateCallback(eventDataStr: string) {
    logger.debug('Received price update');

    const eventData = JSON.parse(eventDataStr);
    const pasedDatas = eventData.parsed;
    for (let pasedData of pasedDatas) {
      const priceFeed = pasedData.id;

      const parsedPrice = pasedData.price;
      const { price, expo, publish_time } = parsedPrice;
      const feedId = '0x' + priceFeed;
      const priceReadable = new Decimal(price.toString()).mul(10 ** expo).toNumber();
      const lastUpdateTime = lastUpdateTimeMap[feedId];
      if (lastUpdateTime) {
        if (publish_time - lastUpdateTime >= 2) {
          console.log(
            `====pythFeedUpdateCallback==== ${PYTH_FEED_ID_TO_COIN[feedId]?.symbol} ${priceReadable}, time gap: ${publish_time - lastUpdateTime}`
          );
        }
      }

      lastUpdateTimeMap[feedId] = publish_time;

      logger.info(
        '====pythFeedUpdateCallback====',
        PYTH_FEED_ID_TO_COIN[feedId]?.symbol,
        priceReadable,
        new Date(publish_time * 1000).toLocaleString()
      );
    }
  }

  async subscribePriceFeedUpdates(feedIds: string[], cb?: any) {
    if (!cb) cb = this.pythFeedUpdateCallback;

    // Clean up existing connection
    if (this.currentEventSource) {
      this.currentEventSource.close();
      this.currentEventSource = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      const eventSource = await this.connection.getPriceUpdatesStream(feedIds, { parsed: true });
      this.currentEventSource = eventSource;

      eventSource.onmessage = event => {
        cb(event.data);
      };

      eventSource.onerror = error => {
        logger.error('Error receiving price updates:', error);

        if (!this.isReconnecting) {
          this.isReconnecting = true;
          eventSource.close();

          // Reconnect after 3 seconds
          logger.info('Will reconnect to price feed in 3 seconds...');
          this.reconnectTimer = setTimeout(() => {
            this.isReconnecting = false;
            this.subscribePriceFeedUpdates(feedIds, cb);
          }, 3000);
        }
      };

      logger.info(`Successfully subscribed to ${feedIds.length} price feeds`);
    } catch (error) {
      logger.error('Failed to subscribe to price feeds:', error);

      // Retry after 5 seconds on connection failure
      if (!this.isReconnecting) {
        this.isReconnecting = true;
        logger.info('Will retry subscription in 5 seconds...');
        this.reconnectTimer = setTimeout(() => {
          this.isReconnecting = false;
          this.subscribePriceFeedUpdates(feedIds, cb);
        }, 5000);
      }
    }
  }

  /**
   * Stop price feed subscription and cleanup resources
   */
  stopPriceFeedSubscription() {
    if (this.currentEventSource) {
      logger.info('Stopping price feed subscription');
      this.currentEventSource.close();
      this.currentEventSource = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isReconnecting = false;
  }

  getCoinTypesByFeedId(feedId: string): string[] {
    const coinTypes = [] as string[];
    for (const [key, value] of Object.entries(COIN_TYPE_TO_FEED)) {
      if (value.feedId === feedId) {
        coinTypes.push(key as string);
      }
    }
    return coinTypes;
  }
}

export const pythHelper = new PythHelper();
