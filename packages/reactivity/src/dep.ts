/**
 * dep.ts —— 依赖追踪与触发系统
 *
 * ## 功能概述
 * 这是 Vue 3 响应式系统的"连接器"——建立和维护"数据 → 订阅者"的依赖关系。
 *
 * 核心数据结构是 WeakMap<object, Map<key, Dep>>，即每个对象的每个属性绑定一个 Dep。
 * Dep 维护一个双向链表，记录所有订阅该属性的 Subscriber（effect / computed）。
 *
 * ## 核心流程
 * ```
 * 读取数据 → proxy getter → track(target, type, key)
 *   → 从 targetMap 获取/创建 Dep
 *   → dep.track() → 创建 Link（连接 dep 和 activeSub）
 *   → 将 Link 加入 sub.deps 链表 + dep.subs 链表
 *
 * 修改数据 → proxy setter → trigger(target, type, key)
 *   → 从 targetMap 获取 Dep
 *   → dep.trigger() → dep.version++ & globalVersion++
 *   → dep.notify() → 遍历 subs 链表 → sub.notify() → batch(sub)
 * ```
 *
 * ## Link 双向链表
 * 每个 Link 节点同时存在于两条链表中：
 * - dep.subs（dep → subscriber）：dep 知道谁订阅了自己
 * - sub.deps（subscriber → dep）：sub 知道自己依赖了谁
 *
 * 这种设计支持高效的"标记-清除"依赖收集：每次 effect 执行时复用旧 Link，
 * 未被重新访问的 Link 在 cleanupDeps 中自动清除。
 */

import { extend, isArray, isIntegerKey, isMap, isSymbol } from '@vue/shared'
import type { ComputedRefImpl } from './computed'
import { type TrackOpTypes, TriggerOpTypes } from './constants'
import {
  type DebuggerEventExtraInfo,
  EffectFlags,
  type Subscriber,
  activeSub,
  endBatch,
  shouldTrack,
  startBatch,
} from './effect'

/**
 * 全局版本号
 *
 * 每次响应式数据变更时递增。
 * 用于 computed 的快速路径：如果 globalVersion 没变，
 * 无需重新计算（没有任何响应式数据被修改）。
 */
export let globalVersion = 0

/**
 * Link —— 依赖关系的桥梁
 *
 * 代表一个数据源（Dep）和一个订阅者（Subscriber）之间的连接。
 * Dep 和 Subscriber 是多对多的关系——每个连接由一个 Link 实例表示。
 *
 * Link 是两个双向链表的节点：
 * 1. 在 sub 端：通过 prevDep/nextDep 链接成"我依赖的所有 dep"链表
 * 2. 在 dep 端：通过 prevSub/nextSub 链接成"订阅我的所有 sub"链表
 *
 * ### version 标记清除机制
 * - run 之前：prepareDeps 将所有 link.version 重置为 -1
 * - run 期间：每次访问响应式数据，link.version 同步为 dep.version
 * - run 之后：version === -1 的 link 被移除（cleanupDeps）
 *
 * @internal
 */
export class Link {
  /**
   * 版本号
   *
   * - 初始化为 dep.version
   * - prepareDeps 中重置为 -1
   * - 重新访问时同步为 dep.version
   */
  version: number

  // --- 双向链表指针 ---
  /** dep 链表中的下一个节点（sub → dep 方向） */
  nextDep?: Link
  /** dep 链表中的上一个节点 */
  prevDep?: Link
  /** sub 链表中的下一个节点（dep → sub 方向） */
  nextSub?: Link
  /** sub 链表中的上一个节点 */
  prevSub?: Link

  /**
   * 上一次的 activeLink
   *
   * prepareDeps 中保存 dep 的旧 activeLink，cleanupDeps 中恢复。
   * 用于处理多个 effect 交替执行时 dep.activeLink 的保存和恢复。
   */
  prevActiveLink?: Link

  constructor(
    public sub: Subscriber,
    public dep: Dep,
  ) {
    this.version = dep.version
    this.nextDep =
      this.prevDep =
      this.nextSub =
      this.prevSub =
      this.prevActiveLink =
        undefined
  }
}

