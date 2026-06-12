/**
 * computed.ts —— 计算属性
 *
 * ## 功能概述
 * ComputedRefImpl 是一个特殊的 Subscriber，它：
 * 1. 作为订阅者：追踪其 getter 函数中读取的响应式数据
 * 2. 作为数据源：持有 Dep，当值变化时通知依赖它的 effect
 *
 * ## 惰性求值
 * 与普通 effect 不同，computed 是惰性的——值只在 `.value` 被读取时才计算。
 * 如果计算后依赖数据没有变化，不会重新计算。
 *
 * ## 脏检查
 * computed 使用 DIRTY 标志 + dep version 比较：
 * - 依赖数据变更 → dep.trigger → computed.notify → 设置 DIRTY
 * - 读取 .value → refreshComputed → 检查 DIRTY / globalVersion / isDirty
 * - 只有脏了才重新计算
 *
 * ## 双重身份
 * ComputedRefImpl 同时是：
 * - Subscriber（订阅依赖数据的变化）
 * - 数据源（持有 Dep，通知上层消费者）
 *
 * 当 computed 获得第一个订阅者时才开始追踪依赖（TRACKING 标志）。
 */

import { isFunction } from '@vue/shared'
import {
  type DebuggerEvent,
  type DebuggerOptions,
  EffectFlags,
  type Subscriber,
  activeSub,
  batch,
  refreshComputed,
} from './effect'
import type { Ref } from './ref'
import { warn } from './warning'
import { Dep, type Link, globalVersion } from './dep'
import { ReactiveFlags, TrackOpTypes } from './constants'

/** 声明 ComputedRef 的类型标记（编译时区分 computed ref 和普通 ref） */
declare const ComputedRefSymbol: unique symbol
/** 声明 WritableComputedRef 的类型标记 */
declare const WritableComputedRefSymbol: unique symbol

/** ComputedRef 的基础接口（公共部分） */
interface BaseComputedRef<T, S = T> extends Ref<T, S> {
  [ComputedRefSymbol]: true
  /** @deprecated computed 不再使用 effect，保留此字段仅为向后兼容 */
  effect: ComputedRefImpl
}

/** 只读计算属性 */
export interface ComputedRef<T = any> extends BaseComputedRef<T> {
  readonly value: T
}

/** 可写计算属性（提供了 setter） */
export interface WritableComputedRef<T, S = T> extends BaseComputedRef<T, S> {
  [WritableComputedRefSymbol]: true
}

/** Computed getter 函数类型：接收旧值，返回新值 */
export type ComputedGetter<T> = (oldValue?: T) => T

/** Computed setter 函数类型 */
export type ComputedSetter<T> = (newValue: T) => void

/** createWritableComputed 的选项 */
export interface WritableComputedOptions<T, S = T> {
  get: ComputedGetter<T>
  set: ComputedSetter<S>
}

/**
 * ComputedRefImpl —— 计算属性的实现类
 *
 * 同时实现了 Ref<T> 和 Subscriber 接口：
 * - 作为 Ref：提供 .value 的 get/set
 * - 作为 Subscriber：通过 deps 链表追踪依赖
 *
 * @private 仅供 @vue/reactivity 内部使用，不在主 vue 包导出
 */
export class ComputedRefImpl<T = any> implements Subscriber {
  /**
   * 缓存的计算结果
   * @internal
   */
  _value: any = undefined

  /**
   * computed 自己的 Dep 实例
   *
   * 当其他 effect 读取此 computed 的 .value 时，通过此 Dep 建立依赖。
   * 当 computed 的值变化时，通过此 Dep 通知所有依赖者。
   *
   * Dep 构造函数将 this（computed 自身）作为 computed 参数传入，
   * 使得在 removeSub 中能够递归清理。
   * @internal
   */
  readonly dep: Dep = new Dep(this)

  /** 标记为 Ref 类型 */
  readonly __v_isRef = true

  /** 是否只读 */
  readonly __v_isReadonly: boolean

  // --- Subscriber 接口实现 ---

  /** 依赖双向链表（追踪 getter 中读取的响应式数据） */
  deps?: Link = undefined
  depsTail?: Link = undefined

