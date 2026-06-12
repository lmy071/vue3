/**
 * reactive.ts —— 响应式对象转换
 *
 * ## 功能概述
 * 提供 reactive / readonly / shallowReactive / shallowReadonly 四种响应式转换 API。
 * 所有 API 最终都调用 createReactiveObject，只是传入不同的 handler 和 proxyMap。
 *
 * ## 核心流程
 * ```
 * reactive(target)
 *   → createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap)
 *     → 校验检查（isObject / SKIP / isExtensible / 已有 proxy）
 *     → targetTypeMap → COMMON（普通对象/数组）vs COLLECTION（Map/Set/WeakMap/WeakSet）
 *     → new Proxy(target, handlers) → 存入 proxyMap → 返回 proxy
 * ```
 *
 * ## Proxy 缓存
 * 四种 proxyMap（WeakMap）确保同一个 target 只创建一个 proxy：
 * - reactiveMap → reactive 的缓存
 * - shallowReactiveMap → shallowReactive 的缓存
 * - readonlyMap → readonly 的缓存
 * - shallowReadonlyMap → shallowReadonly 的缓存
 *
 * ## 类型系统
 * - UnwrapNestedRefs：嵌套 Ref 解包的类型表示
 * - DeepReadonly：递归只读类型
 * - ShallowReactiveBrand：私有类标记，用于区分 shallowReactive 类型
 */

import { def, hasOwn, isObject, toRawType } from '@vue/shared'
import {
  mutableHandlers,
  readonlyHandlers,
  shallowReactiveHandlers,
  shallowReadonlyHandlers,
} from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers,
  shallowCollectionHandlers,
  shallowReadonlyCollectionHandlers,
} from './collectionHandlers'
import type { RawSymbol, Ref, UnwrapRefSimple } from './ref'
import { ReactiveFlags } from './constants'
import { warn } from './warning'

/**
 * Target 接口 —— 响应式目标对象
 *
 * 定义了对象上可以存在的内部标记属性。
 */
export interface Target {
  [ReactiveFlags.SKIP]?: boolean
  [ReactiveFlags.IS_REACTIVE]?: boolean
  [ReactiveFlags.IS_READONLY]?: boolean
  [ReactiveFlags.IS_SHALLOW]?: boolean
  [ReactiveFlags.RAW]?: any
}

// ============================================================
// Proxy 缓存（防止同一 target 创建多个 proxy）
// ============================================================

export const reactiveMap: WeakMap<Target, any> = new WeakMap<Target, any>()
export const shallowReactiveMap: WeakMap<Target, any> = new WeakMap<
  Target,
  any
>()
export const readonlyMap: WeakMap<Target, any> = new WeakMap<Target, any>()
export const shallowReadonlyMap: WeakMap<Target, any> = new WeakMap<
  Target,
  any
>()

/**
 * targetType —— 目标对象类型分类
 *
 * INVALID:  非对象类型（原始值、函数等）→ 不代理
 * COMMON:   普通对象、数组 → 使用 baseHandlers
 * COLLECTION: Map/Set/WeakMap/WeakSet → 使用 collectionHandlers
 */
enum TargetType {
  INVALID = 0,
  COMMON = 1,
  COLLECTION = 2,
}

function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION
    default:
      return TargetType.INVALID
  }
}

// ============================================================
// 类型定义
// ============================================================

/** UnwrapNestedRefs：对 Ref 不解包，对其他类型深层解包 */
export type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRefSimple<T>

declare const ReactiveMarkerSymbol: unique symbol

/** ReactiveMarker：用于区分类似 readonly any[] 和 reactive any[] */
export interface ReactiveMarker {
  [ReactiveMarkerSymbol]?: void
}

/** Reactive<T>：UnwrapNestedRefs + 数组 ReactiveMarker */
export type Reactive<T> = UnwrapNestedRefs<T> &
  (T extends readonly any[] ? ReactiveMarker : {})

// ============================================================
// 公共 API
// ============================================================

/**
 * reactive(target)
 *
 * 创建深层响应式代理。影响所有嵌套属性。
 * 响应式对象会自动解包内部的 ref 属性，同时保持响应性。
 *
 * ### 特殊处理
 * - 已经是 readonly → 直接返回（不再次包装）
 * - 已经是 proxy → 直接返回缓存的 proxy
 * - 非对象类型 → 直接返回原值
 * - markRaw 标记 → 不代理
 *
 * @param target - 源对象
 * @see https://vuejs.org/api/reactivity-core.html#reactive
 */