/**
 * Dep —— 依赖对象
 *
 * 每个响应式对象的每个属性对应一个 Dep。
 * Dep 维护了所有订阅该属性的 Subscriber 链表。
 *
 * ### 字段说明
 * - `version`：版本号，每次 trigger 递增。用于判断 effect 是否需要重跑
 * - `subs`：订阅者双向链表的尾指针
 * - `subsHead`：订阅者双向链表的头指针（仅 DEV，用于 onTrigger 回调顺序）
 * - `activeLink`：最近使用的 Link（优化：复用上次的连接）
 * - `map`：反向引用到 KeyToDepMap（用于 cleanup 时从 Map 删除）
 * - `sc`：订阅者计数器（subscriber count），用于判断是否需要 cleanup（#11979）
 *
 * @internal
 */
export class Dep {
  /** 版本号。每次 trigger 递增 */
  version = 0

  /**
   * 最近使用的 Link
   *
   * 优化：如果同一个 effect 连续访问同一个属性，
   * 直接复用 activeLink，无需创建新的 Link。
   */
  activeLink?: Link = undefined

  /**
   * 订阅者双向链表的尾指针
   *
   * 通过 prevSub 向前遍历可以访问所有订阅者。
   * 插入新订阅者时 O(1) 添加到尾部。
   */
  subs?: Link = undefined

  /**
   * 订阅者双向链表的头指针
   *
   * 仅 DEV 环境使用，用于按原始顺序调用 onTrigger 钩子。
   */
  subsHead?: Link

  /**
   * 反向引用到 KeyToDepMap
   *
   * 用于 cleanup 时从 Map 中删除此 Dep（#11979）。
   */
  map?: KeyToDepMap = undefined

  /** 在 Map 中的 key */
  key?: unknown = undefined

  /**
   * 订阅者计数器
   *
   * removeSub 时递减。当 sc 归零且没有订阅者时，
   * 从 map 中删除此 Dep（释放内存）。
   */
  sc: number = 0

  /** 标记自身为 raw，跳过 reactive() 转换 */
  readonly __v_skip = true

  /**
   * @param computed - 如果此 Dep 属于一个 computed 属性，传入 computed 引用
   *                   用于在 removeSub 中递归清理和 GC 优化
   */
  constructor(public computed?: ComputedRefImpl | undefined) {
    if (__DEV__) {
      this.subsHead = undefined
    }
  }

  /**
   * 追踪依赖（track）
   *
   * 在响应式数据的 getter 中被调用。将当前 activeSub 与此 Dep 关联。
   *
   * ### 三步流程
   * 1. **新建 Link**：如果 activeLink 不匹配 → 创建新 Link，加入 sub.deps 链表尾部
   * 2. **复用 Link**：如果 activeLink 匹配且 version === -1 → 同步 version
   * 3. **移动 Link**：如果复用但不是尾部 → 移动到尾部（维持访问顺序）
   *
   * @returns 创建的 Link（用于后续同步 version）
   */
  track(debugInfo?: DebuggerEventExtraInfo): Link | undefined {
    // 没有活跃订阅者 或 追踪被暂停 或 是自身 computed → 跳过
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return
    }

    let link = this.activeLink

    if (link === undefined || link.sub !== activeSub) {
      // 情况 1+2：没有活跃 link 或 link 属于不同的 sub
      // → 创建新 Link
      link = this.activeLink = new Link(activeSub, this)

      // 将 link 加入 activeSub 的 deps 链表尾部
      if (!activeSub.deps) {
        // sub 还没有任何依赖 → Link 同时是头和尾
        activeSub.deps = activeSub.depsTail = link
      } else {
        // 追加到尾部
        link.prevDep = activeSub.depsTail
        activeSub.depsTail!.nextDep = link
        activeSub.depsTail = link
      }

      // 将 link 加入 dep 的 subs 链表
      addSub(link)
    } else if (link.version === -1) {
      // 情况 3：复用上次的 link（未被清理的旧依赖重新被使用）
      // → 同步版本号
      link.version = this.version

      // 如果在链表中不是尾部 → 移动到尾部
      // 这确保了 sub.deps 链表的顺序反映本次执行的访问顺序
      if (link.nextDep) {
        const next = link.nextDep
        next.prevDep = link.prevDep
        if (link.prevDep) {
          link.prevDep.nextDep = next
        }

        link.prevDep = activeSub.depsTail
        link.nextDep = undefined
        activeSub.depsTail!.nextDep = link
        activeSub.depsTail = link

        // 如果 link 原来是头部 → 更新头部指针
        if (activeSub.deps === link) {
          activeSub.deps = next
        }
      }
    }
    // 情况 4：link 已存在，version 已同步，且在尾部 → 无需任何操作