  /**
   * 初始标志：DIRTY = true
   *
   * 新创建的 computed 总是"脏"的——第一次读取时触发计算。
   * computed 不自动追踪依赖，直到有第一个订阅者。
   */
  flags: EffectFlags = EffectFlags.DIRTY

  /**
   * 上次刷新时的 globalVersion
   *
   * 初始化为 globalVersion - 1，确保第一次刷新时必定重算。
   * @internal
   */
  globalVersion: number = globalVersion - 1

  /** 是否在服务端渲染环境 */
  isSSR: boolean

  /** 批量队列中的下一个节点 */
  next?: Subscriber = undefined

  /** 向后兼容：计算属性之前使用 ReactiveEffect，保留此字段 */
  effect: this = this

  /** 开发环境：track 调试回调 */
  onTrack?: (event: DebuggerEvent) => void

  /** 开发环境：trigger 调试回调 */
  onTrigger?: (event: DebuggerEvent) => void

  /** 开发环境：是否警告递归计算 */
  _warnRecursive?: boolean

  constructor(
    public fn: ComputedGetter<T>,
    private readonly setter: ComputedSetter<T> | undefined,
    isSSR: boolean,
  ) {
    // 没有 setter 就是只读
    this[ReactiveFlags.IS_READONLY] = !setter
    this.isSSR = isSSR
  }

  /**
   * 通知：依赖数据变化
   *
   * 被依赖的 dep.trigger() 调用。
   * 设置 DIRTY 标志，然后通过 batch 通知上层订阅者。
   *
   * 返回 true 表示这是 computed——调用方需要继续通知 computed 的 dep。
   * 自递归保护：如果当前活跃的 effect 就是自己，跳过通知。
   * @internal
   */
  notify(): true | void {
    this.flags |= EffectFlags.DIRTY

    if (
      !(this.flags & EffectFlags.NOTIFIED) &&
      // 避免无限递归：computed 不应通知自身
      activeSub !== this
    ) {
      // isComputed = true → 入队到 batchedComputed 优先队列
      batch(this, true)
      return true // 通知调用方继续传播
    } else if (__DEV__) {
      // TODO warn about recursive computed
    }
  }

  /**
   * 读取 computed 的值（惰性求值入口）
   *
   * 流程：
   * 1. track → 建立调用者的依赖（调用者依赖此 computed）
   * 2. refreshComputed → 检查是否需要重新计算
   * 3. 同步 link.version → 返回缓存值
   */
  get value(): T {
    const link = __DEV__
      ? this.dep.track({
          target: this,
          type: TrackOpTypes.GET,
          key: 'value',
        })
      : this.dep.track()

    // 惰性求值：只有脏了才重新计算
    refreshComputed(this)

    // 同步链接版本号（确保与 dep.version 一致）
    if (link) {
      link.version = this.dep.version
    }

    return this._value
  }

  /**
   * 设置 computed 的值（仅可写 computed）
   *
   * 如果有 setter，调用 setter。否则在 dev 环境发出警告。
   */
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue)
    } else if (__DEV__) {
      warn('Write operation failed: computed value is readonly')
    }
  }
}

/**
 * 创建计算属性
 *
 * ### 使用示例
 * ```js
 * const count = ref(1)
 * const plusOne = computed(() => count.value + 1)
 * console.log(plusOne.value) // 2
 * ```
 *
 * 可写 computed：
 * ```js
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (val) => { count.value = val - 1 }
 * })
 * ```
 *
 * @param getterOrOptions - getter 函数或 { get, set } 选项
 * @param debugOptions - 调试选项（开发环境）
 * @param isSSR - 是否 SSR 环境（内部参数）
 */
export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions,
): ComputedRef<T>
export function computed<T, S = T>(
  options: WritableComputedOptions<T, S>,
  debugOptions?: DebuggerOptions,
): WritableComputedRef<T, S>
/*@__NO_SIDE_EFFECTS__*/
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false,
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T> | undefined

  // 兼容两种调用形式：computed(fn) 和 computed({ get, set })
  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  const cRef = new ComputedRefImpl(getter, setter, isSSR)

  // 挂载调试回调
  if (__DEV__ && debugOptions && !isSSR) {
    cRef.onTrack = debugOptions.onTrack
    cRef.onTrigger = debugOptions.onTrigger
  }

  return cRef as any
}
