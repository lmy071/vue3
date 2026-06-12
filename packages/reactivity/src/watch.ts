/**
 * watch.ts —— 侦听器
 *
 * ## 功能概述
 * watch() 是 Vue 3 的通用侦听 API，可在响应式数据变化时执行回调。
 * 底层基于 ReactiveEffect 实现，通过 job/scheduler 机制控制执行时机。
 *
 * ## 四种 watch 模式
 * | 场景 | source | cb | 行为 |
 * |------|--------|-----|------|
 * | watch(ref, cb) | Ref | 有 | 追踪 ref.value 变化 |
 * | watch(reactive, cb) | Reactive | 有 | 追踪响应式对象，forceTrigger=true |
 * | watch([ref, getter], cb) | Array | 有 | 多源监听 |
 * | watch(getter, cb) | Function | 有 | 返回值为追踪目标 |
 * | watchEffect(effect) | Function | 无 | 直接作为 effect |
 *
 * ## 核心参数说明
 * - `deep`：深层遍历。true=无限深度，false/0=1层，undefined=对 reactive 对象深层遍历
 * - `immediate`：立即执行回调
 * - `once`：仅执行一次
 * - `scheduler`：自定义调度器（控制何时执行回调）
 * - `flush`：已废弃，推荐使用 scheduler
 */

import {
  EMPTY_OBJ,
  NOOP,
  hasChanged,
  isArray,
  isFunction,
  isMap,
  isObject,
  isPlainObject,
  isSet,
  remove,
} from '@vue/shared'
import { warn } from './warning'
import type { ComputedRef } from './computed'
import { ReactiveFlags } from './constants'
import {
  type DebuggerOptions,
  EffectFlags,
  type EffectScheduler,
  ReactiveEffect,
  pauseTracking,
  resetTracking,
} from './effect'
import { isReactive, isShallow } from './reactive'
import { type Ref, isRef } from './ref'
import { getCurrentScope } from './effectScope'

// ============================================================
// 错误码
// ============================================================

/**
 * WatchErrorCodes —— watch 相关的错误码
 *
 * 从 runtime-core/src/errorHandling.ts 迁移到 @vue/reactivity，
 * 以配合 watch 逻辑的迁移。保持数值不变以确保兼容性。
 */
export enum WatchErrorCodes {
  WATCH_GETTER = 2,
  WATCH_CALLBACK,
  WATCH_CLEANUP,
}

// ============================================================
// 类型定义
// ============================================================

/** watchEffect 的回调函数类型 */
export type WatchEffect = (onCleanup: OnCleanup) => void

/** watch 的源数据类型 */
export type WatchSource<T = any> = Ref<T, any> | ComputedRef<T> | (() => T)

/** watch 的回调函数类型 */
export type WatchCallback<V = any, OV = any> = (
  value: V,
  oldValue: OV,
  onCleanup: OnCleanup,
) => any

/** 清理函数的注册器类型 */
export type OnCleanup = (cleanupFn: () => void) => void

/** watch 的选项类型 */
export interface WatchOptions<Immediate = boolean> extends DebuggerOptions {
  immediate?: Immediate
  deep?: boolean | number // true=无限深度, false/0=1层, undefined=对 reactive 对象深层遍历
  once?: boolean
  scheduler?: WatchScheduler
  onWarn?: (msg: string, ...args: any[]) => void
  /** @internal 允许在 job 上附加额外的逻辑 */
  augmentJob?: (job: (...args: any[]) => void) => void
  /** @internal 自定义错误处理 */
  call?: (
    fn: Function | Function[],
    type: WatchErrorCodes,
    args?: unknown[],
  ) => void
}

export type WatchStopHandle = () => void

export interface WatchHandle extends WatchStopHandle {
  pause: () => void
  resume: () => void
  stop: () => void
}

// ============================================================
// 内部状态
// ============================================================

/** 初始 watcher 值标记（用于区分首次运行） */
const INITIAL_WATCHER_VALUE = {}

export type WatchScheduler = (job: () => void, isFirstRun: boolean) => void

/** 每个 effect 的清理函数注册表 */
const cleanupMap: WeakMap<ReactiveEffect, (() => void)[]> = new WeakMap()

/** 当前活跃的 watcher（仅在 watch effect 执行期间设置） */
let activeWatcher: ReactiveEffect | undefined = undefined

// ============================================================
// getCurrentWatcher / onWatcherCleanup
// ============================================================

/**
 * 获取当前活跃的 watcher
 */
export function getCurrentWatcher(): ReactiveEffect<any> | undefined {
  return activeWatcher
}

