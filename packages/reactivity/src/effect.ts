/**
 * effect.ts —— Vue 3 响应式系统的核心引擎
 *
 * ## 功能概述
 * 本文件实现了 Vue 3 响应式系统的核心 runtime：
 *
 * 1. **ReactiveEffect**：响应式副作用的载体，封装了用户函数和依赖追踪/清理逻辑
 * 2. **批量调度系统**：batch/startBatch/endBatch，将同一个 microtask 内的多次 trigger
 *    合并为一次执行
 * 3. **依赖图维护**：通过双向链表（Link）管理"数据源 ↔ 订阅者"的绑定关系
 * 4. **Computed 刷新**：refreshComputed，惰性计算 + 脏检查
 *
 * ## 整体架构
 *
 * ```
 * reactive 数据变化
 *     → dep.trigger()        // 通知所有订阅者
 *     → sub.notify()         // 检查是否需要执行
 *     → batch(sub)           // 加入批量队列（NOTIFIED 标志）
 *     → endBatch()           // microtask 结束时统一处理
 *     → sub.trigger()        // scheduler || runIfDirty
 *     → e.run()              // 最终执行用户函数（重新收集依赖）
 * ```
 *
 * ## 关键数据结构
 *
 * ### Link（双向链表节点）
 * 每个 dep 和 subscriber 之间通过 Link 建立双向关联：
 * - dep.subs → 订阅该 dep 的 sub 链表（prevSub/nextSub）
 * - sub.deps → 该 sub 订阅的 dep 链表（prevDep/nextDep）
 *
 * ### EffectFlags（位标志）
 * 用位运算高效管理副作用的状态。一个 effect 可以同时处于多个状态。
 */

import { extend, hasChanged } from '@vue/shared'
import type { ComputedRefImpl } from './computed'
import type { TrackOpTypes, TriggerOpTypes } from './constants'
import { type Link, globalVersion } from './dep'
import { activeEffectScope } from './effectScope'
import { warn } from './warning'

// ============================================================
// 类型定义
// ============================================================

/** 调度器函数类型 */
export type EffectScheduler = (...args: any[]) => any

/** 调试事件（track / trigger 时触发） */
export type DebuggerEvent = {
  effect: Subscriber
} & DebuggerEventExtraInfo

/** 调试事件的额外信息：目标对象、操作类型、key、新旧值等 */
export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

/** 调试器配置：track 和 trigger 的回调 */
export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}

/** ReactiveEffect 的配置选项 */
export interface ReactiveEffectOptions extends DebuggerOptions {
  /**
   * 自定义调度函数。如果提供，trigger 时调用 scheduler 而不是直接执行 effect。
   * Vue 的异步渲染队列（queueJob）就是通过 scheduler 实现的。
   */
  scheduler?: EffectScheduler
  /**
   * 是否允许递归触发。默认不允许——如果 effect 在执行过程中又触发自身，会被跳过。
   * 防止无限递归（如 effect 内修改自身依赖的数据）。
   */
  allowRecurse?: boolean
  /** effect 停止时回调 */
  onStop?: () => void
}

/** Effect runner：调用函数返回类型 T，同时携带 effect 引用 */
export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

// ============================================================
// 全局状态
// ============================================================

/**
 * 当前活跃的订阅者（正在执行的 effect 或 computed）
 *
 * 在 effect.run() 期间被设置为当前 ReactiveEffect，
 * 所有 reactive proxy 的 getter 读取时通过此变量建立依赖关系。
 *
 * 设为 undefined 表示没有活跃的订阅者，
 * 此时对 reactive 数据的读取不会建立任何依赖。
 */
export let activeSub: Subscriber | undefined

// ============================================================
// EffectFlags —— 位标志枚举
// ============================================================

/**
 * Effect 的状态标志（位掩码）
 *
 * 使用位运算而非多个 boolean，既节省内存又支持高效的组合判断：
 * ```
 * flags & EffectFlags.ACTIVE   // 检查是否活跃
 * flags |= EffectFlags.DIRTY    // 设置脏标记
 * flags &= ~EffectFlags.DIRTY   // 清除脏标记
 * ```
 */
