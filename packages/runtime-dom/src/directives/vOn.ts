/**
 * @file vOn.ts
 * @description Vue 3 `v-on` 指令的运行时辅助函数。
 *
 * 本模块为 Vue 3 模板编译器生成的渲染函数提供两个核心工具函数：
 *   - `withModifiers`：处理事件修饰符（如 .stop、.prevent、.ctrl 等），
 *     在事件触发时按顺序执行守卫检查，只有全部通过才会调用用户回调。
 *   - `withKeys`：处理键盘事件修饰符（如 .enter、.esc 等），
 *     在事件触发时检查 event.key 是否匹配修饰符，匹配才调用用户回调。
 *
 * 设计要点：
 *   1. 修饰符守卫采用"否定式"判断——如果条件不满足则返回 true（中断调用链），
 *      这样可以在 for 循环中用 `if (guard()) return` 简洁地跳过不满足条件的事件。
 *   2. 使用缓存策略避免重复创建包装函数：同一个原始函数 + 同一组修饰符
 *      只会生成一个包装函数，后续复用缓存，减少 GC 压力。
 *   3. 兼容 Vue 2.x 的 keyCode 修饰符（`__COMPAT__` 条件编译）。
 */

import {
  type ComponentInternalInstance,
  DeprecationTypes,
  type Directive,
  type LegacyConfig,
  compatUtils,
  getCurrentInstance,
} from '@vue/runtime-core'
import { hyphenate, isArray } from '@vue/shared'

// ─────────────────────────────────────────────────────────────
// 1. 修饰符类型定义
// ─────────────────────────────────────────────────────────────

/**
 * 系统修饰键列表（与键盘上的物理修饰键对应）。
 * 用于 `exact` 修饰符的判断逻辑中：检查是否有未声明的系统修饰键被按下。
 */
const systemModifiers = ['ctrl', 'shift', 'alt', 'meta'] as const

/** 系统修饰键的联合类型，即 'ctrl' | 'shift' | 'alt' | 'meta' */
type SystemModifiers = (typeof systemModifiers)[number]

/** Vue 2.x 兼容的键名映射类型 */
type CompatModifiers = keyof typeof keyNames

/**
 * v-on 支持的所有修饰符联合类型。
 * 包含：系统修饰键 + 守卫修饰符 + Vue 2.x 兼容键名。
 */
export type VOnModifiers = SystemModifiers | ModifierGuards | CompatModifiers

/** 可能携带 key 属性的事件类型，用于类型断言 */
type KeyedEvent = KeyboardEvent | MouseEvent | TouchEvent

/**
 * 守卫修饰符类型。
 *
 * 每个修饰符对应一个"守卫函数"，返回值含义：
 *   - 返回 truthy → 条件不满足，应跳过（不调用用户回调）
 *   - 返回 falsy / void → 条件满足，继续检查下一个修饰符
 */
type ModifierGuards =
  | 'shift'  // 仅当 shift 键被按下时触发
  | 'ctrl'   // 仅当 ctrl 键被按下时触发
  | 'alt'    // 仅当 alt 键被按下时触发
  | 'meta'   // 仅当 meta 键（Mac: ⌘, Win: ⊞）被按下时触发
  | 'left'   // 仅当鼠标左键触发
  | 'right'  // 仅当鼠标右键触发
  | 'stop'   // 调用 event.stopPropagation()，阻止事件冒泡
  | 'prevent' // 调用 event.preventDefault()，阻止浏览器默认行为
  | 'self'   // 仅当 event.target === event.currentTarget 时触发（事件源是绑定元素本身）
  | 'middle' // 仅当鼠标中键触发
  | 'exact'  // 仅当精确声明了的修饰键被按下（不允许额外的修饰键）

/**
 * 修饰符 → 守卫函数的映射表。
 *
 * 核心设计：采用"否定式"判断，即"条件不满足时返回 truthy"。
 * 这样在 withModifiers 的循环中可以用 `if (guard(event)) return` 简洁地中断调用链。
 *
 * 示例解读：
 *   - `ctrl: (e) => !e.ctrlKey` — 如果用户没按 ctrl 键，返回 true（中断，不调用回调）
 *   - `self: (e) => e.target !== e.currentTarget` — 如果事件源不是绑定元素本身，返回 true（中断）
 *   - `stop: (e) => e.stopPropagation()` — stopPropagation 返回 void（falsy），不中断，继续执行
 */
const modifierGuards: Record<
  ModifierGuards,
  | ((e: Event) => void | boolean)
  | ((e: Event, modifiers: string[]) => void | boolean)
