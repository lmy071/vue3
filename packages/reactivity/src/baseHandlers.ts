/**
 * baseHandlers.ts —— Proxy Handler（代理处理器）
 *
 * ## 功能概述
 * 定义了响应式对象的 Proxy 拦截器。所有 reactive/readonly/shallowReactive/
 * shallowReadonly 创建的 Proxy 都使用这些 handler。
 *
 * ## 四种 Handler 实例
 * ```
 * mutableHandlers           → reactive()            → 可读可写，深层代理
 * readonlyHandlers          → readonly()            → 只读，深层代理
 * shallowReactiveHandlers   → shallowReactive()     → 可读可写，仅顶层
 * shallowReadonlyHandlers   → shallowReadonly()     → 只读，仅顶层
 * ```
 *
 * ## 类继承关系
 * ```
 * BaseReactiveHandler           ← get() 拦截逻辑（含 Ref 解包 + 深层代理）
 *   ├─ MutableReactiveHandler   ← set() / deleteProperty() / has() / ownKeys()
 *   └─ ReadonlyReactiveHandler  ← set() / deleteProperty()（只读拒绝修改）
 * ```
 *
 * ## get 拦截器的执行顺序
 * 1. 检查是否为 ReactiveFlags 内部属性（IS_REACTIVE / IS_READONLY / RAW 等）
 * 2. 数组特殊方法拦截（arrayInstrumentations）
 * 3. Reflect.get 实际读取
 * 4. 非 trackable key 检查（Symbol / __proto__ 等跳过追踪）
 * 5. track() 建立依赖
 * 6. Ref 解包（浅层模式下跳过）
 * 7. 深层代理（readonly/reactive 递归）
 */

import {
  type Target,
  isReadonly,
  isShallow,
  reactive,
  reactiveMap,
  readonly,
  readonlyMap,
  shallowReactiveMap,
  shallowReadonlyMap,
  toRaw,
} from './reactive'
import { arrayInstrumentations } from './arrayInstrumentations'
import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'
import { ITERATE_KEY, track, trigger } from './dep'
import {
  hasChanged,
  hasOwn,
  isArray,
  isIntegerKey,
  isObject,
  isSymbol,
  makeMap,
} from '@vue/shared'
import { isRef } from './ref'
import { warn } from './warning'

/**
 * 非追踪 key 集合
 *
 * 这些 key 的读取不应该建立依赖追踪。
 * - `__proto__`：读取原型链不应触发响应式
 * - `__v_isRef`：内部类型检查
 * - `__isVue`：Vue 实例标记
 */
const isNonTrackableKeys = /*@__PURE__*/ makeMap(`__proto__,__v_isRef,__isVue`)

/**
 * 内建 Symbol 集合
 *
 * 通过 `Object.getOwnPropertyNames(Symbol)` 获取所有 Symbol 静态方法名
 * （如 Symbol.iterator、Symbol.species 等），建立白名单。
 *
 * 读取这些 Symbol 属性不应建立依赖追踪。
 * 过滤掉 `arguments` 和 `caller`（iOS 10.x 兼容）。
 */
const builtInSymbols = new Set(
  /*@__PURE__*/
  Object.getOwnPropertyNames(Symbol)
    .filter(key => key !== 'arguments' && key !== 'caller')
    .map(key => Symbol[key as keyof SymbolConstructor])
    .filter(isSymbol),
)

/**
 * hasOwnProperty 重写
 *
 * 当对响应式数组调用 hasOwnProperty 时的代理方法。
 * 需要调用 track 以保证响应性。
 *
 * #10455: key 可能不是字符串（如数字），统一 String() 处理。
 */
function hasOwnProperty(this: object, key: unknown) {
  if (!isSymbol(key)) key = String(key)
  const obj = toRaw(this)
  track(obj, TrackOpTypes.HAS, key)
  return obj.hasOwnProperty(key as string)
}

/**
 * BaseReactiveHandler —— 代理处理的基类
 *
 * 定义了 get 拦截的核心逻辑。深层代理和 Ref 解包逻辑在这里。
 * set/deleteProperty 由子类实现（可写 vs 只读）。
 */
class BaseReactiveHandler implements ProxyHandler<Target> {
  constructor(
    protected readonly _isReadonly = false,
    protected readonly _isShallow = false,
  ) {}

