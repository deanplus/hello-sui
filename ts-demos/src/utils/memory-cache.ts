import NodeCache from 'node-cache';

/**
 * Cache service configuration
 */
interface CacheConfig {
  stdTTL: number; // Standard time to live in seconds
  checkperiod: number; // Check period for expired keys in seconds
  useClones: boolean; // Use clones for get/set operations
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60, // Check every minute for expired keys
  useClones: false, // Don't use clones for better performance
};

/**
 * Cache service class
 */
class MemoryCacheService {
  private cache: NodeCache;

  constructor(config: Partial<CacheConfig> = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    this.cache = new NodeCache(finalConfig);

    // Set up event listeners
    this.cache.on('set', (key, value) => {});

    this.cache.on('del', (key, value) => {});

    this.cache.on('expired', (key, value) => {});
  }

  /**
   * Get value from cache
   * @param key - Cache key
   * @returns Cached value or undefined if not found
   */
  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  /**
   * Set value to cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds (optional)
   * @returns Success status
   */
  set<T>(key: string, value: T, ttl?: number): boolean {
    if (ttl !== undefined) {
      return this.cache.set(key, value, ttl);
    }
    return this.cache.set(key, value);
  }

  /**
   * Delete key from cache
   * @param key - Cache key to delete
   * @returns Number of deleted keys
   */
  del(key: string): number {
    return this.cache.del(key);
  }

  /**
   * Check if key exists in cache
   * @param key - Cache key
   * @returns True if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get multiple values from cache
   * @param keys - Array of cache keys
   * @returns Object with key-value pairs
   */
  mget<T>(keys: string[]): { [key: string]: T } {
    return this.cache.mget(keys);
  }

  /**
   * Set multiple values to cache
   * @param keyValuePairs - Array of key-value pairs
   * @param ttl - Time to live in seconds (optional)
   * @returns Success status
   */
  mset<T>(keyValuePairs: Array<{ key: string; val: T; ttl?: number }>): boolean {
    return this.cache.mset(keyValuePairs);
  }

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Get all cache keys
   * @returns Array of cache keys
   */
  keys(): string[] {
    return this.cache.keys();
  }

  /**
   * Flush all cache data
   */
  flushAll(): void {
    this.cache.flushAll();
  }

  /**
   * Get cache size (number of keys)
   * @returns Number of keys in cache
   */
  size(): number {
    return this.cache.keys().length;
  }

  /**
   * Get or set pattern - if key exists return it, otherwise compute and cache
   * @param key - Cache key
   * @param computeFn - Function to compute value if not in cache
   * @param ttl - Time to live in seconds (optional)
   * @returns Cached or computed value
   */
  async getOrSet<T>(key: string, computeFn: () => Promise<T> | T, ttl?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const computed = await computeFn();
    this.set(key, computed, ttl);
    return computed;
  }

  /**
   * Wrap a function with caching
   * @param fn - Function to wrap
   * @param keyGenerator - Function to generate cache key from arguments
   * @param ttl - Time to live in seconds (optional)
   * @returns Wrapped function with caching
   */
  wrap<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn> | TReturn,
    keyGenerator: (...args: TArgs) => string,
    ttl?: number
  ) {
    return async (...args: TArgs): Promise<TReturn> => {
      const key = keyGenerator(...args);
      return this.getOrSet(key, () => fn(...args), ttl);
    };
  }
}

let memoryCacheService: MemoryCacheService | null = null;

function getInstance() {
  if (memoryCacheService) {
    return memoryCacheService;
  }

  memoryCacheService = new MemoryCacheService();
  return memoryCacheService;
}

export { getInstance, MemoryCacheService };
