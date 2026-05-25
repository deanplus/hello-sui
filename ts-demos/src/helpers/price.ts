import constants from "../constants";
import { cacheInstance } from "../utils/cache";
import { PythHelper, COIN_TYPE_TO_FEED } from "../pyth";
import * as cetusPrice from "../cetus/price";
const logger = console;

export class PriceHelper {
  maxGetPriceRetries: number;
  priceCacheDuration: number;
  pythHelper: PythHelper;
  cacheInstance: typeof cacheInstance;

  constructor() {
    this.maxGetPriceRetries = 3;
    this.priceCacheDuration = 3; // 3s

    this.pythHelper = new PythHelper();
    this.cacheInstance = cacheInstance;
  }

  async getSuiPrice() {
    return this.getPrice(constants.COINS.SUI.COIN_TYPE);
  }

  async getCachedPythPrice(coinType: string): Promise<number | null> {
    const feedId =
      COIN_TYPE_TO_FEED[coinType as keyof typeof COIN_TYPE_TO_FEED]?.feedId;
    if (!feedId) {
      logger.debug(`Pyth feed for coin[${coinType}] not found`);
      return null;
    }

    const priceStr = await this.cacheInstance.get(`pyth_price_${feedId}`);
    if (!priceStr) {
      logger.debug(`Get cached pyth price for coin[${coinType}] not found`);
      return null;
    }

    logger.debug(
      `Get cached pyth price for coin[${coinType}] result: ${priceStr}`
    );
    return Number(priceStr);

    // const cacheKey = `pyth_prices`;
    // const cachedPrice = await this.cacheInstance.get(cacheKey);
    // if (!cachedPrice) return null;

    // const pythPrices = JSON.parse(cachedPrice);
    // const feedId = COIN_TYPE_TO_FEED[coinType as keyof typeof COIN_TYPE_TO_FEED]?.feedId;
    // if (!feedId) return null;

    // const price = pythPrices[feedId];
    // return price || null;
  }

  async getPrice(coinType: string): Promise<number | null> {
    const cacheKey = `coin_price_${coinType}`;

    const cachedPrice = await this.cacheInstance.get(cacheKey);
    if (cachedPrice) {
      logger.debug(
        `Get cached price for coin[${coinType}] result: ${cachedPrice}`
      );
      return Number(cachedPrice);
    }

    let price = await this.getPriceByPyth(coinType);

    if (!price) {
      price = await this.getPriceByCetus(coinType);
    }

    if (!price) {
      logger.warn(`Price[${coinType}] not found`);
      return null;
    }

    await this.cacheInstance.set(
      cacheKey,
      price.toString(),
      this.priceCacheDuration
    );

    return price;
  }

  async getPriceByPyth(coinType: string): Promise<number | null> {
    const noPythFeedCoinTypes = [
      constants.COINS.ALPHA.COIN_TYPE,
      constants.COINS.FUD.COIN_TYPE,
      constants.COINS.EWAL.COIN_TYPE,
      constants.COINS.HAWAL.COIN_TYPE,
      constants.COINS.WWAL.COIN_TYPE,
    ];

    if (noPythFeedCoinTypes.includes(coinType)) return null;

    const cacheKey = `coin_price_pyth_${coinType}`;

    const cachePythPrice = await this.getCachedPythPrice(coinType);
    if (cachePythPrice) return cachePythPrice;

    const cachedPrice = await this.cacheInstance.get(cacheKey);
    if (cachedPrice) {
      logger.debug(
        `Get cached pyth price for coin[${coinType}] result: ${cachedPrice}`
      );
      await this.cacheInstance.set(
        cacheKey,
        cachedPrice.toString(),
        this.priceCacheDuration
      );
      return Number(cachedPrice);
    }

    if (
      coinType ===
      "0x6864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS"
    ) {
      coinType = constants.COINS.CETUS.COIN_TYPE;
    }

    const feed = COIN_TYPE_TO_FEED[coinType as keyof typeof COIN_TYPE_TO_FEED];

    if (!feed) {
      logger.warn(`Pyth feed for coin[${coinType}] not found`);
      return null;
    }

    let price = null;
    let retries = 0;
    while (retries < this.maxGetPriceRetries) {
      try {
        price = await this.pythHelper.getPrice(feed.feedId);
        break;
      } catch (error) {
        retries++;
        logger.warn(
          `Get pyth price for coin[${coinType}] failed: ${(error as Error).message}`
        );
        logger.debug(
          `Retry getting pyth price for coin[${coinType}] retries: ${retries}`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!price) {
      logger.warn(`Get pyth price for coin[${coinType}] failed`);
      return null;
    }

    await this.cacheInstance.set(
      cacheKey,
      price.toString() || "",
      this.priceCacheDuration
    );

    logger.debug(`Get pyth price for coin[${coinType}] result: ${price}`);

    return price;
  }

  async getPriceByCetus(coinType: string): Promise<number | null> {
    const cacheKey = `coin_price_cetus_${coinType}`;

    const cachedPrice = await this.cacheInstance.get(cacheKey);
    if (cachedPrice) {
      logger.debug(
        `Get cached cetus price for coin[${coinType}] result: ${cachedPrice}`
      );
      return Number(cachedPrice);
    }

    let price = null;
    let retries = 0;
    while (retries < this.maxGetPriceRetries) {
      try {
        price = await cetusPrice.getPrice(coinType);
        logger.debug(`Get cetus price for coin[${coinType}] result: ${price}`);

        // throw sui
        {
          if (coinType !== constants.COINS.SUI.COIN_TYPE) {
            logger.info(`getPrice throw sui`, coinType);
            const pricePerSui = await cetusPrice.getPrice(
              coinType,
              constants.COINS.SUI.COIN_TYPE
            );
            if (pricePerSui) {
              const suiPrice = await cetusPrice.getPrice(
                constants.COINS.SUI.COIN_TYPE
              );
              if (suiPrice) {
                price = pricePerSui * suiPrice;
              }
            }
          }
        }

        break;
      } catch (error) {
        retries++;
        logger.warn(
          `Get cetus price for coin[${coinType}] failed: ${(error as Error).message}`
        );
        logger.debug(
          `Retry getting cetus price for coin[${coinType}] retries: ${retries}`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!price) {
      logger.warn(`Get cetus price for coin[${coinType}] failed`);
      return null;
    }

    await this.cacheInstance.set(
      cacheKey,
      price.toString(),
      this.priceCacheDuration
    );

    return price;
  }

  async getAlphaPriceByPyth(): Promise<number> {
    // 暂时用 SUI 的 feedId
    const price = await this.getSuiPrice();

    if (!price) {
      throw new Error(`Alpha coin price not found`);
    }

    return price;
  }
}

const priceHelper = new PriceHelper();

export { priceHelper };