> = {
  // ── 事件传播控制 ──
  stop: (e: Event) => e.stopPropagation(),     // 阻止事件冒泡，返回 void（不中断调用链，后续修饰符继续检查）
  prevent: (e: Event) => e.preventDefault(),   // 阻止浏览器默认行为，返回 void（同上）
  self: (e: Event) => e.target !== e.currentTarget, // 事件源不是自身时返回 true → 中断

  // ── 系统修饰键守卫（否定式：修饰键未按下时返回 true → 中断） ──
  ctrl: (e: Event) => !(e as KeyedEvent).ctrlKey,   // ctrl 未按下 → 中断
  shift: (e: Event) => !(e as KeyedEvent).shiftKey,  // shift 未按下 → 中断
  alt: (e: Event) => !(e as KeyedEvent).altKey,     // alt 未按下 → 中断
  meta: (e: Event) => !(e as KeyedEvent).metaKey,   // meta 未按下 → 中断

  // ── 鼠标按键守卫（否定式：按键不匹配时返回 true → 中断） ──
  left: (e: Event) => 'button' in e && (e as MouseEvent).button !== 0,   // 非左键 → 中断
  middle: (e: Event) => 'button' in e && (e as MouseEvent).button !== 1, // 非中键 → 中断
  right: (e: Event) => 'button' in e && (e as MouseEvent).button !== 2,  // 非右键 → 中断

  // ── exact 修饰符（特殊：需要接收完整的修饰符列表进行对比） ──
  // 如果有"未在修饰符列表中声明"的系统修饰键被按下，则返回 true → 中断
  // 用途：@click.exact="fn" 表示只在没有任何修饰键时才触发
  //       @click.ctrl.exact="fn" 表示只在 ctrl 键按下（且无其他修饰键）时触发
  exact: (e, modifiers) =>
    systemModifiers.some(m => (e as any)[`${m}Key`] && !modifiers.includes(m)),
}

// ─────────────────────────────────────────────────────────────
// 2. withModifiers — 事件修饰符包装器
// ─────────────────────────────────────────────────────────────

/**
 * 为事件处理函数添加修饰符守卫。
 *
 * 模板中的 `@click.stop.prevent="handler"` 会被编译为：
 * ```ts
 * withModifiers(handler, ['stop', 'prevent'])
 * ```
 *
 * 运行时行为：
 * 1. 按 modifiers 数组的顺序依次执行对应的守卫函数
 * 2. 任一守卫返回 truthy → 中断循环，不调用原始回调
 * 3. 所有守卫通过 → 调用原始回调 fn(event, ...args)
 *
 * 缓存策略：
 * - 在 fn 上挂载 `_withMods` 对象作为缓存
 * - key 为修饰符的 `.` 连接字符串（如 "stop.prevent"）
 * - 同一个 fn + 同一组修饰符只创建一次包装函数
 *
 * @param fn - 原始事件处理函数，带有可选的 _withMods 缓存属性
 * @param modifiers - 修饰符数组，如 ['stop', 'prevent', 'ctrl']
 * @returns 包装后的事件处理函数，签名与 fn 相同
 *
 * @private 仅供编译器生成的代码使用，不属于公共 API
 */
export const withModifiers = <
  T extends (event: Event, ...args: unknown[]) => any,
>(
  fn: T & { _withMods?: { [key: string]: T } },
  modifiers: VOnModifiers[],
): T => {
  // 如果 fn 为 falsy（如空值），直接返回，不做任何包装
  if (!fn) return fn

  // 获取或初始化缓存对象（挂在 fn 实例上，生命周期与 fn 一致）
  const cache = fn._withMods || (fn._withMods = {})
  const cacheKey = modifiers.join('.') // 如 "stop.prevent.ctrl"

  // 命中缓存则直接返回，否则创建新的包装函数并写入缓存
  return (
    cache[cacheKey] ||
    (cache[cacheKey] = ((event, ...args) => {
      // 按声明顺序依次执行守卫检查
      for (let i = 0; i < modifiers.length; i++) {
        const guard = modifierGuards[modifiers[i] as ModifierGuards]
        // 守卫返回 truthy → 条件不满足，跳过回调调用
        if (guard && guard(event, modifiers)) return
      }
      // 所有守卫通过，调用原始回调
      return fn(event, ...args)
    }) as T)
  )
}

// ─────────────────────────────────────────────────────────────
// 3. Vue 2.x 兼容键名映射
// ─────────────────────────────────────────────────────────────

/**
 * Vue 2.x 键盘修饰符到标准 KeyboardEvent.key 值的映射。
 *
 * Vue 2 允许使用简写如 `@keyup.esc`、`@keyup.delete` 等，
 * 但浏览器 KeyboardEvent.key 返回的是全称（如 'Escape'、'Backspace'）。
 * 此映射表将 Vue 2 的简写转换为标准 key 值，供 withKeys 匹配使用。
 *
 * 注意：
 *   - 'delete' 映射到 'backspace'（而非 'delete'），这是 Vue 2 的历史行为
 *   - IE11 的 'spacebar' 和 'del' 兼容已被移除
 */
const keyNames: Record<
  'esc' | 'space' | 'up' | 'left' | 'right' | 'down' | 'delete',
  string
> = {
  esc: 'escape',      // Escape 键
  space: ' ',         // 空格键（key 值为单个空格字符）
  up: 'arrow-up',     // 上方向键
  left: 'arrow-left', // 左方向键
  right: 'arrow-right', // 右方向键
  down: 'arrow-down',   // 下方向键
  delete: 'backspace',  // 删除/退格键（Vue 2 的 .delete 对应 backspace）
}