export enum EffectFlags {
  /** 1: effect 是活跃的（未停止）。停止后 effect 不再追踪依赖也不会被触发。 */
  ACTIVE = 1 << 0,
  /** 2: effect 正在执行中（fn 正在运行）。用于防止递归触发。 */
  RUNNING = 1 << 1,
  /** 4: effect 需要追踪依赖。computed 在没有订阅者时关闭追踪以节省开销。 */
  TRACKING = 1 << 2,
  /** 8: effect 已被通知（已加入批量队列）。在同一个批次中不会重复入队。 */
  NOTIFIED = 1 << 3,
  /** 16: 脏标记。computed 的值可能已过期，需要重新计算。 */
  DIRTY = 1 << 4,
  /** 32: 允许递归触发。设置后即使 RUNNING 也会执行，用于 watch 等场景。 */
  ALLOW_RECURSE = 1 << 5,
  /** 64: effect 已暂停。暂停期间 trigger 被缓存，resume 时执行。 */
  PAUSED = 1 << 6,
  /** 128: computed 已求过值（在 refreshComputed 中设置）。用于判断是否跳过不必要的重算。 */
  EVALUATED = 1 << 7,
}

// ============================================================
// Subscriber 接口
// ============================================================

/**
 * Subscriber —— 订阅者接口
 *
 * 任何响应式数据的"消费者"都实现此接口。
 * ReactiveEffect 和 ComputedRefImpl 都实现了 Subscriber。
 *
 * 订阅者通过双向链表与它订阅的 dep 关联：
 * ```
 *   dep A ←→ Link ←→ dep B ←→ Link ←→ dep C
 *            ↕                ↕                ↕
 *          Link              Link              Link
 *            ↕                ↕                ↕
 *          [prevDep/nextDep 链表中的 Subscriber]
 * ```
 * 两条链表：
 * - 从 Sub 出发的 deps 链表（prevDep/nextDep）：我依赖了哪些 dep
 * - 从 Dep 出发的 subs 链表（prevSub/nextSub）：谁订阅了我这个 dep
 */
export interface Subscriber extends DebuggerOptions {
  /**
   * dep 双向链表的头节点
   * @internal
   */
  deps?: Link
  /**
   * dep 双向链表的尾节点（方便尾部添加）
   * @internal
   */
  depsTail?: Link
  /**
   * 位标志，管理 effect 的各种状态
   * @internal
   */
  flags: EffectFlags
  /**
   * 批量队列中的下一个订阅者（单向链表）
   * @internal
   */
  next?: Subscriber
  /**
   * 通知此订阅者其依赖的数据已变更。
   *
   * 实现逻辑：
   * - ReactiveEffect：调用 batch(this) 加入批量队列
   * - ComputedRefImpl：设置 DIRTY 标志并传播通知到上层订阅者
   *
   * 返回 true 表示还需要触发上层 computed 的 dep。
   * @internal
   */
  notify(): true | void
}

// ============================================================
// 暂停队列
// ============================================================

/**
 * 暂停期间的触发缓存
 *
 * 当 effect 被 pause() 后，所有的 trigger 不是立即执行，
 * 而是将 effect 加入此 WeakSet。resume() 时统一执行。
 *
 * WeakSet 确保暂停的 effect 可以被垃圾回收（不会因为此集合而产生内存泄漏）。
 */
const pausedQueueEffects = new WeakSet<ReactiveEffect>()

// ============================================================
// ReactiveEffect —— 响应式副作用类
// ============================================================

/**
 * ReactiveEffect —— 响应式副作用
 *
 * 这是 Vue 3 响应式系统的核心单元。每个 effect/watch/watchEffect/computed/render
 * 都会创建一个 ReactiveEffect 实例。
 *
 * ### 生命周期
 * ```
 * new ReactiveEffect(fn)
 *   → run()                        // 首次执行，建立依赖关系
 *     → prepareDeps(this)          // 重置依赖版本号
 *     → fn()                       // 执行用户函数，期间读取 reactive 数据 → track → 建立 Link
 *     → cleanupDeps(this)          // 清理不再使用的依赖
 *   → 数据变更 → trigger → notify → batch → endBatch → trigger → run() → ...
 *   → stop()                       // 停止追踪，断开所有依赖
 * ```
 *
 * ### 核心状态字段
 * - `deps / depsTail`：双向链表的头尾指针，连接此 effect 订阅的所有 dep
 * - `flags`：位标志，管理 ACTIVE/RUNNING/TRACKING/NOTIFIED/PAUSED 等状态
 * - `scheduler`：自定义调度器。Vue 组件 render effect 的 scheduler 是 queueJob
 * - `cleanup`：清理函数（onEffectCleanup 设置），下次 run 前调用
 */
