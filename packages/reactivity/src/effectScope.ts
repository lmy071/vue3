/**
 * effectScope.ts —— 副作用作用域
 *
 * ## 功能概述
 * EffectScope 提供了一个 API 来批量管理副作用（effect/watch/computed）的生命周期。
 * 创建 scope 后，在其中创建的所有副作用会被自动收集，当 scope.stop() 时一并销毁。
 *
 * ## 典型用途
 * - Vue 组件实例内部使用 EffectScope 管理组件的所有响应式副作用
 * - 组件销毁时，scope.stop() 自动清理所有 watcher、computed 和 render effect
 * - 开发者也可以通过 effectScope() API 手动创建独立的作用域
 *
 * ## detached 模式
 * 默认情况下，scope 会"附着"到父 scope（如组件 scope）。
 * 传入 detached: true 可创建"游离"scope——不被父 scope 管理，需要手动 stop。
 *
 * ## on/off 机制
 * 用于在异步场景中恢复 scope 上下文（如 `await` 之后），
 * 确保异步回调中的响应式操作仍关联到正确的 scope。
 * 详见 withAsyncContext 的编译器实现。
 */

import type { ReactiveEffect } from './effect'
import { warn } from './warning'

/**
 * 当前活跃的 EffectScope
 *
 * 全局单例。new EffectScope() 时会继承当前活跃 scope，
 * scope.run() 期间被设置为当前 scope，内部创建的所有 effect 自动注册到它。
 */
export let activeEffectScope: EffectScope | undefined

/**
 * EffectScope —— 副作用作用域类
 *
 * 本质是一个"容器"，收集在其中创建的所有 ReactiveEffect。
 * 提供了 pause/resume/stop 等批量操作能力。
 */
export class EffectScope {
  /**
   * 是否处于活跃状态
   * @internal
   */
  private _active = true

  /**
   * on/off 调用计数
   *
   * 用于异步恢复场景：on() 增加计数并激活此 scope，
   * off() 减少计数，归零时恢复之前的 scope 链。
   * @internal
   */
  private _on = 0

  /**
   * 收集在此 scope 内创建的 ReactiveEffect 实例
   * @internal
   */
  effects: ReactiveEffect[] = []

  /**
   * 清理函数列表（onScopeDispose 注册的）
   * @internal
   */
  cleanups: (() => void)[] = []

  /** 是否处于暂停状态 */
  private _isPaused = false

  /** 是否在不活跃时 run 发出警告 */
  private _warnOnRun = true

  /**
   * 父 scope（仅非 detached scope 有）
   * @internal
   */
  parent: EffectScope | undefined

  /**
   * 子 scope 列表（非 detached 的子 scope）
   * @internal
   */
  scopes: EffectScope[] | undefined

  /**
   * 在父 scope 的 scopes 数组中的索引（用于 O(1) 移除）
   * @internal
   */
  private index: number | undefined

  /** 标记自身为 raw，跳过 reactive() 转换 */
  readonly __v_skip = true

  /**
   * 构造函数
   *
   * @param detached - 是否创建游离 scope（不被父 scope 管理）
   *
   * 非 detached 的 scope 自动注册到 activeEffectScope 的子 scope 列表。
   * 如果父 scope 已停止，则子 scope 也必须标记为非活跃（避免孤儿 scope 泄漏）。
   */
  constructor(public detached = false) {
    if (!detached && activeEffectScope) {
      if (activeEffectScope.active) {
        // 正常情况：附着到父 scope
        this.parent = activeEffectScope
        this.index =
          (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
            this,
          ) - 1
      } else {
        /**
         * 父 scope 已停止 → 子 scope 不能成为活跃的游离 scope
         *
         * 发生在 <Suspense> 中组件因 top-level await 暂停后卸载的场景。
         * 此时活动的 scope 已停止，新创建的 scope 应标记为非活跃。
         */
        this._active = false
        this._warnOnRun = false
      }
    }
  }

  get active(): boolean {
    return this._active
  }

