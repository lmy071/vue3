/**
 * collectionHandlers.ts —— Map/Set/WeakMap/WeakSet 的响应式代理
 *
 * ## 功能概述
 * 处理 ES6 集合类型（Map、Set、WeakMap、WeakSet）的响应式代理。
 *
 * 与普通对象不同，集合类型不能使用通用的 baseHandlers——
 * 它们的 get/set/add/delete 是方法调用而非属性操作。
 * 需要为每个方法创建拦截包装。
 *
 * ## 设计思路
 * ```
 * createInstrumentationGetter(isReadonly, shallow)
 *   → createInstrumentations(isReadonly, shallow)
 *       → 为每种方法生成代理函数
 *       → 代理函数内部：toRaw → track → 执行原始方法 → wrap 返回值
 * ```
 *
 * ## 四种 Handler
 * ```
 * mutableCollectionHandlers           → reactive(Map/Set)
 * shallowCollectionHandlers           → shallowReactive(Map/Set)
 * readonlyCollectionHandlers          → readonly(Map/Set)
 * shallowReadonlyCollectionHandlers   → shallowReadonly(Map/Set)
 * ```
 */

import {
  type Target,
  isReadonly,
  isShallow,
  toRaw,
  toReactive,
  toReadonly,
} from './reactive'
import { ITERATE_KEY, MAP_KEY_ITERATE_KEY, track, trigger } from './dep'
import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'
import {
  capitalize,
  extend,
  hasChanged,
  hasOwn,
  isMap,
  toRawType,
} from '@vue/shared'
import { warn } from './warning'

/**
 * 集合类型的两个子类：
 * - IterableCollections：Map + Set（可迭代）
 * - WeakCollections：WeakMap + WeakSet（不可迭代，弱引用）
 */
type CollectionTypes = IterableCollections | WeakCollections
type IterableCollections = (Map<any, any> | Set<any>) & Target
type WeakCollections = (WeakMap<any, any> | WeakSet<any>) & Target
type MapTypes = (Map<any, any> | WeakMap<any, any>) & Target
type SetTypes = (Set<any> | WeakSet<any>) & Target

/**
 * 浅层模式下的包装函数：what you put in is what you get out
 */
const toShallow = <T extends unknown>(value: T): T => value

/** 获取集合的原型链 */
const getProto = <T extends CollectionTypes>(v: T): any =>
  Reflect.getPrototypeOf(v)

/**
 * 创建迭代器方法的代理包装
 *
 * 返回值遵循迭代器协议。每个 next() 的结果会根据包装模式被 wrapped。
 *
 * @param method     - 迭代方法名（keys/values/entries/Symbol.iterator）
 * @param isReadonly - 是否只读
 * @param isShallow  - 是否浅层
 * @returns 包装后的迭代器方法
 */
function createIterableMethod(
  method: string | symbol,
  isReadonly: boolean,
  isShallow: boolean,
) {
  return function (
    this: IterableCollections,
    ...args: unknown[]
  ): Iterable<unknown> & Iterator<unknown> {
    const target = this[ReactiveFlags.RAW]
    const rawTarget = toRaw(target)
    const targetIsMap = isMap(rawTarget)
    /**
     * 判断返回值类型：
     * - isPair: entries 或 Map 的 Symbol.iterator，返回 [key, value]
     * - isKeyOnly: Map 的 keys()，仅追踪 MAP_KEY_ITERATE_KEY
     */
    const isPair =
      method === 'entries' || (method === Symbol.iterator && targetIsMap)
    const isKeyOnly = method === 'keys' && targetIsMap
    const innerIterator = target[method](...args)

    // 选择包装函数：shallow → identity / readonly → toReadonly / reactive → toReactive
    const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive

    // 非只读下追踪迭代
    !isReadonly &&
      track(
        rawTarget,
        TrackOpTypes.ITERATE,
        isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY,
      )

    // 返回包装的迭代器
    return extend(
      // 原型继承内层迭代器的所有属性
      Object.create(innerIterator),
      {
        next() {
          const { value, done } = innerIterator.next()
          return done
            ? { value, done }
            : {
                /**
                 * isPair：包装 [key, value] 的两端
                 * 其他：直接包装 value
                 */
                value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
                done,
              }
        },
      },
    )
  }
}

/**
 * 创建只读模式的拒绝方法
 *
 * 调用 add/set/delete/clear 时在 DEV 模式下报警告，并返回"无操作"值。
 */
function createReadonlyMethod(type: TriggerOpTypes): Function {
  return function (this: CollectionTypes, ...args: unknown[]) {
    if (__DEV__) {
      const key = args[0] ? `on key "${args[0]}" ` : ``
      warn(
        `${capitalize(type)} operation ${key}failed: target is readonly.`,
        toRaw(this),
      )
    }
    // 返回与操作相符的"无操作"值
    return type === TriggerOpTypes.DELETE
      ? false
      : type === TriggerOpTypes.CLEAR
        ? undefined
        : this
  }
}

type Instrumentations = Record<string | symbol, Function | number>