export class ReactiveEffect<T = any>
  implements Subscriber, ReactiveEffectOptions
{
  /**
   * 依赖双向链表的头节点
   * @internal
   */
  deps?: Link = undefined

  /**
   * 依赖双向链表的尾节点（方便 O(1) 追加）
   * @internal
   */
  depsTail?: Link = undefined

  /**
   * 位标志。初始值 = ACTIVE | TRACKING
   * 表示新建的 effect 是活跃的且会追踪依赖。
   * @internal
   */
  flags: EffectFlags = EffectFlags.ACTIVE | EffectFlags.TRACKING

  /**
   * 批量队列的下一个节点
   * @internal
   */
  next?: Subscriber = undefined

  /**
   * 清理函数。由 onEffectCleanup() 设置，在下次 effect 执行前调用。
   * @internal
   */
  cleanup?: () => void = undefined

  // --- 配置选项 ---
  scheduler?: EffectScheduler = undefined
  onStop?: () => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void

  /**
   * 构造函数
   *
   * @param fn - 用户传入的函数（副作用函数体）
   *
   * 自动注册到 activeEffectScope（如果有的话），以便 scope.stop() 时统一清理。
   *
   * 特殊情况处理：
   * 如果 activeEffectScope 已停止（如在 <Suspense> 中组件被卸载但 setup 因
   * top-level await 恢复执行），effect 被标记为非活跃——它不会被执行但也不会
   * 成为孤儿 effect 持续泄漏。
   */
  constructor(public fn: () => T) {
    if (activeEffectScope) {
      if (activeEffectScope.active) {
        // 正常情况：注册到当前活跃的 effect scope
        activeEffectScope.effects.push(this)
      } else {
        // scope 已停止 → 标记 effect 为非活跃
        // 发生在 <Suspense> 中：setup 因 top-level await 暂停，
        // 期间组件被卸载，恢复后新创建的 effect 不应活跃
        this.flags &= ~EffectFlags.ACTIVE
      }
    }
  }

  /**
   * 暂停 effect
   *
   * 暂停期间，对依赖数据的修改不会触发此 effect 重新执行。
   * 触发的请求会被缓存在 pausedQueueEffects 中。
   *
   * 典型场景：Vue 组件被 <KeepAlive> 缓存后停用（deactivated），
   * 其 render effect 被暂停，避免无效的响应式更新。
   */
  pause(): void {
    this.flags |= EffectFlags.PAUSED
  }

  /**
   * 恢复 effect
   *
   * 清除暂停标志，如果暂停期间有缓存的触发请求，立即执行一次。
   */
  resume(): void {
    if (this.flags & EffectFlags.PAUSED) {
      this.flags &= ~EffectFlags.PAUSED
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this)
        this.trigger()
      }
    }
  }

  /**
   * 通知此 effect：你依赖的数据变了
   *
   * 由 dep.trigger() 调用。做两件事：
   * 1. 如果 effect 正在执行且不允许递归 → 跳过（防止无限循环）
   * 2. 否则将 effect 加入批量队列（标记 NOTIFIED 并入队）
   *
   * NOTIFIED 标志确保同一个 effect 在同一个批次中最多入队一次。
   * @internal
   */
  notify(): void {
    if (
      this.flags & EffectFlags.RUNNING &&
      !(this.flags & EffectFlags.ALLOW_RECURSE)
    ) {
      // effect 正在执行且不允许递归 → 跳过本次通知
      return
    }
    if (!(this.flags & EffectFlags.NOTIFIED)) {
      // 尚未被通知 → 加入批量队列
      batch(this)
    }
  }

  /**
   * 执行 effect 的核心方法
   *
   * 完整流程：
   * 1. 如果 effect 已停止 → 仅执行 fn（不追踪依赖）
   * 2. 标记 RUNNING → 清理旧的 cleanup → 准备依赖追踪
   * 3. 设置 activeSub = this → 执行 fn → 依赖在 fn 中被自动收集
   * 4. 清理不再使用的旧依赖 → 恢复 activeSub → 清除 RUNNING
   */
  run(): T {
    // TODO cleanupEffect
    // 🔑 注：上方的 TODO 表明这里可能需要先调用 cleanupEffect，但目前未实现

    if (!(this.flags & EffectFlags.ACTIVE)) {
      // effect 已停止 → 仅执行函数，不追踪任何依赖
      // 这发生在 stop() 期间，用于执行清理函数
      return this.fn()
    }

    // 标记为运行中（防止递归触发）
    this.flags |= EffectFlags.RUNNING

    // 执行清理函数（上一次 run 时通过 onEffectCleanup 注册的）
    cleanupEffect(this)

    // 准备依赖追踪：将所有已有依赖的 version 重置为 -1
    // 这样 run 之后可以通过 version !== -1 判断哪些依赖仍在使用
    prepareDeps(this)

    const prevEffect = activeSub
    const prevShouldTrack = shouldTrack
    activeSub = this
    shouldTrack = true

    try {
      // ⚡ 执行用户函数——依赖在此过程中被自动收集
      // 每次读取 reactive 数据 → proxy getter → track(dep) → 建立 Link
      return this.fn()
    } finally {
      if (__DEV__ && activeSub !== this) {
        // 安全检查：用户函数中的异步操作可能更改了 activeSub
        warn(
          'Active effect was not restored correctly - ' +
            'this is likely a Vue internal bug.',
        )
      }

      // 清理不再使用的依赖（version 仍为 -1 的 Link 被移除）
      cleanupDeps(this)

      // 恢复全局状态
      activeSub = prevEffect
      shouldTrack = prevShouldTrack
      this.flags &= ~EffectFlags.RUNNING
    }
  }

  /**
   * 停止 effect
   *
   * 断开所有依赖链接，移除清理。停止后的 effect 不再响应数据变化。
   *
   * 执行步骤：
   * 1. 遍历 deps 链表，从每个 dep 的 subs 链表中移除自己
   * 2. 清空 deps 链表
   * 3. 执行清理函数和 onStop 回调
   * 4. 清除 ACTIVE 标志
   */
  stop(): void {
    if (this.flags & EffectFlags.ACTIVE) {
      // 从所有订阅的 dep 中移除自己
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link)
      }
      // 清空依赖链表
      this.deps = this.depsTail = undefined
      // 执行上次的清理函数
      cleanupEffect(this)
      this.onStop && this.onStop()
      // 标记为非活跃
      this.flags &= ~EffectFlags.ACTIVE
    }
  }

  /**
   * 触发 effect 执行
   *
   * 三种路径：
   * 1. 已暂停 → 缓存到 pausedQueueEffects，等待 resume
   * 2. 有 scheduler → 调用 scheduler（如 queueJob 异步队列）
   * 3. 无 scheduler → 同步调用 runIfDirty
   *
   * scheduler 的巧妙之处：
   * Vue 组件渲染使用 scheduler = queueJob，这确保：
   * - 同一组件在同一 tick 内多次数据变更只触发一次渲染
   * - 渲染在微任务中异步执行
   */
  trigger(): void {
    if (this.flags & EffectFlags.PAUSED) {
      // 暂停状态 → 缓存触发请求
      pausedQueueEffects.add(this)
    } else if (this.scheduler) {
      // 有调度器 → 延迟执行
      this.scheduler()
    } else {
      // 无调度器 → 同步执行
      this.runIfDirty()
    }
  }

  /**
   * 如果脏了则重新运行
   *
   * isDirty 检查所有依赖的版本号是否有变化。
   * @internal
   */
  runIfDirty(): void {
    if (isDirty(this)) {
      this.run()
    }
  }

  /**
   * 是否为脏（需要重新计算）
   *
   * 委托给 isDirty 函数。
   */
  get dirty(): boolean {
    return isDirty(this)
  }
}