  /**
   * 暂停 scope 及其所有子 scope 和 effect
   *
   * 递归暂停整棵 scope 树。暂停期间 effect 不会被触发。
   * 触发请求会被缓存到 pausedQueueEffects 中。
   */
  pause(): void {
    if (this._active) {
      this._isPaused = true
      let i, l
      // 递归暂停子 scope
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].pause()
        }
      }
      // 暂停所有自己的 effect
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause()
      }
    }
  }

  /**
   * 恢复 scope 及其所有子 scope 和 effect
   *
   * 递归恢复整棵 scope 树。暂停期间缓存的触发请求将被执行。
   */
  resume(): void {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false
        let i, l
        // 递归恢复子 scope
        if (this.scopes) {
          for (i = 0, l = this.scopes.length; i < l; i++) {
            this.scopes[i].resume()
          }
        }
        // 恢复所有自己的 effect
        for (i = 0, l = this.effects.length; i < l; i++) {
          this.effects[i].resume()
        }
      }
    }
  }

  /**
   * 在此 scope 的上下文中运行一个函数
   *
   * 使用场景：Vue 组件 setup 函数在此 scope 的 run() 中执行。
   * 函数内部创建的所有 effect 自动注册到此 scope。
   *
   * @returns 函数返回值；scope 不活跃时返回 undefined
   */
  run<T>(fn: () => T): T | undefined {
    if (this._active) {
      const currentEffectScope = activeEffectScope
      try {
        activeEffectScope = this
        return fn()
      } finally {
        activeEffectScope = currentEffectScope
      }
    } else if (__DEV__ && this._warnOnRun) {
      warn(`cannot run an inactive effect scope.`)
    }
  }

  /**
   * 保存前一个 scope，用于 off() 恢复
   * @internal
   */
  prevScope: EffectScope | undefined

  /**
   * 激活此 scope（使其成为 activeEffectScope）
   *
   * 配合 off() 使用，用于异步恢复场景。
   * 支持嵌套调用——内部计数器 _on 确保嵌套的 on/off 正确配对。
   * @internal
   */
  on(): void {
    if (++this._on === 1) {
      // 首次 on：保存当前 scope 链
      this.prevScope = activeEffectScope
      activeEffectScope = this
    }
  }

  /**
   * 停用此 scope（恢复 prevScope）
   *
   * 与 on() 配对。当 _on 计数归零时恢复 scope 链。
   *
   * 复杂场景处理：withAsyncContext 会恢复当前异步延续的 scope，
   * 然后延迟清理。如果兄弟延续交错（A restore → B restore → A cleanup），
   * 需要从 scope 链中正确地解链，避免已停用的 scope 仍然全局可达。
   * @internal
   */
  off(): void {
    if (this._on > 0 && --this._on === 0) {
      // 快速路径：常见 LIFO 模式下，此 scope 仍在链顶部，直接恢复
      if (activeEffectScope === this) {
        activeEffectScope = this.prevScope
      } else {
        // 交错场景：从链中解链此 scope
        let current = activeEffectScope
        while (current) {
          if (current.prevScope === this) {
            current.prevScope = this.prevScope
            break
          }
          current = current.prevScope
        }
      }
      this.prevScope = undefined
    }
  }

  /**
   * 停止 scope（销毁所有子 effect）
   *
   * 执行顺序：
   * 1. 停止所有 effect
   * 2. 执行所有 cleanup 函数
   * 3. 递归停止所有子 scope
   * 4. 从父 scope 中移除自己（O(1) 交换到末尾再 pop）
   *
   * @param fromParent - 是否由父 scope.stop() 递归调用（避免重复移除以提升性能）
   */
  stop(fromParent?: boolean): void {
    if (this._active) {
      this._active = false

      let i, l

      // 1️⃣ 停止所有 effect
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop()
      }
      this.effects.length = 0

      // 2️⃣ 执行清理函数
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]()
      }
      this.cleanups.length = 0

      // 3️⃣ 递归停止子 scope
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true)
        }
        this.scopes.length = 0
      }

      // 4️⃣ 从父 scope 中移除自己
      // O(1) 技巧：将最后一个元素交换到当前位置
      if (!this.detached && this.parent && !fromParent) {
        const last = this.parent.scopes!.pop()
        if (last && last !== this) {
          this.parent.scopes![this.index!] = last
          last.index = this.index!
        }
      }

      this.parent = undefined
    }
  }
}

/**
 * 创建一个 EffectScope
 *
 * @param detached - 是否创建游离 scope
 * @see https://vuejs.org/api/reactivity-advanced.html#effectscope
 */
export function effectScope(detached?: boolean): EffectScope {
  return new EffectScope(detached)
}

/**
 * 获取当前活跃的 effect scope
 *
 * @see https://vuejs.org/api/reactivity-advanced.html#getcurrentscope
 */
export function getCurrentScope(): EffectScope | undefined {
  return activeEffectScope
}

/**
 * 在当前活跃的 effect scope 上注册一个清理回调
 *
 * 当 scope.stop() 时，所注册的清理函数会被调用。
 * 如果没有活跃的 scope，在开发环境下发出警告。
 *
 * @param fn - 清理回调
 * @param failSilently - true 时无活跃 scope 不报警告
 * @see https://vuejs.org/api/reactivity-advanced.html#onscopedispose
 */
export function onScopeDispose(fn: () => void, failSilently = false): void {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn)
  } else if (__DEV__ && !failSilently) {
    warn(
      `onScopeDispose() is called when there is no active effect scope` +
        ` to be associated with.`,
    )
  }
}