/**
 * 注册当前活跃 watcher 的清理回调。
 *
 * 清理回调在 effect 重新运行之前调用。
 *
 * @param cleanupFn    - 清理回调函数
 * @param failSilently - true 时无活跃 effect 不报警告
 * @param owner        - 关联的 effect（默认使用 activeWatcher）
 */
export function onWatcherCleanup(
  cleanupFn: () => void,
  failSilently = false,
  owner: ReactiveEffect | undefined = activeWatcher,
): void {
  if (owner) {
    let cleanups = cleanupMap.get(owner)
    if (!cleanups) cleanupMap.set(owner, (cleanups = []))
    cleanups.push(cleanupFn)
  } else if (__DEV__ && !failSilently) {
    warn(
      `onWatcherCleanup() was called when there was no active watcher` +
        ` to associate with.`,
    )
  }
}

// ============================================================
// watch —— 核心函数
// ============================================================

/**
 * watch(source, cb?, options?)
 *
 * ### 执行流程
 * 1. 解析 source → 生成 getter
 * 2. 创建 ReactiveEffect(getter)
 * 3. 设置 scheduler（默认 job 或自定义 scheduler）
 * 4. 初始运行
 * 5. 返回 WatchHandle（含 pause/resume/stop）
 *
 * ### getter 生成策略
 * - Ref → () => source.value（forceTrigger = isShallow(ref)）
 * - Reactive → traverse(source)（forceTrigger = true）
 * - Array → 映射每个源为 getter（isMultiSource = true）
 * - Function + cb → source 本身作为 getter
 * - Function + 无 cb → watchEffect 模式
 *
 * ### job 执行策略
 * - 只在不活跃或 dirty 时执行（通过 EffectFlags.ACTIVE 检查）
 * - 比较新旧值：hasChanged 或 forceTrigger 或 multiSource 逐个比较
 * - 调用 oldValue 清理函数 + 执行 cb
 * - once 模式下触发一次后自动 stop
 *
 * ### forceTrigger
 * - shallowRef：.value 替换可能没变，但深层属性变了
 * - reactive 对象：同一对象引用不变，但属性可能变了
 * - 多源中有 reactive：同上
 *
 * ### 清理函数机制
 * - onWatcherCleanup 注册 → cleanupMap 存储
 * - 每次 job 执行前调用 cleanup
 * - effect.onStop 遍历 cleanupMap 执行所有清理
 *
 * @returns WatchHandle（stop / pause / resume）
 */