// ============================================================
// 批量调度系统（Batch System）
// ============================================================

/**
 * 批量调度是 Vue 3 响应式系统的关键性能优化。
 *
 * 问题：在同一个同步代码块中，可能连续修改多个响应式数据，
 * 每次都触发 effect 执行会导致大量重复计算。
 *
 * 解决：
 * 1. 数据变更 → dep.trigger() → sub.notify() → batch(sub)
 *    将 sub 标记为 NOTIFIED 并加入队列，但不立即执行
 * 2. 所有同步代码执行完毕后 → endBatch()
 *    批量处理队列中所有被通知的 sub
 *
 * 队列结构是两个单向链表：
 * - batchedSub：普通 effect 队列
 * - batchedComputed：computed 队列（优先处理，因为普通 effect 可能依赖它们）
 *
 * batchDepth 支持嵌套：batch 调用可以嵌套（如在一个 effect 内部修改数据触发新 batch）。
 * 只有最外层的 endBatch() 才真正执行队列。
 */

/** 批量深度计数器（支持嵌套 batch） */
let batchDepth = 0

/** 等待执行的普通 effect 链表头 */
let batchedSub: Subscriber | undefined

/** 等待执行的 computed 链表头（优先于 batchedSub 处理） */
let batchedComputed: Subscriber | undefined