export function reactive<T extends object>(target: T): Reactive<T>
/*@__NO_SIDE_EFFECTS__*/
export function reactive(target: object) {
  // 如果已经是 readonly proxy，返回 readonly 版本
  if (isReadonly(target)) {
    return target
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap,
  )
}

/**
 * shallowReactiveBrand —— shallowReactive 的私有类标记
 *
 * 使用私有 class brand 而非属性标记，使得浅层响应式类型在
 * UnwrapRef 中保持可区分性，同时不泄漏到 keyof/索引访问类型中。
 */
declare class ShallowReactiveBrandClass {
  private __shallowReactiveBrand?: never
}
export type ShallowReactiveBrand = ShallowReactiveBrandClass

export type ShallowReactive<T> = T & ShallowReactiveBrand

/**
 * shallowReactive(target)
 *
 * 浅层版本：只有根级属性是响应式的。
 * 嵌套对象不会被自动代理，ref 属性也不会被解包。
 *
 * @param target - 源对象
 * @see https://vuejs.org/api/reactivity-advanced.html#shallowreactive
 */
/*@__NO_SIDE_EFFECTS__*/
export function shallowReactive<T extends object>(
  target: T,
): ShallowReactive<T> {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap,
  )
}

// ============================================================
// DeepReadonly 类型（递归只读映射）
// ============================================================

type Primitive = string | number | boolean | bigint | symbol | undefined | null
export type Builtin = Primitive | Function | Date | Error | RegExp

/**
 * DeepReadonly<T>
 *
 * 递归地将类型的所有属性标记为 readonly。
 * 特殊处理：
 * - 原始值/Builtin → 不变
 * - Map/Set/WeakMap/WeakSet → 递归只读
 * - Promise → 不递归（resolve 值可能尚未确定）
 * - Ref → Readonly<Ref>（保留 ref 接口）
 * - 普通对象 → 递归 readonly
 */
export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
      : T extends WeakMap<infer K, infer V>
        ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends Set<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends ReadonlySet<infer U>
            ? ReadonlySet<DeepReadonly<U>>
            : T extends WeakSet<infer U>
              ? WeakSet<DeepReadonly<U>>
              : T extends Promise<infer U>
                ? Promise<DeepReadonly<U>>
                : T extends Ref<infer U, unknown>
                  ? Readonly<Ref<DeepReadonly<U>>>
                  : T extends {}
                    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
                    : Readonly<T>

/**
 * readonly(target)
 *
 * 创建深层只读代理。任何嵌套属性访问也都是只读的。
 * 与 reactive 一样有 ref 解包行为——解包的值也会被转为只读。
 *
 * **注意**：修改原响应式对象仍会触发依赖 readonly 的 watcher。
 * 只读限制在"不能通过 readonly proxy 修改"，不是"原始值不能变"。
 *
 * @param target - 源对象（可以是 reactive 对象或普通对象）
 * @see https://vuejs.org/api/reactivity-core.html#readonly
 */
/*@__NO_SIDE_EFFECTS__*/
export function readonly<T extends object>(
  target: T,
): DeepReadonly<UnwrapNestedRefs<T>> {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap,
  )
}

/**
 * shallowReadonly(target)
 *
 * 浅层只读版本：仅根级属性是只读的。
 * 嵌套对象不会被自动转为只读，ref 属性不会解包。
 *
 * @param target - 源对象
 * @see https://vuejs.org/api/reactivity-advanced.html#shallowreadonly
 */
/*@__NO_SIDE_EFFECTS__*/
export function shallowReadonly<T extends object>(target: T): Readonly<T> {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap,
  )
}

// ============================================================
// createReactiveObject —— 核心代理创建函数
// ============================================================

/**
 * 创建响应式代理的核心函数
 *
 * ### 校验流程（按顺序）
 * 1. **isObject**：非对象直接返回原值（原始值不可代理）
 * 2. **RAW 检查**：已有 proxy → 返回自身
 *    - 例外：reactive 对象可以被 readonly 包装（生成新的 readonly proxy）
 * 3. **SKIP 检查**：markRaw 标记 → 跳过
 * 4. **isExtensible 检查**：不可扩展对象 → 跳过
 * 5. **proxyMap 缓存**：检查是否已有对应 proxy → 返回缓存
 * 6. **targetTypeMap**：判断类型（INVALID → 跳过, COMMON → baseHandlers, COLLECTION → collectionHandlers）
 * 7. **new Proxy**：创建 proxy 并存入缓存
 */