/**
 * 创建集合方法的拦截器集合
 *
 * 为 Map/Set 的每个方法生成代理版本，处理：
 * 1. 参数脱壳（toRaw）
 * 2. 依赖追踪
 * 3. 返回值包装
 * 4. 修改操作的触发
 *
 * @param readonly - 是否只读
 * @param shallow  - 是否浅层
 */
function createInstrumentations(
  readonly: boolean,
  shallow: boolean,
): Instrumentations {
  const instrumentations: Instrumentations = {
    /**
     * Map.get 代理
     *
     * 特殊处理 #1772：readonly(reactive(Map)) 需要返回 readonly +
     * reactive 的值。先用 reactive key 查找，再 fallback 到 raw key。
     *
     * #3602：target !== rawTarget 时调用 target.get(key) 触发嵌套 Map 的追踪。
     */
    get(this: MapTypes, key: unknown) {
      const target = this[ReactiveFlags.RAW]
      const rawTarget = toRaw(target)
      const rawKey = toRaw(key)

      // 追踪依赖（如果 key 与 rawKey 不同，追踪两者）
      if (!readonly) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, TrackOpTypes.GET, key)
        }
        track(rawTarget, TrackOpTypes.GET, rawKey)
      }

      const { has } = getProto(rawTarget)
      const wrap = shallow ? toShallow : readonly ? toReadonly : toReactive

      if (has.call(rawTarget, key)) {
        return wrap(target.get(key))
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey))
      } else if (target !== rawTarget) {
        // #3602 readonly(reactive(Map))
        // 确保嵌套的 reactive Map 能追踪自己的访问
        target.get(key)
      }
    },

    /**
     * Map/Set.size 代理
     *
     * 读取 size 追踪 ITERATE_KEY。
     */
    get size() {
      const target = (this as unknown as IterableCollections)[ReactiveFlags.RAW]
      !readonly && track(toRaw(target), TrackOpTypes.ITERATE, ITERATE_KEY)
      return target.size
    },

    /**
     * Map/Set.has 代理
     *
     * 双查机制：先用 key 本身查找，再用 raw key 查找。
     * 因为 reactive proxy 和 raw value 在 Map 中是不同的引用。
     */
    has(this: CollectionTypes, key: unknown): boolean {
      const target = this[ReactiveFlags.RAW]
      const rawTarget = toRaw(target)
      const rawKey = toRaw(key)
      if (!readonly) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, TrackOpTypes.HAS, key)
        }
        track(rawTarget, TrackOpTypes.HAS, rawKey)
      }
      // 优先用原始 key 查找
      return key === rawKey
        ? target.has(key)
        : target.has(key) || target.has(rawKey)
    },

    /**
     * Map/Set.forEach 代理
     *
     * 包装回调参数为响应式版本。
     * 回调中 this 设置为 observed 对象（保持一致性）。
     */
    forEach(this: IterableCollections, callback: Function, thisArg?: unknown) {
      const observed = this
      const target = observed[ReactiveFlags.RAW]
      const rawTarget = toRaw(target)
      const wrap = shallow ? toShallow : readonly ? toReadonly : toReactive
      !readonly && track(rawTarget, TrackOpTypes.ITERATE, ITERATE_KEY)

      return target.forEach((value: unknown, key: unknown) => {
        // 1. this === thisArg（如果提供）或 observed
        // 2. value 和 key 都包装为响应式版本
        return callback.call(thisArg, wrap(value), wrap(key), observed)
      })
    },
  }

  // 扩展修改操作方法
  extend(
    instrumentations,
    readonly
      ? // 只读模式：所有修改方法抛出警告
        {
          add: createReadonlyMethod(TriggerOpTypes.ADD),
          set: createReadonlyMethod(TriggerOpTypes.SET),
          delete: createReadonlyMethod(TriggerOpTypes.DELETE),
          clear: createReadonlyMethod(TriggerOpTypes.CLEAR),
        }
      : // 可变模式：实际修改 + 触发更新
        {
          /**
           * Set.add 代理
           *
           * 检查值是否已存在（三重检查：raw value / original / raw → original 反向），
           * 不存在时才添加并触发 ADD。
           */
          add(this: SetTypes, value: unknown) {
            const target = toRaw(this)
            const proto = getProto(target)
            const rawValue = toRaw(value)
            // 非浅层且非只读/浅层：使用 raw 值
            const valueToAdd =
              !shallow && !isShallow(value) && !isReadonly(value)
                ? rawValue
                : value
            // 三重检查避免重复添加
            const hadKey =
              proto.has.call(target, valueToAdd) ||
              (hasChanged(value, valueToAdd) &&
                proto.has.call(target, value)) ||
              (hasChanged(rawValue, valueToAdd) &&
                proto.has.call(target, rawValue))
            if (!hadKey) {
              target.add(valueToAdd)
              trigger(target, TriggerOpTypes.ADD, valueToAdd, valueToAdd)
            }
            return this
          },

          /**
           * Map.set 代理
           *
           * 处理 reactive key：尝试 raw key 查找确保一致性。
           * ADD（新增 key）和 SET（修改已有 key）触发不同的 trigger 类型。
           */
          set(this: MapTypes, key: unknown, value: unknown) {
            if (!shallow && !isShallow(value) && !isReadonly(value)) {
              value = toRaw(value)
            }
            const target = toRaw(this)
            const { has, get } = getProto(target)

            let hadKey = has.call(target, key)
            if (!hadKey) {
              // 如果 reactive key 找不到，尝试 raw key
              key = toRaw(key)
              hadKey = has.call(target, key)
            } else if (__DEV__) {
              checkIdentityKeys(target, has, key)
            }

            const oldValue = get.call(target, key)
            target.set(key, value)

            if (!hadKey) {
              // 新增 key
              trigger(target, TriggerOpTypes.ADD, key, value)
            } else if (hasChanged(value, oldValue)) {
              // 修改已有 key
              trigger(target, TriggerOpTypes.SET, key, value, oldValue)
            }
            return this
          },

          /**
           * Map/Set.delete 代理
           *
           * reactive key 回退 raw key 查找。
           * 先执行 delete 再触发（确保 trigger 时数据已是新状态）。
           */
          delete(this: CollectionTypes, key: unknown) {
            const target = toRaw(this)
            const { has, get } = getProto(target)
            let hadKey = has.call(target, key)
            if (!hadKey) {
              key = toRaw(key)
              hadKey = has.call(target, key)
            } else if (__DEV__) {
              checkIdentityKeys(target, has, key)
            }

            const oldValue = get ? get.call(target, key) : undefined
            // 先执行操作再触发
            const result = target.delete(key)
            if (hadKey) {
              trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
            }
            return result
          },

          /**
           * Map/Set.clear 代理
           *
           * 先执行 clear 再触发（确保 trigger 时数据是空的）。
           * CLEAR 操作会触发 map 中的所有 key 依赖。
           */
          clear(this: IterableCollections) {
            const target = toRaw(this)
            const hadItems = target.size !== 0
            const oldTarget = __DEV__
              ? isMap(target)
                ? new Map(target)
                : new Set(target)
              : undefined
            const result = target.clear()
            if (hadItems) {
              trigger(
                target,
                TriggerOpTypes.CLEAR,
                undefined,
                undefined,
                oldTarget,
              )
            }
            return result
          },
        },
  )

  // 添加迭代器方法（keys/values/entries/Symbol.iterator）
  const iteratorMethods = [
    'keys',
    'values',
    'entries',
    Symbol.iterator,
  ] as const

  iteratorMethods.forEach(method => {
    instrumentations[method] = createIterableMethod(method, readonly, shallow)
  })

  return instrumentations
}