/**
 * 将订阅者加入批量队列
 *
 * @param sub        - 被通知的订阅者
 * @param isComputed - 是否是 computed（computed 放入单独的队列优先处理）
 *
 * 流程：
 * 1. 标记 NOTIFIED（确保同一批次中不会重复入队）
 * 2. 如果是 computed → 插入 batchedComputed 链表头部
 * 3. 如果正在批量中 → 插入 batchedSub 链表头部
 *
 * 注意：如果 batchDepth === 0（不在批量中），也不会立即执行。
 * 执行发生在同步代码结束后的 endBatch() 调用中。
 */
export function batch(sub: Subscriber, isComputed = false): void {
  sub.flags |= EffectFlags.NOTIFIED

  if (isComputed) {
    // computed 放入单独的队列——在普通 effect 之前处理
    // 因为普通 effect 可能依赖 computed 的值
    sub.next = batchedComputed
    batchedComputed = sub
    return
  }

  // 普通 effect 放入 batchedSub 链表
  sub.next = batchedSub
  batchedSub = sub
}

/**
 * 开始一个批量块
 *
 * 增加嵌套深度。在批量块内部的 trigger 不会立即执行。
 * 通常由 Vue 内部调用，如组件更新期间。
 * @internal
 */
export function startBatch(): void {
  batchDepth++
}

/**
 * 结束一个批量块
 *
 * 减少嵌套深度。当深度降到 0 时（最外层批量结束），
 * 依次处理 computed 队列和普通 effect 队列。
 *
 * 处理顺序：先 computed，后普通 effect
 * 原因：普通 effect（如 render）可能读取 computed 值，
 * 必须先确保 computed 的值是最新的。
 *
 * 错误处理：如果第一个 effect 执行出错，仍继续执行后续 effect，
 * 最后统一抛出第一个错误。这确保一个 effect 的错误不会阻塞其他 effect。
 *
 * @internal
 */
export function endBatch(): void {
  if (--batchDepth > 0) {
    // 仍在嵌套批量中 → 不执行
    return
  }

  // 1️⃣ 先处理 computed 队列
  if (batchedComputed) {
    let e: Subscriber | undefined = batchedComputed
    batchedComputed = undefined

    while (e) {
      const next: Subscriber | undefined = e.next
      e.next = undefined
      e.flags &= ~EffectFlags.NOTIFIED // 清除通知标记
      e = next
    }
    // 🔑 注意：computed 队列只清除 NOTIFIED，不调用 trigger。
    // Computed 的刷新是惰性的——只有被读取时才计算。
    // NOTIFIED 清除后，computed 的 DIRTY 标志已在 notify 时设置，读取时会触发 refreshComputed。
  }

  let error: unknown

  // 2️⃣ 再处理普通 effect 队列
  while (batchedSub) {
    let e: Subscriber | undefined = batchedSub
    batchedSub = undefined

    while (e) {
      const next: Subscriber | undefined = e.next
      e.next = undefined
      e.flags &= ~EffectFlags.NOTIFIED

      if (e.flags & EffectFlags.ACTIVE) {
        try {
          // ⚡ 触发 effect 执行（scheduler 或 runIfDirty）
          // ACTIVE 标志确保只有 effect 有此方法（computed 不在此队列）
          ;(e as ReactiveEffect).trigger()
        } catch (err) {
          if (!error) error = err
        }
      }
      e = next
    }
  }

  // 统一抛出第一个错误
  if (error) throw error
}

// ============================================================
// 依赖追踪（Dependency Tracking）
// ============================================================

/**
 * 准备依赖追踪（在 run 之前调用）
 *
 * 遍历当前 effect 的所有依赖 Link，将 version 重置为 -1。
 * 这样在 effect.fn() 执行后，可以通过 version === -1 来判断
 * 哪些依赖是"不再使用的"（在本次 run 中没有被重新访问）。
 *
 * 同时保存 link.dep.activeLink，以便 run 结束后恢复。
 */