    // DEV: 调用 onTrack 调试钩子
    if (__DEV__ && activeSub.onTrack) {
      activeSub.onTrack(
        extend(
          {
            effect: activeSub,
          },
          debugInfo,
        ),
      )
    }

    return link
  }

  /**
   * 触发依赖（trigger）
   *
   * 在响应式数据的 setter 中被调用。
   * 递增版本号，然后通知所有订阅者。
   */
  trigger(debugInfo?: DebuggerEventExtraInfo): void {
    this.version++
    globalVersion++
    this.notify(debugInfo)
  }

  /**
   * 通知所有订阅者
   *
   * 遍历 subs 链表（从尾部向头部，保持通知顺序）。
   * 整个 notify 过程包裹在 startBatch/endBatch 中，
   * 确保所有被通知的订阅者在一个批次中处理。
   *
   * 顺序说明：subs 链表是反向遍历的（从尾部开始），
   * 但通知时 sub.notify() 只是加入批量队列。
   * 实际的 effect 执行在 endBatch 时按入队顺序发生。
   *
   * Computed 传播：如果 sub.notify() 返回 true（computed），
   * 需要继续通知 computed 的 dep。在这里调用而非在 computed.notify 内部，
   * 是为了减少调用栈深度。
   */
  notify(debugInfo?: DebuggerEventExtraInfo): void {
    startBatch()
    try {
      if (__DEV__) {
        /**
         * DEV: 在原始顺序中调用 onTrigger 钩子
         *
         * subs 链表是反向遍历的，但 onTrigger 应该在原始顺序中触发。
         * 因此使用 subsHead 从头向尾遍历，在 subs 遍历之前执行。
         */
        for (let head = this.subsHead; head; head = head.nextSub) {
          if (head.sub.onTrigger && !(head.sub.flags & EffectFlags.NOTIFIED)) {
            head.sub.onTrigger(
              extend(
                {
                  effect: head.sub,
                },
                debugInfo,
              ),
            )
          }
        }
      }

      // 从尾部向头部遍历所有订阅者
      for (let link = this.subs; link; link = link.prevSub) {
        if (link.sub.notify()) {
          /**
           * notify() 返回 true → 这是 computed
           *
           * computed.notify() 设置了 DIRTY 标志，
           * 现在需要继续通知 computed 自己的 dep；
           * 这样依赖此 computed 的 effect 才能知道 computed 的值变了。
           */
          ;(link.sub as ComputedRefImpl).dep.notify()
        }
      }
    } finally {
      endBatch()
    }
  }
}

/**
 * 将 Link 注册到 Dep 的 subs 链表
 *
 * 特殊处理：
 * 1. 如果 Dep 属于 computed 且之前没有订阅者：
 *    → 首次有订阅者：激活 computed 的 TRACKING
 *    → 开始追踪 computed 自己的依赖（addSub 递归）
 * 2. 将 link 加入 dep.subs 链表尾部
 * 3. DEV：更新 subsHead（用于 onTrigger 顺序）
 */
