import { getInstance as getMemoryCacheService } from "./memory-cache";

const memoryCacheService = getMemoryCacheService();
const cacheInstance = memoryCacheService;

export { cacheInstance };