function prepareDeps(sub: Subscriber) {
  for (let link = sub.deps; link; link = link.nextDep) {
    // -1 标记：尚未在本次 run 中被重新收集
    link.version = -1

    // 保存之前在此 dep 上的 activeLink（可能属于另一个 effect），
    // 用于 cleanupDeps 中的恢复
    link.prevActiveLink = link.dep.activeLink
    link.dep.activeLink = link
  }
}

/**
 * 清理不再使用的依赖（在 run 之后调用）
 *
 * 从尾部向头部遍历依赖链表：
 * - version === -1 → 本次 run 中没有重新访问 → 移除该依赖
 * - version !== -1 → 本次 run 中重新访问了 → 保留（成为新的链表头）
 *
 * 同时恢复 dep.activeLink 到 run 之前的值。
 *
 * 这种"标记-清除"式依赖收集确保：
 * - 条件分支中的旧依赖被自动解除
 * - 新的依赖被自动建立
 * - 不需要手动管理依赖关系
 */
function cleanupDeps(sub: Subscriber) {
  let head
  let tail = sub.depsTail
  let link = tail

  while (link) {
    const prev = link.prevDep

    if (link.version === -1) {
      // 本次 run 中没有访问 → 从 dep 和 effect 的双向链表中移除
      if (link === tail) tail = prev // 更新尾指针
      removeSub(link)  // 从 dep.subs 链表中移除
      removeDep(link)  // 从 effect.deps 链表中移除
    } else {
      // 本次 run 中重新访问 → 保留
      // head 指向仍在链表中的最后一个（最靠前）节点
      head = link
    }

    // 恢复 dep.activeLink 为 run 之前的值
    link.dep.activeLink = link.prevActiveLink
    link.prevActiveLink = undefined
    link = prev
  }

  // 更新 effect 的依赖链表头尾指针
  sub.deps = head
  sub.depsTail = tail
}

// ============================================================
// 脏检查
// ============================================================

/**
 * 判断订阅者是否为"脏"（需要重新执行/计算）
 *
 * 遍历所有依赖：
 * 1. dep.version !== link.version → 依赖的数据已变更
 * 2. dep.computed 存在 → 递归检查 computed 是否需要刷新
 *    refreshComputed 会重新计算 computed 的值并返回是否变更
 *
 * 向后兼容：`_dirty` 标志（Pinia 等库使用）。
 */
function isDirty(sub: Subscriber): boolean {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (
      link.dep.version !== link.version ||
      (link.dep.computed &&
        (refreshComputed(link.dep.computed) ||
          link.dep.version !== link.version))
    ) {
      return true
    }
  }

  // 向后兼容：外部库（如 Pinia 的 testing 模块）手动设置 _dirty
  if (
    // @ts-expect-error
    sub._dirty
  ) {
    return true
  }
  return false
}

// ============================================================
// Computed 刷新
// ============================================================

/**
 * 刷新 computed 的值（惰性求值）
 *
 * computed 采用惰性求值策略：值只在被读取（或依赖它的 effect 执行）时才计算。
 *
 * ### 执行流程
 * 1. 如果 computed 会在运行时自动追踪且尚未标记脏 → 无需刷新，直接返回
 * 2. 清除 DIRTY 标志
 * 3. 检查 globalVersion 快速路径（没有响应式变更就跳过）
 * 4. SSR 特殊处理：computed 总是重新求值（依赖 globalVersion 快速路径缓存）
 * 5. 标准检查：有 deps 且已求值且不脏 → 跳过
 * 6. 执行 computed.fn 计算新值
 * 7. 新值与旧值不同 → 更新并增加 dep.version
 *
 * ### 快速路径解析
 * - globalVersion 是全局计数器，每次 track 时递增
 * - 如果 computed 的 globalVersion === 全局 version，说明没有任何响应式数据被访问
 * - 此时直接返回旧值，无需重新计算
 *
 * 返回 undefined 表示刷新成功（值的语义是"不阻止上层 isDirty 检查"）。
 * @internal
 */