function addSub(link: Link) {
  link.dep.sc++ // 订阅者计数 +1

  if (link.sub.flags & EffectFlags.TRACKING) {
    const computed = link.dep.computed

    /**
     * Computed 的首次订阅者
     *
     * computed 默认不追踪依赖。当获得第一个订阅者时才开启追踪，
     * 因为没人读取 computed 的值时，追踪依赖只是浪费。
     *
     * 开启追踪：设置 TRACKING | DIRTY 标志，递归订阅其所有 deps。
     */
    if (computed && !link.dep.subs) {
      computed.flags |= EffectFlags.TRACKING | EffectFlags.DIRTY
      for (let l = computed.deps; l; l = l.nextDep) {
        addSub(l)
      }
    }

    // 加入 dep.subs 链表尾部
    const currentTail = link.dep.subs
    if (currentTail !== link) {
      link.prevSub = currentTail
      if (currentTail) currentTail.nextSub = link
    }

    if (__DEV__ && link.dep.subsHead === undefined) {
      link.dep.subsHead = link
    }

    link.dep.subs = link
  }
}

// ============================================================
// targetMap —— 全局依赖映射表
// ============================================================

/**
 * 键到 Dep 的映射
 *
 * Map<key, Dep>：同一个对象的不同属性对应不同的 Dep。
 */
type KeyToDepMap = Map<any, Dep>

/**
 * 全局依赖映射表
 *
 * WeakMap<target, Map<key, Dep>>
 *   └─ 每个 target → 一个 Map
 *          └─ 每个 key → 一个 Dep 实例
 *
 * 使用 WeakMap 而非 Map 存储 target，确保对象被垃圾回收时依赖关系也自动清除。
 */
export const targetMap: WeakMap<object, KeyToDepMap> = new WeakMap()

// ============================================================
// 迭代键符号
// ============================================================

/**
 * ITERATE_KEY —— 对象遍历依赖的 key
 *
 * 当使用 for...in / Object.keys 等遍历对象时，
 * 追踪的 key 不是任何真实属性名，而是此 ITERATE_KEY。
 *
 * 为什么需要单独的 key：
 * - 添加/删除属性需要通知"遍历"操作
 * - 如果只追踪实际存在的属性，新增属性时无法通知
 */
export const ITERATE_KEY: unique symbol = Symbol(
  __DEV__ ? 'Object iterate' : '',
)

/**
 * MAP_KEY_ITERATE_KEY —— Map key 遍历依赖的 key
 *
 * Map 的 .keys() 和 Map 本身的迭代追踪此 key。
 * 区别于 ITERATE_KEY：Map 的 SET 操作不需要触发 ITERATE_KEY，
 * 但 ADD/DELETE 需要触发 MAP_KEY_ITERATE_KEY。
 */
export const MAP_KEY_ITERATE_KEY: unique symbol = Symbol(
  __DEV__ ? 'Map keys iterate' : '',
)

/**
 * ARRAY_ITERATE_KEY —— 数组遍历依赖的 key
 *
 * 当遍历数组（for...of、.map、.forEach 等）时追踪此 key。
 * 数组长度变化、索引赋值时触发此 key 的依赖。
 */
export const ARRAY_ITERATE_KEY: unique symbol = Symbol(
  __DEV__ ? 'Array iterate' : '',
)

// ============================================================
// track / trigger 公共函数
// ============================================================

/**
 * 追踪响应式属性的访问
 *
 * 在 proxy getter 中被调用。三步操作：
 * 1. 从 targetMap 获取/创建 target 对应的 depsMap
 * 2. 从 depsMap 获取/创建 key 对应的 Dep
 * 3. 调用 dep.track() 建立当前 activeSub 的连接
 *
 * @param target - 被访问的响应式对象
 * @param type   - 访问类型（GET / HAS / ITERATE）
 * @param key    - 被访问的属性
 */
export function track(target: object, type: TrackOpTypes, key: unknown): void {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = new Dep()))
      dep.map = depsMap
      dep.key = key
    }
    if (__DEV__) {
      dep.track({
        target,
        type,
        key,
      })
    } else {
      dep.track()
    }
  }
}

