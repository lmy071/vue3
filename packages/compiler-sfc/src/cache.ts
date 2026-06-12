/**
 * cache.ts —— 编译器缓存工厂
 *
 * ## 功能概述
 * 创建 SFC 编译器在处理过程中使用的缓存实例。
 *
 * ## 策略
 * - **构建时（Node.js）**：使用 LRU（最近最少使用）缓存，默认最大 500 条目
 *   自动驱逐最少使用的条目，控制内存占用
 * - **浏览器环境（__GLOBAL__ / __ESM_BROWSER__）**：使用普通 Map
 *   LRU 库体积较大，浏览器构建不需要此依赖
 */

import { LRUCache } from 'lru-cache'

export function createCache<T extends {}>(
  max = 500,
): Map<string, T> | LRUCache<string, T> {
  /* v8 ignore next 3 */
  if (__GLOBAL__ || __ESM_BROWSER__) {
    return new Map<string, T>()
  }
  return new LRUCache({ max })
}