export function refreshComputed(computed: ComputedRefImpl): undefined {
  // 如果 computed 会自动追踪且不脏 → 跳过
  if (
    computed.flags & EffectFlags.TRACKING &&
    !(computed.flags & EffectFlags.DIRTY)
  ) {
    return
  }
  computed.flags &= ~EffectFlags.DIRTY

  // globalVersion 快速路径
  // 如果没有任何响应式数据变更（自上次刷新后），直接返回
  if (computed.globalVersion === globalVersion) {
    return
  }
  computed.globalVersion = globalVersion

  // SSR 环境：没有 render effect，computed 没有订阅者所以也不追踪 deps。
  // 因此不能依赖 isDirty 检查，而是每次重新求值（通过 globalVersion 快速路径缓存）。
  if (
    !computed.isSSR &&
    computed.flags & EffectFlags.EVALUATED &&
    ((!computed.deps && !(computed as any)._dirty) || !isDirty(computed))
  ) {
    // 没有依赖（不依赖响应式数据）且已求过值 → 无需重算
    // 或者依赖没有变脏 → 也无需重算
    return
  }

  // 开始计算
  computed.flags |= EffectFlags.RUNNING

  const dep = computed.dep
  const prevSub = activeSub
  const prevShouldTrack = shouldTrack
  activeSub = computed
  shouldTrack = true

  try {
    prepareDeps(computed)
    // ⚡ 重新执行 computed 的计算函数
    const value = computed.fn(computed._value)

    // 比较新旧值
    if (dep.version === 0 || hasChanged(value, computed._value)) {
      computed.flags |= EffectFlags.EVALUATED
      computed._value = value
      dep.version++ // 增加版本号，通知下游依赖此 computed 的 effect
    }
  } catch (err) {
    dep.version++ // 即使出错也增加版本号（避免死循环）
    throw err
  } finally {
    activeSub = prevSub
    shouldTrack = prevShouldTrack
    cleanupDeps(computed)
    computed.flags &= ~EffectFlags.RUNNING
  }
}

// ============================================================
// 依赖图维护（Link 的添加和移除）
// ============================================================

/**
 * 从 dep 的订阅者链表中移除一个 sub
 *
 * @param link - 要移除的 Link 节点
 * @param soft - 是否"软移除"。soft 模式下不减 dep.sc（订阅计数）
 *               用于 computed 取消追踪时的清理——computed 仍持有对 dep 的引用，
 *               但不应阻止 dep 被 GC（#11979）。
 *
 * 三种链表操作：
 * 1. 从 dep.subs 双向链表中移除（prevSub/nextSub）
 * 2. 更新 dep.subsHead（调试用）
 * 3. 更新 dep.subs 尾指针
 *
 * 关键优化：当 dep 没有任何订阅者时：
 * - 如果是 computed → 取消追踪其 deps（使 computed 和其值可以被 GC）
 * - 如果 dep.sc === 0 且 dep 有 map → 从 map 中删除此 dep（#11979 —— 减少不再被追踪属性的内存占用）
 */
function removeSub(link: Link, soft = false) {
  const { dep, prevSub, nextSub } = link

  // 从双向链表中移除
  if (prevSub) {
    prevSub.nextSub = nextSub
    link.prevSub = undefined
  }
  if (nextSub) {
    nextSub.prevSub = prevSub
    link.nextSub = undefined
  }

  // 调试用：更新链表头
  if (__DEV__ && dep.subsHead === link) {
    dep.subsHead = nextSub
  }

  // 更新链表尾
  if (dep.subs === link) {
    dep.subs = prevSub

    if (!prevSub && dep.computed) {
      /**
       * 最后一个订阅者也移除了
       *
       * 如果是 computed，需要递归取消追踪其所有 deps：
       * 这样 computed 及其缓存值可以被垃圾回收。
       *
       * 使用 soft = true（不减 dep.sc）因为 computed 在内部仍引用这些 dep。
       */
      dep.computed.flags &= ~EffectFlags.TRACKING
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        removeSub(l, true)
      }
    }
  }

  // #11979：属性 dep 没有任何订阅者时，从 map 中删除
  // 典型场景：一个对象被保持引用，但只有部分属性被追踪。
  // 当不再有 effect 订阅某个属性时，立即清理，减少内存占用。
  if (!soft && !--dep.sc && dep.map) {
    dep.map.delete(dep.key)
  }
}

/**
 * 从 effect 的依赖链表中移除一个 Link
 *
 * 操作 prevDep/nextDep 指针以保持双向链表的完整性。
 */