  /**
   * Proxy getter 拦截
   *
   * 这是响应式系统最核心的拦截器，按优先级处理以下情况：
   *
   * ### 1. ReactiveFlags 内部属性
   * IS_REACTIVE / IS_READONLY / IS_SHALLOW → 返回对应标记值
   * RAW → 验证 receiver 是有效 proxy → 返回原始对象
   * SKIP → 返回原始 SKIP 值
   *
   * ### 2. 数组特殊方法
   * 非只读模式下，数组的 push/pop/shift/unshift/splice 等需要特殊处理
   *（避免循环追踪 #2137），以及 includes/indexOf（处理 reactive proxy 查找）
   *
   * ### 3. hasOwnProperty
   * 非只读模式下重写为 hasOwnProperty 的响应式版本
   *
   * ### 4. 追踪不可追踪的 key
   * Symbol 内建属性（Symbol.iterator 等）和 __proto__ 跳过追踪
   *
   * ### 5. track 依赖
   * 非只读模式下建立依赖追踪
   *
   * ### 6. Ref 解包
   * 非浅层模式下，读取到 Ref 时自动 .value 解包
   * 但数组 + 整数索引不会解包（保持数组原始行为）
   *
   * ### 7. 深层代理
   * 非浅层模式下，读取到对象时递归代理（reactive 或 readonly）
   */
  get(target: Target, key: string | symbol, receiver: object): any {
    // --- 1. ReactiveFlags 内部属性 ---
    if (key === ReactiveFlags.SKIP) return target[ReactiveFlags.SKIP]

    const isReadonly = this._isReadonly,
      isShallow = this._isShallow

    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (key === ReactiveFlags.IS_SHALLOW) {
      return isShallow
    } else if (key === ReactiveFlags.RAW) {
      /**
       * 只有合法的 receiver 才能获取 RAW
       *
       * 验证逻辑：
       * 1. receiver 必须是当前 proxyMap 中的 proxy（排除任意对象访问）
       * 2. 或者 receiver 与 proxy 共享原型（#14600：用户对响应式对象再次包装 Proxy）
       */
      if (
        receiver ===
          (isReadonly
            ? isShallow
              ? shallowReadonlyMap
              : readonlyMap
            : isShallow
              ? shallowReactiveMap
              : reactiveMap
          ).get(target) ||
        Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)
      ) {
        return target
      }
      // 非法 receiver → 返回 undefined
      return
    }

    const targetIsArray = isArray(target)

    // --- 2. 数组特殊方法 ---
    if (!isReadonly) {
      let fn: Function | undefined
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn
      }
      if (key === 'hasOwnProperty') {
        return hasOwnProperty
      }
    }

    // --- 3. Reflect.get 实际读取 ---
    const res = Reflect.get(
      target,
      key,
      /**
       * 如果 target 是 Ref → 用 target 本身作为 receiver
       *
       * 原因：Ref 的 getter/setter 绑定在 Ref 实例上而非 raw value，
       * 使用 target 作为 receiver 避免进入递归 toRaw。
       */
      isRef(target) ? target : receiver,
    )

    // --- 4. 不可追踪 key ---
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res
    }

    // --- 5. track 依赖 ---
    if (!isReadonly) {
      track(target, TrackOpTypes.GET, key)
    }

    // --- 6. 浅层模式：直接返回 ---
    if (isShallow) {
      return res
    }

    // --- 7. Ref 解包 ---
    if (isRef(res)) {
      // 数组 + 整数 key 不解包（保持元素级别的独立性）
      const value = targetIsArray && isIntegerKey(key) ? res : res.value
      // 只读模式下，对象值也要转换成 readonly 代理
      return isReadonly && isObject(value) ? readonly(value) : value
    }

    // --- 8. 深层代理 ---
    if (isObject(res)) {
      // 递归代理：reactive 或 readonly
      return isReadonly ? readonly(res) : reactive(res)
    }

    return res
  }
}

/**
 * MutableReactiveHandler —— 可变响应式处理器
 *
 * 用于 reactive() 和 shallowReactive()。
 * 实现了 set / deleteProperty / has / ownKeys 四个陷阱。
 */