export function watch(
  source: WatchSource | WatchSource[] | WatchEffect | object,
  cb?: WatchCallback | null,
  options: WatchOptions = EMPTY_OBJ,
): WatchHandle {
  const { immediate, deep, once, scheduler, augmentJob, call } = options

  const warnInvalidSource = (s: unknown) => {
    ;(options.onWarn || warn)(
      `Invalid watch source: `,
      s,
      `A watch source can only be a getter/effect function, a ref, ` +
        `a reactive object, or an array of these types.`,
    )
  }

  /**
   * 响应式对象 getter 生成
   *
   * deep === false/0 或 shallow → traverse(1) 只遍历根级属性
   * deep === true → traverse(Infinity) 深层遍历
   * deep === undefined 且是 reactive 对象 → traverse(source) 深层遍历
   */
  const reactiveGetter = (source: object) => {
    if (deep) return source
    if (isShallow(source) || deep === false || deep === 0)
      return traverse(source, 1) // 仅根级
    return traverse(source) // 深层遍历 reactive 对象
  }

  let effect: ReactiveEffect
  let getter: () => any
  let cleanup: (() => void) | undefined
  let boundCleanup: typeof onWatcherCleanup
  let forceTrigger = false
  let isMultiSource = false

  // ============================================================
  // getter 生成（按 source 类型分支）
  // ============================================================

  if (isRef(source)) {
    /**
     * Ref source：追踪 ref.value。
     * shallowRef → forceTrigger=true（深层属性变化但 .value 不变时需要触发）
     */
    getter = () => source.value
    forceTrigger = isShallow(source)
  } else if (isReactive(source)) {
    /**
     * Reactive source：traverse(source) 深层遍历所有属性。
     * forceTrigger=true 因为 reactive 对象引用不变但内部属性会变。
     */
    getter = () => reactiveGetter(source)
    forceTrigger = true
  } else if (isArray(source)) {
    /**
     * Array source：多源 watch。
     *
     * 每个元素按类型生成 getter：
     * - Ref → .value
     * - Reactive → traverse
     * - Function → 调用（有 call 时通过 call 包装错误处理）
     *
     * forceTrigger：只要有一个源是 reactive 或 shallow 就触发。
     */
    isMultiSource = true
    forceTrigger = source.some(s => isReactive(s) || isShallow(s))
    getter = () =>
      source.map(s => {
        if (isRef(s)) {
          return s.value
        } else if (isReactive(s)) {
          return reactiveGetter(s)
        } else if (isFunction(s)) {
          return call ? call(s, WatchErrorCodes.WATCH_GETTER) : s()
        } else {
          __DEV__ && warnInvalidSource(s)
        }
      })
  } else if (isFunction(source)) {
    if (cb) {
      // getter 模式 (有回调)
      getter = call
        ? () => call(source, WatchErrorCodes.WATCH_GETTER)
        : (source as () => any)
    } else {
      /**
       * watchEffect 模式（无回调）
       *
       * getter 内部：
       * 1. 调用上次的 cleanup
       * 2. 设置 activeWatcher = effect（用于 onWatcherCleanup）
       * 3. 调用 source(boundCleanup)
       *
       * 暂停追踪期间调用 cleanup 避免不必要的依赖收集。
       */
      getter = () => {
        if (cleanup) {
          pauseTracking()
          try {
            cleanup()
          } finally {
            resetTracking()
          }
        }
        const currentEffect = activeWatcher
        activeWatcher = effect
        try {
          return call
            ? call(source, WatchErrorCodes.WATCH_CALLBACK, [boundCleanup])
            : source(boundCleanup)
        } finally {
          activeWatcher = currentEffect
        }
      }
    }
  } else {
    getter = NOOP
    __DEV__ && warnInvalidSource(source)
  }

  // ============================================================
  // deep 选项处理
  // ============================================================

  if (cb && deep) {
    /**
     * deep 模式下包装 getter：先执行原始 getter 获取值，再 traverse 该值。
     *
     * depth 含义：
     * - deep === true → Infinity
     * - deep === number → 指定深度
     */
    const baseGetter = getter
    const depth = deep === true ? Infinity : deep
    getter = () => traverse(baseGetter(), depth)
  }

  // ============================================================
  // watchHandle
  // ============================================================

  const scope = getCurrentScope()
  /**
   * watchHandle（也是 stop 函数）
   *
   * 停止 effect 并从 scope 中移除。
   */
  const watchHandle: WatchHandle = () => {
    effect.stop()
    if (scope && scope.active) {
      remove(scope.effects, effect)
    }
  }

  /**
   * once 模式：封装回调使触发一次后自动 stop
   */
  if (once && cb) {
    const _cb = cb
    cb = (...args) => {
      _cb(...args)
      watchHandle()
    }
  }

  // ============================================================
  // oldValue 初始值
  // ============================================================

  /**
   * 多源：每个源 fill 为 INITIAL_WATCHER_VALUE
   * 单源：直接设为 INITIAL_WATCHER_VALUE
   *
   * INITIAL_WATCHER_VALUE 作为哨兵值，
   * 在 job 中用于判断是否是首次触发，首次时 oldValue 传 undefined。
   */
  let oldValue: any = isMultiSource
    ? new Array((source as []).length).fill(INITIAL_WATCHER_VALUE)
    : INITIAL_WATCHER_VALUE

  // ============================================================
  // job（调度任务）
  // ============================================================

  const job = (immediateFirstRun?: boolean) => {
    /**
     * 执行条件：
     * 1. effect 必须是 ACTIVE
     * 2. effect 是 DIRTY 或者这是 immediate 首次运行
     */
    if (
      !(effect.flags & EffectFlags.ACTIVE) ||
      (!effect.dirty && !immediateFirstRun)
    ) {
      return
    }

    if (cb) {
      // watch(source, cb) 模式
      const newValue = effect.run()

      /**
       * 变化判断：
       * - forceTrigger: 强制触发（reactive / shallowRef 等）
       * - deep: 深层监听总是触发
       * - isMultiSource: 逐个比较新旧值
       * - hasChanged: 单值比较
       */
      if (
        deep ||
        forceTrigger ||
        (isMultiSource
          ? (newValue as any[]).some((v, i) => hasChanged(v, oldValue[i]))
          : hasChanged(newValue, oldValue))
      ) {
        // 执行上次回调注册的清理函数
        if (cleanup) {
          cleanup()
        }

        const currentWatcher = activeWatcher
        activeWatcher = effect
        try {
          const args = [
            newValue,
            /**
             * oldValue 处理：
             * - INITIAL_WATCHER_VALUE → undefined（首次触发）
             * - 多源且首元素为 INITIAL_WATCHER_VALUE → []（首次多源）
             * - 否则 → 实际 oldValue
             */
            oldValue === INITIAL_WATCHER_VALUE
              ? undefined
              : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE
                ? []
                : oldValue,
            boundCleanup,
          ]
          oldValue = newValue
          call
            ? call(cb!, WatchErrorCodes.WATCH_CALLBACK, args)
            : // @ts-expect-error
              cb!(...args)
        } finally {
          activeWatcher = currentWatcher
        }
      }
    } else {
      // watchEffect 模式：直接运行 effect
      effect.run()
    }
  }

  // ============================================================
  // 组装 effect
  // ============================================================

  if (augmentJob) {
    augmentJob(job)
  }

  effect = new ReactiveEffect(getter)

  // scheduler：自定义调度器 → 通过它调用 job；否则 job 就是 scheduler
  effect.scheduler = scheduler
    ? () => scheduler(job, false)
    : (job as EffectScheduler)

  // boundCleanup：绑定到当前 effect
  boundCleanup = fn => onWatcherCleanup(fn, false, effect)

  // effect.onStop = 清理函数
  cleanup = effect.onStop = () => {
    const cleanups = cleanupMap.get(effect)
    if (cleanups) {
      if (call) {
        call(cleanups, WatchErrorCodes.WATCH_CLEANUP)
      } else {
        for (const cleanup of cleanups) cleanup()
      }
      cleanupMap.delete(effect)
    }
  }

  // DEV: 挂载调试回调
  if (__DEV__) {
    effect.onTrack = options.onTrack
    effect.onTrigger = options.onTrigger
  }

  // ============================================================
  // 初始运行
  // ============================================================

  if (cb) {
    if (immediate) {
      // immediate 模式：立即执行 job（oldValue = undefined）
      job(true)
    } else {
      // 普通模式：初始化 oldValue，不执行回调
      oldValue = effect.run()
    }
  } else if (scheduler) {
    // watchEffect + scheduler：通过 scheduler 执行（isFirstRun = true）
    scheduler(job.bind(null, true), true)
  } else {
    // watchEffect：直接运行
    effect.run()
  }

  // 挂载 pause/resume/stop
  watchHandle.pause = effect.pause.bind(effect)
  watchHandle.resume = effect.resume.bind(effect)
  watchHandle.stop = watchHandle

  return watchHandle
}