function removeDep(link: Link) {
  const { prevDep, nextDep } = link
  if (prevDep) {
    prevDep.nextDep = nextDep
    link.prevDep = undefined
  }
  if (nextDep) {
    nextDep.prevDep = prevDep
    link.nextDep = undefined
  }
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 创建一个响应式副作用
 *
 * 这是用户最常用的 API：`watchEffect`、`watch`、`computed` 底层都调用它。
 *
 * ### 使用示例
 * ```ts
 * const count = ref(0)
 * effect(() => {
 *   console.log(count.value) // 自动追踪 count
 * })
 * count.value++ // 自动重新执行 effect
 * ```
 *
 * ### 返回值
 * 返回一个 runner 函数（effect.run 的绑定版本），调用 runner() 可手动触发 effect。
 * runner.effect 持有底层 ReactiveEffect 实例。
 *
 * ### 嵌套 effect
 * 如果传入的 fn 本身是一个 effect runner，会自动解包获取其原始函数。
 * 这用于 `watch(getter, callback)` 场景——watch 内部创建 effect 包裹用户 getter。
 */
export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions,
): ReactiveEffectRunner<T> {
  // 解包嵌套的 effect runner（watch 场景）
  if ((fn as ReactiveEffectRunner).effect instanceof ReactiveEffect) {
    fn = (fn as ReactiveEffectRunner).effect.fn
  }

  // 创建 effect 实例
  const e = new ReactiveEffect(fn)
  if (options) {
    extend(e, options) // 混入 scheduler、onStop、onTrack 等选项
  }

  try {
    e.run() // 立即执行一次，建立初始依赖关系
  } catch (err) {
    e.stop() // 执行出错 → 清理 effect，避免部分建立的依赖泄漏
    throw err
  }

  // 返回 runner（包装 run 调用）
  const runner = e.run.bind(e) as ReactiveEffectRunner
  runner.effect = e
  return runner
}

/**
 * 停止关联给定 runner 的 effect
 *
 * 调用后 effect 不再响应数据变化。
 *
 * @param runner - 要停止的 effect runner
 */
export function stop(runner: ReactiveEffectRunner): void {
  runner.effect.stop()
}

// ============================================================
// 追踪开关（tracking on/off）
// ============================================================

/**
 * 是否应该追踪依赖
 *
 * 全局开关。当 shouldTrack = false 时，即使有 activeSub，
 * 对 reactive 数据的读取也不会建立依赖关系。
 *
 * 常用于一次性读取（如 JSON.stringify）或 computed 无订阅者时的优化。
 * @internal
 */
export let shouldTrack = true

/** 追踪状态栈（支持嵌套的暂停/恢复） */
const trackStack: boolean[] = []

/**
 * 暂停依赖追踪
 *
 * 之后的 reactive 读取不会建立依赖。
 * 栈式管理——可以嵌套调用 pauseTracking/enableTracking。
 */
export function pauseTracking(): void {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

/**
 * 恢复依赖追踪
 *
 * 恢复之前暂停的追踪。与 pauseTracking 对称。
 */
export function enableTracking(): void {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

/**
 * 重置追踪状态
 *
 * 恢复 trackStack 中保存的上一个状态。
 * 这提供了比 pause/enable 更灵活的控制——不是简单地设为 true/false，
 * 而是回到之前的状态。
 */
export function resetTracking(): void {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

// ============================================================
// Effect 清理
// ============================================================

/**
 * 为当前活跃的 effect 注册一个清理函数
 *
 * 清理函数在以下时机被调用：
 * 1. effect 下一次 run 之前（旧数据清理）
 * 2. effect.stop() 时（最终清理）
 *
 * ### 典型用途
 * ```ts
 * watchEffect((onCleanup) => {
 *   const timer = setInterval(() => {}, 1000)
 *   onCleanup(() => clearInterval(timer)) // 数据变化时清理旧 timer
 * })
 * ```
 *
 * @param fn           - 清理函数
 * @param failSilently - true 时在无活跃 effect 时不报警告
 */
export function onEffectCleanup(fn: () => void, failSilently = false): void {
  if (activeSub instanceof ReactiveEffect) {
    activeSub.cleanup = fn
  } else if (__DEV__ && !failSilently) {
    warn(
      `onEffectCleanup() was called when there was no active effect` +
        ` to associate with.`,
    )
  }
}

/**
 * 执行 effect 的清理函数
 *
 * 在无 activeSub 的上下文中执行清理，确保清理函数内部
 * 对 reactive 数据的读取不会建立非预期的依赖。
 */
function cleanupEffect(e: ReactiveEffect) {
  const { cleanup } = e
  e.cleanup = undefined

  if (cleanup) {
    // 在无活跃 effect 的上下文中执行清理
    const prevSub = activeSub
    activeSub = undefined
    try {
      cleanup()
    } finally {
      activeSub = prevSub
    }
  }
}