class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow = false) {
    super(false, isShallow)
  }

  /**
   * Proxy setter 拦截
   *
   * 处理逻辑：
   *
   * ### 1. 原始值提取
   * 非浅层模式下去掉响应式代理外壳（toRaw），因为存储的是原始值。
   *
   * ### 2. Ref 赋值穿透
   * 如果旧值是 Ref 而新值不是 → 直接 RHS (right-hand side) 写入旧 Ref.value。
   *
   * ### 3. Reflect.set 写入
   *
   * ### 4. 触发更新
   * - 新增属性 → TriggerOpTypes.ADD
   * - 修改已有属性 → TriggerOpTypes.SET
   *
   * ### 5. 原型链保护
   * 仅当 target === toRaw(receiver) 时才触发更新，防止原型链上游的 set 误触发。
   */
  set(
    target: Record<string | symbol, unknown>,
    key: string | symbol,
    value: unknown,
    receiver: object,
  ): boolean {
    let oldValue = target[key]
    const isArrayWithIntegerKey = isArray(target) && isIntegerKey(key)

    // --- 1. 原始值提取 ---
    if (!this._isShallow) {
      const isOldValueReadonly = isReadonly(oldValue)
      // 浅层或只读的新值保留原始值（不脱壳）
      if (!isShallow(value) && !isReadonly(value)) {
        oldValue = toRaw(oldValue)
        value = toRaw(value)
      }

      // --- 2. Ref 赋值穿透 ---
      if (!isArrayWithIntegerKey && isRef(oldValue) && !isRef(value)) {
        if (isOldValueReadonly) {
          // 旧值是只读 Ref → 拒绝写入
          if (__DEV__) {
            warn(
              `Set operation on key "${String(key)}" failed: target is readonly.`,
              target[key],
            )
          }
          return true
        } else {
          // 正常 Ref 穿透：直接写入 oldValue.value
          oldValue.value = value
          return true
        }
      }
    }
    // 浅层模式下不处理 Ref 穿透（保持原始语义）

    // --- 3. Reflect.set 实际写入 ---
    const hadKey = isArrayWithIntegerKey
      ? Number(key) < target.length // 数组：判断索引是否在范围内
      : hasOwn(target, key)
    const result = Reflect.set(
      target,
      key,
      value,
      isRef(target) ? target : receiver, // Ref 用自身作 receiver
    )

    // --- 4. 触发更新 ---
    // 仅当 target 是 receiver 的原始对象时才触发
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        // 新增属性
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        // 修改已有属性（值确实变了）
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }

    return result
  }

  /**
   * Proxy deleteProperty 拦截
   *
   * 删除成功后触发 TriggerOpTypes.DELETE。
   * 仅在 hadKey 时才触发（删除不存在的属性不触发）。
   */
  deleteProperty(
    target: Record<string | symbol, unknown>,
    key: string | symbol,
  ): boolean {
    const hadKey = hasOwn(target, key)
    const oldValue = target[key]
    const result = Reflect.deleteProperty(target, key)
    if (result && hadKey) {
      trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
    }
    return result
  }

  /**
   * Proxy has 拦截
   *
   * in 操作符、hasOwnProperty 等通过此陷阱追踪。
   * Symbol 内建属性跳过追踪。
   */
  has(target: Record<string | symbol, unknown>, key: string | symbol): boolean {
    const result = Reflect.has(target, key)
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, TrackOpTypes.HAS, key)
    }
    return result
  }

  /**
   * Proxy ownKeys 拦截
   *
   * for...in / Object.keys / Object.getOwnPropertyNames 等通过此陷阱追踪。
   *
   * 数组：追踪 'length'（长度变化也影响迭代）
   * 对象：追踪 ITERATE_KEY
   */
  ownKeys(target: Record<string | symbol, unknown>): (string | symbol)[] {
    track(
      target,
      TrackOpTypes.ITERATE,
      isArray(target) ? 'length' : ITERATE_KEY,
    )
    return Reflect.ownKeys(target)
  }
}

/**
 * ReadonlyReactiveHandler —— 只读响应式处理器
 *
 * 用于 readonly() 和 shallowReadonly()。
 * set 和 deleteProperty 会被拒绝并在 DEV 模式下报警告。
 */
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow = false) {
    super(true, isShallow)
  }

  /** 只读：拒绝 set 操作 */
  set(target: object, key: string | symbol) {
    if (__DEV__) {
      warn(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target,
      )
    }
    return true
  }

  /** 只读：拒绝 delete 操作 */
  deleteProperty(target: object, key: string | symbol) {
    if (__DEV__) {
      warn(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target,
      )
    }
    return true
  }
}

// ============================================================
// 导出的四种 Handler 实例（通过 /*@__PURE__*/ 标记可 tree-shake）
// ============================================================

/** mutable Handlers（reactive 使用）：可读写、深层代理 */
export const mutableHandlers: ProxyHandler<object> =
  /*@__PURE__*/ new MutableReactiveHandler()

/** readonly Handlers（readonly 使用）：只读、深层代理 */
export const readonlyHandlers: ProxyHandler<object> =
  /*@__PURE__*/ new ReadonlyReactiveHandler()

/** shallowReactive Handlers（shallowReactive 使用）：可读写、仅浅层代理 */
export const shallowReactiveHandlers: MutableReactiveHandler =
  /*@__PURE__*/ new MutableReactiveHandler(true)

/**
 * shallowReadonly Handlers（shallowReadonly 使用）
 *
 * 特殊语义：不解包顶层 ref，但保持响应性。
 * 这允许 ref 原样传递，同时仍然追踪其变化。
 */
export const shallowReadonlyHandlers: ReadonlyReactiveHandler =
  /*@__PURE__*/ new ReadonlyReactiveHandler(true)