/**
 * 触发响应式更新
 *
 * 在 proxy setter/deleteProperty 等中被调用。
 * 根据操作类型（SET/ADD/DELETE/CLEAR）通知不同的依赖集合。
 *
 * ### 通知策略（非 CLEAR）
 * 1. 通知目标 key 的直接依赖
 * 2. 如果是数组索引变更 → 通知 ARRAY_ITERATE_KEY
 * 3. ADD 操作 → 通知 ITERATE_KEY（遍历器）和 MAP_KEY_ITERATE_KEY
 * 4. DELETE 操作 → 通知 ITERATE_KEY（遍历器）
 * 5. 数组 ADD → 通知 'length'（长度变化）
 * 6. SET 数组 length → 通知被删除索引和 ARRAY_ITERATE_KEY
 *
 * @param target   - 被修改的响应式对象
 * @param type     - 操作类型
 * @param key      - 被修改的属性
 * @param newValue - 新值
 * @param oldValue - 旧值
 * @param oldTarget - CLEAR 操作时的旧集合（DEBUG 用）
 */
export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>,
): void {
  const depsMap = targetMap.get(target)

  if (!depsMap) {
    // 从未被追踪过 → 只需递增 globalVersion（computed 快速路径依赖此值）
    globalVersion++
    return
  }

  const run = (dep: Dep | undefined) => {
    if (dep) {
      if (__DEV__) {
        dep.trigger({
          target,
          type,
          key,
          newValue,
          oldValue,
          oldTarget,
        })
      } else {
        dep.trigger()
      }
    }
  }

  startBatch()

  if (type === TriggerOpTypes.CLEAR) {
    /**
     * CLEAR 操作：通知所有 key 的依赖
     *
     * Map.clear() / Set.clear() 清除所有条目，
     * 需要触发所有追踪此对象的 effect。
     */
    depsMap.forEach(run)
  } else {
    const targetIsArray = isArray(target)
    const isArrayIndex = targetIsArray && isIntegerKey(key)

    if (targetIsArray && key === 'length') {
      /**
       * 数组 length 变更
       *
       * 需要通知：
       * 1. 'length' key 的直接依赖
       * 2. 所有被截断的索引（key >= newLength）
       * 3. ARRAY_ITERATE_KEY（遍历器）
       */
      const newLength = Number(newValue)
      depsMap.forEach((dep, key) => {
        if (
          key === 'length' ||
          key === ARRAY_ITERATE_KEY ||
          (!isSymbol(key) && key >= newLength)
        ) {
          run(dep)
        }
      })
    } else {
      // SET / ADD / DELETE 操作

      // 1. 通知目标 key 的直接依赖
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key))
      }

      // 2. 数组索引变更 → 通知 ARRAY_ITERATE_KEY
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY))
      }

      // 3. 根据操作类型通知额外的迭代依赖
      switch (type) {
        case TriggerOpTypes.ADD:
          if (!targetIsArray) {
            // 对象/Map/Set 新增属性 → 通知 ITERATE_KEY
            run(depsMap.get(ITERATE_KEY))
            if (isMap(target)) {
              // Map 新增 key → 通知 MAP_KEY_ITERATE_KEY（keys() 遍历）
              run(depsMap.get(MAP_KEY_ITERATE_KEY))
            }
          } else if (isArrayIndex) {
            // 数组新增索引 → 通知 'length'（长度变了）
            run(depsMap.get('length'))
          }
          break

        case TriggerOpTypes.DELETE:
          if (!targetIsArray) {
            // 对象/Map/Set 删除属性 → 通知 ITERATE_KEY
            run(depsMap.get(ITERATE_KEY))
            if (isMap(target)) {
              // Map 删除 key → 通知 MAP_KEY_ITERATE_KEY
              run(depsMap.get(MAP_KEY_ITERATE_KEY))
            }
          }
          break

        case TriggerOpTypes.SET:
          if (isMap(target)) {
            // Map.SET 虽然不增删 key，但值变化也通知 ITERATE_KEY
            run(depsMap.get(ITERATE_KEY))
          }
          break
      }
    }
  }

  endBatch()
}

/**
 * 从响应式对象获取指定属性的 Dep
 *
 * 用于 ObjectRefImpl（toRef 的实现）获取原始对象的 Dep。
 * 不创建新的 Dep——只返回已经存在的。
 */
export function getDepFromReactive(
  object: any,
  key: string | number | symbol,
): Dep | undefined {
  const depMap = targetMap.get(object)
  return depMap && depMap.get(key)
}