/**
 * 创建集合的 proxy getter
 *
 * 返回一个函数，用作 ProxyHandler.get。
 * 处理 ReactiveFlags 内部属性和方法分发。
 */
function createInstrumentationGetter(isReadonly: boolean, shallow: boolean) {
  const instrumentations = createInstrumentations(isReadonly, shallow)

  return (
    target: CollectionTypes,
    key: string | symbol,
    receiver: CollectionTypes,
  ) => {
    // 1. ReactiveFlags 内部标记
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (key === ReactiveFlags.RAW) {
      return target
    }

    // 2. 方法分发：如果 key 在 instrumentations 中且 target 有此方法 → 用代理方法
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target
        ? instrumentations
        : target,
      key,
      receiver,
    )
  }
}

// ============================================================
// 四种导出的集合 Handler
// ============================================================

/** mutable 集合 handler（reactive(Map/Set)） */
export const mutableCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: /*@__PURE__*/ createInstrumentationGetter(false, false),
}

/** shallow 集合 handler（shallowReactive(Map/Set)） */
export const shallowCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: /*@__PURE__*/ createInstrumentationGetter(false, true),
}

/** readonly 集合 handler（readonly(Map/Set)） */
export const readonlyCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: /*@__PURE__*/ createInstrumentationGetter(true, false),
}

/** shallowReadonly 集合 handler（shallowReadonly(Map/Set)） */
export const shallowReadonlyCollectionHandlers: ProxyHandler<CollectionTypes> =
  {
    get: /*@__PURE__*/ createInstrumentationGetter(true, true),
  }

/**
 * 开发环境：检测 identity key 冲突
 *
 * 警告场景：Map 中同时存在同一个对象的 raw 和 reactive 版本作为 key。
 * 这会导致 has() 和 get() 的行为不一致。
 */
function checkIdentityKeys(
  target: CollectionTypes,
  has: (key: unknown) => boolean,
  key: unknown,
) {
  const rawKey = toRaw(key)
  if (rawKey !== key && has.call(target, rawKey)) {
    const type = toRawType(target)
    warn(
      `Reactive ${type} contains both the raw and reactive ` +
        `versions of the same object${type === `Map` ? ` as keys` : ``}, ` +
        `which can lead to inconsistencies. ` +
        `Avoid differentiating between the raw and reactive versions ` +
        `of an object and only use the reactive version if possible.`,
    )
  }
}