// ============================================================
// traverse —— 深层遍历追踪
// ============================================================

/**
 * traverse(value, depth?, seen?)
 *
 * 递归遍历值内部的所有属性，确保每个属性都被 track 从而建立依赖。
 *
 * ### 终止条件
 * - depth <= 0：达到指定深度
 * - !isObject(value)：非对象
 * - value[SKIP]：markRaw 标记
 * - seen.get(value) >= depth：已遍历到更深的层级（避免循环引用和重复遍历）
 *
 * ### 遍历策略（按类型分支）
 * - Ref → 遍历 .value
 * - Array → 遍历每个元素
 * - Set/Map → forEach 遍历每个值
 * - PlainObject → for...in + 可枚举 Symbol 属性
 *
 * @param value - 要遍历的值
 * @param depth - 最大深度（默认 Infinity）
 * @param seen  - 已访问映射（避免循环引用）
 * @returns 原始 value（链式调用友好）
 */
export function traverse(
  value: unknown,
  depth: number = Infinity,
  seen?: Map<unknown, number>,
): unknown {
  if (depth <= 0 || !isObject(value) || (value as any)[ReactiveFlags.SKIP]) {
    return value
  }

  // 初始化 seen 映射并检查已访问深度
  seen = seen || new Map()
  if ((seen.get(value) || 0) >= depth) {
    return value
  }
  seen.set(value, depth)
  depth--

  if (isRef(value)) {
    // Ref：遍历 ref.value
    traverse(value.value, depth, seen)
  } else if (isArray(value)) {
    // 数组：遍历每个元素
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, seen)
    }
  } else if (isSet(value) || isMap(value)) {
    // Set/Map：遍历每个值
    value.forEach((v: any) => {
      traverse(v, depth, seen)
    })
  } else if (isPlainObject(value)) {
    // 普通对象：for...in + 可枚举 Symbol 属性
    for (const key in value) {
      traverse(value[key], depth, seen)
    }
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key as any], depth, seen)
      }
    }
  }
  return value
}