function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<Target, any>,
) {
  // 1. 非对象类型无法代理
  if (!isObject(target)) {
    if (__DEV__) {
      warn(
        `value cannot be made ${isReadonly ? 'readonly' : 'reactive'}: ${String(
          target,
        )}`,
      )
    }
    return target
  }

  // 2. 已经是 proxy（有 RAW 标记）
  //    例外：readonly(reactive(...)) 需要创建新的 readonly proxy
  if (
    target[ReactiveFlags.RAW] &&
    !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
  ) {
    return target
  }

  // 3. markRaw 标记 / 不可扩展 → 跳过
  if (target[ReactiveFlags.SKIP] || !Object.isExtensible(target)) {
    return target
  }

  // 4. 检查缓存
  const existingProxy = proxyMap.get(target)
  if (existingProxy) {
    return existingProxy
  }

  // 5. 判断类型
  const targetType = targetTypeMap(toRawType(target))
  if (targetType === TargetType.INVALID) {
    return target
  }

  // 6. 创建 Proxy
  const proxy = new Proxy(
    target,
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
  )
  proxyMap.set(target, proxy)
  return proxy
}

// ============================================================
// 类型检查函数
// ============================================================

/**
 * isReactive(value)
 *
 * 检查值是否为响应式代理。
 * - reactive() → true
 * - readonly(reactive()) → true（先穿透到 raw 再检查）
 * - ref({}).value → true（ref 内部 reactive 包装）
 * - shallowRef({}).value → false
 * - shallowReactive() → true
 *
 * @param value - 要检查的值
 * @see https://vuejs.org/api/reactivity-utilities.html#isreactive
 */
/*@__NO_SIDE_EFFECTS__*/
export function isReactive(value: unknown): boolean {
  // readonly 对象 → 先取 raw 再检查
  if (isReadonly(value)) {
    return isReactive((value as Target)[ReactiveFlags.RAW])
  }
  return !!(value && (value as Target)[ReactiveFlags.IS_REACTIVE])
}

/**
 * isReadonly(value)
 *
 * 检查值是否为只读代理。
 * readonly / shallowReadonly / 无 setter 的 computed ref 都是只读的。
 *
 * @param value - 要检查的值
 * @see https://vuejs.org/api/reactivity-utilities.html#isreadonly
 */
/*@__NO_SIDE_EFFECTS__*/
export function isReadonly(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_READONLY])
}

/**
 * isShallow(value)
 *
 * 检查值是否为浅层代理（shallowReactive 或 shallowReadonly 创建）。
 */
/*@__NO_SIDE_EFFECTS__*/
export function isShallow(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_SHALLOW])
}

/**
 * isProxy(value)
 *
 * 检查值是否是 reactive/readonly/shallowReactive/shallowReadonly 创建的 proxy。
 *
 * @param value - 要检查的值
 * @see https://vuejs.org/api/reactivity-utilities.html#isproxy
 */
/*@__NO_SIDE_EFFECTS__*/
export function isProxy(value: any): boolean {
  return value ? !!value[ReactiveFlags.RAW] : false
}

/**
 * toRaw(observed)
 *
 * 获取 Vue 创建的 proxy 的原始对象。
 * 可以递归穿透多层 proxy。
 *
 * **注意**：不建议持久化持有原始对象引用。谨慎使用。
 *
 * @param observed - 响应式对象
 * @see https://vuejs.org/api/reactivity-advanced.html#toraw
 */
/*@__NO_SIDE_EFFECTS__*/
export function toRaw<T>(observed: T): T {
  const raw = observed && (observed as Target)[ReactiveFlags.RAW]
  return raw ? toRaw(raw) : observed // 递归穿透多层
}

export type Raw<T> = T & { [RawSymbol]?: true }

/**
 * markRaw(value)
 *
 * 标记对象使其永远不会被转换为 proxy。
 * 使用 def() 添加不可枚举的 __v_skip 标记。
 *
 * 条件：对象必须是可扩展的且尚未有 SKIP 标记。
 *
 * @param value - 要标记的对象
 * @see https://vuejs.org/api/reactivity-advanced.html#markraw
 */
export function markRaw<T extends object>(value: T): Raw<T> {
  if (!hasOwn(value, ReactiveFlags.SKIP) && Object.isExtensible(value)) {
    def(value, ReactiveFlags.SKIP, true)
  }
  return value
}

/**
 * toReactive(value)
 *
 * 如果值是对象 → reactive(value)，否则直接返回。
 * 用于 ref 内部将非浅层的值转为响应式。
 */
export const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value

/**
 * toReadonly(value)
 *
 * 如果值是对象 → readonly(value)，否则直接返回。
 * 用于 ref 内部将非浅层的值转为只读。
 */
export const toReadonly = <T extends unknown>(value: T): DeepReadonly<T> =>
  isObject(value) ? readonly(value) : (value as DeepReadonly<T>)
