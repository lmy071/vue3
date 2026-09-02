/**
 * arrayInstrumentations.ts —— 响应式数组方法拦截
 *
 * ## 功能概述
 * 拦截原生数组方法，确保对响应式数组的操作正确触发依赖追踪。
 *
 * 三类拦截策略：
 * | 类别 | 方法 | 策略 |
 * |------|------|------|
 * | 读操作 | concat/join/includes/indexOf/lastIndexOf | reactiveReadArray 读取原始数组后执行 |
 * | 迭代操作 | map/filter/forEach/every/some/find/findLast | shallowReadArray → 包装回调参数 |
 * | 写操作 | push/pop/shift/unshift/splice | pauseTracking + startBatch 暂停追踪执行 |
 *
 * ## 写操作的特殊处理（#2137）
 * push/pop/shift/unshift/splice 会产生循环追踪死锁：
 * 1. 执行 push → 读取 length → track length
 * 2. 修改 length → trigger length → 重新执行 effect → push → ...
 *
 * 解决方案：在写操作期间暂停追踪（pauseTracking），完成后恢复（resetTracking）。
 * 同时包裹在批处理中，避免触发多次更新。
 */

import { TrackOpTypes } from './constants'
import { endBatch, pauseTracking, resetTracking, startBatch } from './effect'
import {
  isProxy,
  isReactive,
  isReadonly,
  isShallow,
  toRaw,
  toReactive,
  toReadonly,
} from './reactive'
import { ARRAY_ITERATE_KEY, track } from './dep'
import { isArray } from '@vue/shared'

/**
 * 响应式读取数组（追踪迭代依赖，返回原始数组与响应式值）
 *
 * reactive 数组：返回 cloned raw array，每个值转 toReactive
 * shallowReactive / raw 数组：返回原数组
 *
 * @returns 如果是 reactive 数组 → 克隆的 raw 数组 + reactive 值；否则 → raw 数组本身
 */
export function reactiveReadArray<T>(array: T[]): T[] {
  const raw = toRaw(array)
  if (raw === array) return raw // 已经是 raw 数组，直接返回
  track(raw, TrackOpTypes.ITERATE, ARRAY_ITERATE_KEY)
  // shallow → 不包装元素；非 shallow → 每个元素转 reactive
  return isShallow(array) ? raw : raw.map(toReactive)
}

/**
 * 浅层读取数组（仅追踪，不包装元素）
 *
 * 用于 write 操作以外的读操作中间步骤。
 */
export function shallowReadArray<T>(arr: T[]): T[] {
  track((arr = toRaw(arr)), TrackOpTypes.ITERATE, ARRAY_ITERATE_KEY)
  return arr
}

/**
 * 包装函数：按 target 的响应式类型包装元素
 *
 * - 只读 + 响应式 → toReadonly(toReactive(item))
 * - 只读 → toReadonly(item)
 * - 其他 → toReactive(item)
 */
function toWrapped(target: unknown, item: unknown) {
  if (isReadonly(target)) {
    return isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item)
  }
  return toReactive(item)
}

/**
 * 数组方法拦截表
 *
 * 以 `__proto__: null` 创建无原型对象防止属性查找冲突。
 * 每个拦截方法的标注 `@ts-expect-error user code may run in es2016+`
 * 是因为 Vue 代码本身限制在 es2016，但用户代码可能运行在更高版本。
 */