// ─────────────────────────────────────────────────────────────
// 4. withKeys — 键盘按键修饰符包装器
// ─────────────────────────────────────────────────────────────

/**
 * 为键盘事件处理函数添加按键修饰符过滤。
 *
 * 模板中的 `@keyup.enter="handler"` 会被编译为：
 * ```ts
 * withKeys(handler, ['enter'])
 * ```
 *
 * 运行时行为：
 * 1. 检查事件对象是否有 `key` 属性（防御旧浏览器）
 * 2. 将 event.key 转为连字符形式后，与 modifiers 中的每个修饰符比较
 * 3. 同时检查 keyNames 映射表（Vue 2 简写兼容）
 * 4. 匹配成功 → 调用原始回调；匹配失败 → 静默忽略
 *
 * 缓存策略与 withModifiers 类似，使用 fn._withKeys 缓存。
 *
 * Vue 2.x 兼容逻辑（`__COMPAT__` 条件编译）：
 * 1. 支持 keyCode 数字修饰符（如 `@keyup.13`），已在 Vue 3 中废弃
 * 2. 支持 Vue 2 的 `config.keyCodes` 自定义键码映射
 *
 * @param fn - 原始键盘事件处理函数
 * @param modifiers - 按键修饰符数组，如 ['enter', 'esc']
 * @returns 包装后的键盘事件处理函数
 *
 * @private 仅供编译器生成的代码使用，不属于公共 API
 */
export const withKeys = <T extends (event: KeyboardEvent) => any>(
  fn: T & { _withKeys?: { [k: string]: T } },
  modifiers: string[],
): T => {
  // ── Vue 2.x 兼容：获取全局 keyCode 配置 ──
  let globalKeyCodes: LegacyConfig['keyCodes']
  let instance: ComponentInternalInstance | null = null
  if (__COMPAT__) {
    instance = getCurrentInstance()
    // 检查是否启用了 CONFIG_KEY_CODES 兼容特性
    if (
      compatUtils.isCompatEnabled(DeprecationTypes.CONFIG_KEY_CODES, instance)
    ) {
      if (instance) {
        // 从 appContext.config 中读取 Vue 2 的 keyCodes 配置
        globalKeyCodes = (instance.appContext.config as LegacyConfig).keyCodes
      }
    }
    // 开发环境下对数字 keyCode 修饰符发出废弃警告
    if (__DEV__ && modifiers.some(m => /^\d+$/.test(m))) {
      compatUtils.warnDeprecation(
        DeprecationTypes.V_ON_KEYCODE_MODIFIER,
        instance,
      )
    }
  }

  // ── 缓存逻辑 ──
  const cache: { [k: string]: T } = fn._withKeys || (fn._withKeys = {})
  const cacheKey = modifiers.join('.')

  return (
    cache[cacheKey] ||
    (cache[cacheKey] = (event => {
      // 防御：某些旧浏览器或合成事件可能没有 key 属性
      if (!('key' in event)) {
        return
      }

      // 将 event.key 转为连字符形式，如 'ArrowUp' → 'arrow-up'
      // 这样与模板中的 kebab-case 修饰符（如 @keyup.arrow-up）匹配
      const eventKey = hyphenate(event.key)

      // ── 主匹配逻辑：检查修饰符是否匹配 event.key ──
      // 两种匹配方式：
      //   1. 修饰符直接等于 eventKey（如 'enter' === 'enter'）
      //   2. 通过 keyNames 映射表匹配（如 'esc' → 'escape'）
      if (
        modifiers.some(
          k =>
            k === eventKey ||
            keyNames[k as unknown as CompatModifiers] === eventKey,
        )
      ) {
        return fn(event)
      }

      // ── Vue 2.x 兼容：keyCode 数字匹配 ──
      if (__COMPAT__) {
        const keyCode = String(event.keyCode)
        // 支持 Vue 2 的数字 keyCode 修饰符（如 @keyup.13）
        if (
          compatUtils.isCompatEnabled(
            DeprecationTypes.V_ON_KEYCODE_MODIFIER,
            instance,
          ) &&
          modifiers.some(mod => mod == keyCode)
        ) {
          return fn(event)
        }
        // 支持 Vue 2 的 config.keyCodes 自定义映射
        // 例如 Vue 2 中配置 Vue.config.keyCodes = { v: 86 }
        // 则 @keyup.v 会匹配 keyCode 为 86 的按键
        if (globalKeyCodes) {
          for (const mod of modifiers) {
            const codes = globalKeyCodes[mod]
            if (codes) {
              // keyCodes 可以是数组（一个修饰符对应多个 keyCode）
              const matches = isArray(codes)
                ? codes.some(code => String(code) === keyCode)
                : String(codes) === keyCode
              if (matches) {
                return fn(event)
              }
            }
          }
        }
      }
    }) as T)
  )
}

/**
 * v-on 指令的类型定义。
 * 用于在 TypeScript 中对 v-on 指令进行类型约束。
 */
export type VOnDirective = Directive<any, any, VOnModifiers>