export const arrayInstrumentations: Record<string | symbol, Function> = <any>{
  __proto__: null,

  /**
   * Symbol.iterator 拦截
   *
   * for...of 循环时被调用。包装返回的迭代器，使每个值变为响应式版本。
   */
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, item => toWrapped(this, item))
  },

  /**
   * concat 拦截
   *
   * 对响应式数组调用 concat 时，参数中的数组也需 reactiveReadArray。
   */
  concat(...args: unknown[]) {
    return reactiveReadArray(this).concat(
      ...args.map(x => (isArray(x) ? reactiveReadArray(x) : x)),
    )
  },

  /**
   * entries 拦截
   *
   * 返回包装的 entries 迭代器，将 value 包装为响应式版本。
   */
  entries() {
    return iterator(this, 'entries', (value: [number, unknown]) => {
      value[1] = toWrapped(this, value[1])
      return value
    })
  },

  every(
    fn: (item: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return apply(this, 'every', fn, thisArg, undefined, arguments)
  },

  /**
   * filter 拦截
   *
   * 过滤后的结果数组元素需要重新包装为响应式版本。
   */
  filter(
    fn: (item: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return apply(
      this,
      'filter',
      fn,
      thisArg,
      v => v.map((item: unknown) => toWrapped(this, item)),
      arguments,
    )
  },

  find(
    fn: (item: unknown, index: number, array: unknown[]) => boolean,
    thisArg?: unknown,
  ) {
    return apply(
      this,
      'find',
      fn,
      thisArg,
      item => toWrapped(this, item),
      arguments,
    )
  },

  findIndex(
    fn: (item: unknown, index: number, array: unknown[]) => boolean,
    thisArg?: unknown,
  ) {
    return apply(this, 'findIndex', fn, thisArg, undefined, arguments)
  },

  findLast(
    fn: (item: unknown, index: number, array: unknown[]) => boolean,
    thisArg?: unknown,
  ) {
    return apply(
      this,
      'findLast',
      fn,
      thisArg,
      item => toWrapped(this, item),
      arguments,
    )
  },

  findLastIndex(
    fn: (item: unknown, index: number, array: unknown[]) => boolean,
    thisArg?: unknown,
  ) {
    return apply(this, 'findLastIndex', fn, thisArg, undefined, arguments)
  },

  // flat/flatMap 也能受益于 ARRAY_ITERATE 追踪，但实现较复杂

  forEach(
    fn: (item: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return apply(this, 'forEach', fn, thisArg, undefined, arguments)
  },

  /**
   * includes 拦截
   *
   * 特殊处理：如果第一个参数是响应式 proxy，
   * 第一次用 proxy 查找失败后，用 raw value 再查找一次。
   */
  includes(...args: unknown[]) {
    return searchProxy(this, 'includes', args)
  },

  /**
   * indexOf 拦截
   *
   * 同 includes：响应式 proxy 查询回退 raw 查询。
   */
  indexOf(...args: unknown[]) {
    return searchProxy(this, 'indexOf', args)
  },

  join(separator?: string) {
    return reactiveReadArray(this).join(separator)
  },

  // keys() 迭代器只读 length，无需特殊处理

  /**
   * lastIndexOf 拦截
   *
   * 同 indexOf：响应式 proxy 查询回退 raw 查询。
   */
  lastIndexOf(...args: unknown[]) {
    return searchProxy(this, 'lastIndexOf', args)
  },

  map(
    fn: (item: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return apply(this, 'map', fn, thisArg, undefined, arguments)
  },

  /**
   * pop 拦截
   *
   * #2137 写操作：暂停追踪 + 批处理包裹。
   */
  pop() {
    return noTracking(this, 'pop')
  },

  /**
   * push 拦截
   *
   * #2137 写操作：暂停追踪 + 批处理包裹。
   */
  push(...args: unknown[]) {
    return noTracking(this, 'push', args)
  },

  reduce(
    fn: (
      acc: unknown,
      item: unknown,
      index: number,
      array: unknown[],
    ) => unknown,
    ...args: unknown[]
  ) {
    return reduce(this, 'reduce', fn, args)
  },

  reduceRight(
    fn: (
      acc: unknown,
      item: unknown,
      index: number,
      array: unknown[],
    ) => unknown,
    ...args: unknown[]
  ) {
    return reduce(this, 'reduceRight', fn, args)
  },

  /**
   * shift 拦截
   *
   * #2137 写操作：暂停追踪 + 批处理包裹。
   */
  shift() {
    return noTracking(this, 'shift')
  },

  // slice 也能用 ARRAY_ITERATE，但也可能需要 range tracking

  some(
    fn: (item: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return apply(this, 'some', fn, thisArg, undefined, arguments)
  },

  /**
   * splice 拦截
   *
   * #2137 写操作：暂停追踪 + 批处理包裹。
   */
  splice(...args: unknown[]) {
    return noTracking(this, 'splice', args)
  },

  // ES2023 方法：toReversed / toSorted / toSpliced（只读操作，仅追踪）
  toReversed() {
    // @ts-expect-error user code may run in es2016+
    return reactiveReadArray(this).toReversed()
  },

  toSorted(comparer?: (a: unknown, b: unknown) => number) {
    // @ts-expect-error user code may run in es2016+
    return reactiveReadArray(this).toSorted(comparer)
  },

  toSpliced(...args: unknown[]) {
    // @ts-expect-error user code may run in es2016+
    return (reactiveReadArray(this).toSpliced as any)(...args)
  },

  /**
   * unshift 拦截
   *
   * #2137 写操作：暂停追踪 + 批处理包裹。
   */
  unshift(...args: unknown[]) {
    return noTracking(this, 'unshift', args)
  },

  values() {
    return iterator(this, 'values', item => toWrapped(this, item))
  },
}

/**
 * 创建包装的迭代器
 *
 * 对响应式数组的迭代器进行包装，确保每次 next() 返回响应式值。
 * 非 shallow 模式下做两件事：包装值 + 自定义 next。
 *
 * ### 追踪简化的理由
 * 迭代器的创建不会访问任何数组属性——只有 .next() 时才会访问索引和 length。
 * 理论上迭代器可以在不同 effect scope 中被分段消费，但 JS 迭代器只能读取一次，
 * 这在实际使用中不成立，所以简化为 `shallowReadArray` 一次性追踪是合理的。
 */
function iterator(
  self: unknown[],
  method: keyof Array<unknown>,
  wrapValue: (value: any) => unknown,
) {
  const arr = shallowReadArray(self)
  const iter = (arr[method] as any)() as IterableIterator<unknown> & {
    _next: IterableIterator<unknown>['next']
  }
  // 非 shallow 模式下包装 next()
  if (arr !== self && !isShallow(self)) {
    iter._next = iter.next
    iter.next = () => {
      const result = iter._next()
      if (!result.done) {
        result.value = wrapValue(result.value)
      }
      return result
    }
  }
  return iter
}

type ArrayMethods = keyof Array<any> | 'findLast' | 'findLastIndex'

const arrayProto = Array.prototype

/**
 * apply —— 通用迭代方法拦截
 *
 * 用于 map/filter/forEach/every/some/find/findIndex 等接收回调的数组方法。
 *
 * ### #11759 处理
 * 如果用户扩展了 Array 原型（如 Array.prototype.map = custom），
 * 则回退到直接 apply（不做参数拦截）。
 *
 * 正常流程：
 * 1. shallowReadArray → 追踪 ARRAY_ITERATE_KEY
 * 2. 包装回调参数（item → reactive version）
 * 3. 执行原始方法
 * 4. 如果 needsWrap，包装返回值
 */
function apply(
  self: unknown[],
  method: ArrayMethods,
  fn: (item: unknown, index: number, array: unknown[]) => unknown,
  thisArg?: unknown,
  wrappedRetFn?: (result: any) => unknown,
  args?: IArguments,
) {
  const arr = shallowReadArray(self)
  const needsWrap = arr !== self && !isShallow(self)
  // @ts-expect-error our code is limited to es2016 but user code is not
  const methodFn = arr[method]

  // #11759: 如果方法被用户扩展 → 直接 apply 原始参数
  if (methodFn !== arrayProto[method as any]) {
    const result = methodFn.apply(self, args)
    return needsWrap ? toReactive(result) : result
  }

  let wrappedFn = fn
  if (arr !== self) {
    if (needsWrap) {
      // 包装回调参数：item → toWrapped(self, item)
      // 第三个参数始终传 self（原始数组引用）
      wrappedFn = function (this: unknown, item, index) {
        return fn.call(this, toWrapped(self, item), index, self)
      }
    } else if (fn.length > 2) {
      // 非响应式数组但回调需要第三个参数（array 参数）
      wrappedFn = function (this: unknown, item, index) {
        return fn.call(this, item, index, self)
      }
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg)
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result
}

/**
 * reduce / reduceRight 拦截
 *
 * 与 apply 类似，但多了初始参数包装逻辑。
 * reduce 的累加器（accumulator）在第一次迭代时如果没提供初始值，
 * 会取数组第一个元素。需要包装这个被用作初始值的元素。
 */
function reduce(
  self: unknown[],
  method: keyof Array<any>,
  fn: (acc: unknown, item: unknown, index: number, array: unknown[]) => unknown,
  args: unknown[],
) {
  const arr = shallowReadArray(self)
  const needsWrap = arr !== self && !isShallow(self)
  let wrappedFn = fn

  // 标记初始累加器是否需要包装
  // args.length === 0 表示没有提供初始值 → 第一个元素将是累加器
  let wrapInitialAccumulator = false

  if (arr !== self) {
    if (needsWrap) {
      wrapInitialAccumulator = args.length === 0
      wrappedFn = function (this: unknown, acc, item, index) {
        // 首次迭代时包装累加器（如果它是数组的第一个元素）
        if (wrapInitialAccumulator) {
          wrapInitialAccumulator = false
          acc = toWrapped(self, acc)
        }
        return fn.call(this, acc, toWrapped(self, item), index, self)
      }
    } else if (fn.length > 3) {
      wrappedFn = function (this: unknown, acc, item, index) {
        return fn.call(this, acc, item, index, self)
      }
    }
  }
  const result = (arr[method] as any)(wrappedFn, ...args)
  // 如果累加器被包装了，结果也需要包装
  return wrapInitialAccumulator ? toWrapped(self, result) : result
}

/**
 * searchProxy —— 身份敏感方法拦截
 *
 * 用于 includes / indexOf / lastIndexOf。
 *
 * 问题：如果查找的是 reactive proxy（如 reactive([obj])），
 * includes(obj) 会失败，因为数组里的 obj 是 proxy 而传入的是 raw obj。
 *
 * 解决方案：第一次用 proxy args 查找，失败且 args[0] 是 proxy 时，
 * 用 toRaw(args[0]) 再查一次。
 */
function searchProxy(
  self: unknown[],
  method: keyof Array<any>,
  args: unknown[],
) {
  const arr = toRaw(self) as any
  track(arr, TrackOpTypes.ITERATE, ARRAY_ITERATE_KEY)

  // 第一次：用原始参数（可能是 proxy）
  const res = arr[method](...args)

  // 失败且参数是 proxy → toRaw 再试
  if ((res === -1 || res === false) && isProxy(args[0])) {
    args[0] = toRaw(args[0])
    return arr[method](...args)
  }

  return res
}

/**
 * noTracking —— 暂停追踪的写入操作
 *
 * 用于 push/pop/shift/unshift/splice。
 *
 * ### #2137 死锁预防
 * 这些方法内部会读取和修改 length 属性，如果追踪了 length 的依赖，
 * 会导致"读取 length → track → 修改 length → trigger → 重新执行 → 读取 length..."的无限循环。
 *
 * 解决方案：
 * 1. pauseTracking() —— 暂停依赖追踪
 * 2. startBatch() / endBatch() —— 包裹在批处理中
 * 3. resetTracking() —— 恢复追踪
 */
function noTracking(
  self: unknown[],
  method: keyof Array<any>,
  args: unknown[] = [],
) {
  pauseTracking()
  startBatch()
  const res = (toRaw(self) as any)[method].apply(self, args)
  endBatch()
  resetTracking()
  return res
}
