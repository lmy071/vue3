/**
 * ref.ts —— Ref 响应式引用
 *
 * ## 功能概述
 * Ref 是 Vue 3 响应式系统的基础类型，用于包装原始值使其变为响应式。
 * 通过 `.value` 读取和写入，Vue 模板中自动解包。
 *
 * ## Ref 类型体系
 * ```
 * Ref<T>                    ← ref() 创建的普通 ref
 * ShallowRef<T>             ← shallowRef() 创建，仅 .value 赋值触发更新
 * CustomRefImpl<T>          ← customRef() 创建，自定义 track/trigger 逻辑
 * ObjectRefImpl<T, K>       ← toRef(obj, key) 创建，与源对象属性同步
 * GetterRefImpl<T>          ← toRef(() => value) 创建，只读 getter ref
 * ```
 *
 * ## Ref 在 reactive 中的解包
 * 当 ref 作为 reactive 对象的属性时，通过 `.value` 自动解包。
 * 例外：数组 + 整数索引不解包（保持数组原生行为）。
 */

import {
  type IfAny,
  hasChanged,
  isArray,
  isFunction,
  isIntegerKey,
  isObject,
  isSymbol,
} from '@vue/shared'
import { Dep, getDepFromReactive } from './dep'
import {
  type Builtin,
  type ShallowReactiveBrand,
  type Target,
  isProxy,
  isReactive,
  isReadonly,
  isShallow,
  toRaw,
  toReactive,
} from './reactive'
import type { ComputedRef, WritableComputedRef } from './computed'
import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'
import { warn } from './warning'

/** Ref 的类型标记 Symbol（仅在 d.ts 中可见，IDE 不显示） */
declare const RefSymbol: unique symbol
export declare const RawSymbol: unique symbol

// ============================================================
// Ref 接口
// ============================================================

/**
 * Ref 接口
 *
 * 定义 ref 的形状：.value 的 getter/setter + RefSymbol 标记。
 * 模板中 ref 被自动解包，不需要 .value。
 */
export interface Ref<T = any, S = T> {
  get value(): T
  set value(_: S)
  /**
   * 类型区分标记。在公共 d.ts 中可见但不显示在 IDE 自动补全中。
   */
  [RefSymbol]: true
}

// ============================================================
// isRef
// ============================================================

/**
 * isRef(value)
 *
 * 检查值是否为 ref 对象。
 *
 * @param r - 要检查的值
 * @see https://vuejs.org/api/reactivity-utilities.html#isref
 */
export function isRef<T>(r: Ref<T> | unknown): r is Ref<T>
/*@__NO_SIDE_EFFECTS__*/
export function isRef(r: any): r is Ref {
  return r ? r[ReactiveFlags.IS_REF] === true : false
}

// ============================================================
// ref
// ============================================================

/**
 * ref(value)
 *
 * 创建响应式引用，返回一个带有 `.value` 属性的对象。
 *
 * ### 内部处理
 * - 如果 value 是对象 → 内部使用 reactive(value)
 * - 如果 value 是原始值 → 直接存储，通过 getter/setter 追踪
 * - 如果 value 已经是 ref → 直接返回（不重复包装）
 *
 * @param value - 初始值
 * @see https://vuejs.org/api/reactivity-core.html#ref
 */
export function ref<T>(
  value: T,
): [T] extends [Ref] ? IfAny<T, Ref<T>, T> : Ref<UnwrapRef<T>, UnwrapRef<T> | T>
export function ref<T = any>(): Ref<T | undefined>
/*@__NO_SIDE_EFFECTS__*/
export function ref(value?: unknown) {
  return createRef(value, false)
}

// ============================================================
// shallowRef
// ============================================================

declare const ShallowRefMarker: unique symbol

export type ShallowRef<T = any, S = T> = Ref<T, S> & {
  [ShallowRefMarker]?: true
}

/**
 * shallowRef(value)
 *
 * ref 的浅层版本。
 *
 * ### 与普通 ref 的区别
 * - `.value` 赋值触发更新（整个引用替换）
 * - `.value` 的嵌套属性修改不触发更新
 * - 不会自动深层代理对象
 *
 * ```js
 * const state = shallowRef({ count: 1 })
 * state.value.count = 2   // 不触发更新
 * state.value = { count: 2 }  // 触发更新
 * ```
 *
 * @param value - 初始值
 * @see https://vuejs.org/api/reactivity-advanced.html#shallowref
 */
export function shallowRef<T>(
  value: T,
): Ref extends T
  ? T extends Ref
    ? IfAny<T, ShallowRef<T>, T>
    : ShallowRef<T>
  : ShallowRef<T>
export function shallowRef<T = any>(): ShallowRef<T | undefined>
/*@__NO_SIDE_EFFECTS__*/
export function shallowRef(value?: unknown) {
  return createRef(value, true)
}

/**
 * createRef —— ref 和 shallowRef 的共享工厂
 *
 * 如果已经是 ref 则直接返回（避免重复包装）。
 */
function createRef(rawValue: unknown, shallow: boolean) {
  if (isRef(rawValue)) {
    return rawValue
  }
  return new RefImpl(rawValue, shallow)
}

// ============================================================
// RefImpl —— ref 的核心实现类
// ============================================================

/**
 * RefImpl —— Ref 的核心实现
 *
 * 内部维护两个值：
 * - `_rawValue`：原始值（用于比较变化）
 * - `_value`：响应式值（浅层模式 = 原值，深层模式 = reactive(value)）
 *
 * 持有自己的 Dep 实例来追踪订阅者。
 *
 * @internal
 */
class RefImpl<T = any> {
  /** 对外暴露的响应式值 */
  _value: T

  /** 原始值（比较变化用）；非浅层 ref 填入值时会 toRaw 脱壳 */
  private _rawValue: T

  /** 自己的依赖收集器 */
  dep: Dep = new Dep()

  /** 标记为 Ref */
  public readonly [ReactiveFlags.IS_REF] = true

  /** 是否浅层 ref */
  public readonly [ReactiveFlags.IS_SHALLOW]: boolean = false

  constructor(value: T, isShallow: boolean) {
    /**
     * _rawValue：区分浅层/非浅层
     * - 浅层：直接存储（不对值做任何处理）
     * - 非浅层：toRaw(value) 脱壳（如果 value 已经是响应式对象）
     *
     * _value：区分浅层/非浅层
     * - 浅层：直接存储
     * - 非浅层：toReactive(value) 深层代理（对象 → reactive，非对象 → 原值）
     */
    this._rawValue = isShallow ? value : toRaw(value)
    this._value = isShallow ? value : toReactive(value)
    this[ReactiveFlags.IS_SHALLOW] = isShallow
  }

  /**
   * get value() —— 读取值
   *
   * 建立依赖追踪（track），然后返回缓存的 _value。
   */
  get value() {
    if (__DEV__) {
      this.dep.track({
        target: this,
        type: TrackOpTypes.GET,
        key: 'value',
      })
    } else {
      this.dep.track()
    }
    return this._value
  }

  /**
   * set value() —— 设置值
   *
   * ### 处理流程
   * 1. 判断是否使用直接值（浅层 / 浅层值 / 只读值 → 直接用，不 toRaw）
   * 2. hasChanged 比较新旧值
   * 3. 更新 _rawValue 和 _value
   * 4. dep.trigger() 通知订阅者
   *
   * ### useDirectValue 条件
   * - shallow ref：值原样存储
   * - 新值是 shallow 响应式对象：直接存储
   * - 新值是 readonly 对象：直接存储（readonly 已受保护）
   */
  set value(newValue) {
    const oldValue = this._rawValue
    const useDirectValue =
      this[ReactiveFlags.IS_SHALLOW] ||
      isShallow(newValue) ||
      isReadonly(newValue)

    newValue = useDirectValue ? newValue : toRaw(newValue)

    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue
      // 非浅层下 toReactive 深层代理
      this._value = useDirectValue ? newValue : toReactive(newValue)

      if (__DEV__) {
        this.dep.trigger({
          target: this,
          type: TriggerOpTypes.SET,
          key: 'value',
          newValue,
          oldValue,
        })
      } else {
        this.dep.trigger()
      }
    }
  }
}

// ============================================================
// triggerRef
// ============================================================

/**
 * triggerRef(ref)
 *
 * 强制触发依赖 shallowRef 的 effect。
 * 通常用于在修改 shallowRef 的深层属性后手动触发更新。
 *
 * ```js
 * const shallow = shallowRef({ greet: 'Hello' })
 * shallow.value.greet = 'Hi'  // 不触发更新
 * triggerRef(shallow)          // 手动触发
 * ```
 *
 * @param ref - 要触发的 ref
 * @see https://vuejs.org/api/reactivity-advanced.html#triggerref
 */
export function triggerRef(ref: Ref): void {
  // 兼容 ObjectRefImpl（也有 dep 属性）
  if ((ref as unknown as RefImpl).dep) {
    if (__DEV__) {
      ;(ref as unknown as RefImpl).dep.trigger({
        target: ref,
        type: TriggerOpTypes.SET,
        key: 'value',
        newValue: (ref as unknown as RefImpl)._value,
      })
    } else {
      ;(ref as unknown as RefImpl).dep.trigger()
    }
  }
}

// ============================================================
// 工具类型：MaybeRef / MaybeRefOrGetter
// ============================================================

export type MaybeRef<T = any> =
  | T
  | Ref<T>
  | ShallowRef<T>
  | WritableComputedRef<T>

export type MaybeRefOrGetter<T = any> = MaybeRef<T> | ComputedRef<T> | (() => T)

// ============================================================
// unref / toValue
// ============================================================

/**
 * unref(ref)
 *
 * 如果参数是 ref 则返回 .value，否则直接返回。
 * 等价于 `isRef(val) ? val.value : val`。
 *
 * @param ref - Ref 或普通值
 * @see https://vuejs.org/api/reactivity-utilities.html#unref
 */
export function unref<T>(ref: MaybeRef<T> | ComputedRef<T>): T {
  return isRef(ref) ? ref.value : ref
}

/**
 * toValue(source)
 *
 * 与 unref 类似，但额外处理 getter 函数。
 * 如果参数是 getter，调用后返回结果。
 *
 * ```js
 * toValue(1)         // 1
 * toValue(ref(1))    // 1
 * toValue(() => 1)   // 1
 * ```
 *
 * @param source - getter、已有 ref 或非函数值
 * @see https://vuejs.org/api/reactivity-utilities.html#tovalue
 */
export function toValue<T>(source: MaybeRefOrGetter<T>): T {
  return isFunction(source) ? source() : unref(source)
}

// ============================================================
// proxyRefs —— 对象属性 ref 自动解包
// ============================================================

/**
 * shallowUnwrapHandlers —— proxyRefs 的 Proxy Handler
 *
 * get：如果值是 ref → 自动解包（unref）
 * set：如果旧值是 ref 且新值不是 → 写入旧 ref.value
 *
 * 用于 Vue 组件的 setup 返回值自动解包。
 */
const shallowUnwrapHandlers: ProxyHandler<any> = {
  get: (target, key, receiver) =>
    key === ReactiveFlags.RAW
      ? target
      : unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key]
    /**
     * Ref 穿透：如果旧值是 ref 且新值不是 ref，
     * 自动写入 ref.value 而不是替换 ref 对象。
     * 这是 Vue 3 模板中 ref 自动解包的关键机制。
     */
    if (isRef(oldValue) && !isRef(value)) {
      oldValue.value = value
      return true
    } else {
      return Reflect.set(target, key, value, receiver)
    }
  },
}

/**
 * proxyRefs(objectWithRefs)
 *
 * 返回一个 Proxy，其中的 ref 属性自动解包。
 * 如果对象已经是 reactive，直接返回（reactive 已有 ref 解包行为）。
 *
 * @param objectWithRefs - 包含 ref 的对象
 */
export function proxyRefs<T extends object>(
  objectWithRefs: T,
): ShallowUnwrapRef<T> {
  return isReactive(objectWithRefs)
    ? (objectWithRefs as ShallowUnwrapRef<T>)
    : new Proxy(objectWithRefs, shallowUnwrapHandlers)
}

// ============================================================
// customRef
// ============================================================

export type CustomRefFactory<T, S = T> = (
  track: () => void,
  trigger: () => void,
) => {
  get: () => T
  set: (value: S) => void
}

/**
 * CustomRefImpl —— 自定义 ref 的实现类
 *
 * 持有自己的 Dep 实例，将 dep.track 和 dep.trigger 传给工厂函数。
 * 开发者完全控制何时追踪依赖、何时触发更新。
 */
class CustomRefImpl<T, S = T> {
  public dep: Dep

  private readonly _get: ReturnType<CustomRefFactory<T, S>>['get']
  private readonly _set: ReturnType<CustomRefFactory<T, S>>['set']

  public readonly [ReactiveFlags.IS_REF] = true

  public _value: T = undefined!

  constructor(factory: CustomRefFactory<T, S>) {
    const dep = (this.dep = new Dep())
    // 将 dep.track 和 dep.trigger 传给工厂函数
    const { get, set } = factory(dep.track.bind(dep), dep.trigger.bind(dep))
    this._get = get
    this._set = set
  }

  get value(): T {
    return (this._value = this._get())
  }

  set value(newVal: S) {
    this._set(newVal)
  }
}

/**
 * customRef(factory)
 *
 * 创建自定义 ref，通过 factory(track, trigger) 显式控制依赖追踪和更新触发。
 *
 * @param factory - 接收 track 和 trigger 回调的工厂函数
 * @see https://vuejs.org/api/reactivity-advanced.html#customref
 */
export function customRef<T, S = T>(
  factory: CustomRefFactory<T, S>,
): Ref<T, S> {
  return new CustomRefImpl(factory) as any
}

// ============================================================
// toRefs
// ============================================================

export type ToRefs<T = any> = {
  [K in keyof T]: ToRef<T[K]>
}

type ArrayStringKey<T> = T extends readonly any[]
  ? number extends T['length']
    ? `${number}`
    : never
  : never

type ToRefKey<T> = keyof T | ArrayStringKey<T>

type ToRefValue<T extends object, K extends ToRefKey<T>> = K extends keyof T
  ? T[K]
  : T extends readonly (infer V)[]
    ? K extends ArrayStringKey<T>
      ? V
      : never
    : never

/**
 * toRefs(object)
 *
 * 将响应式对象的每个属性转为独立的 ref。
 * 返回 ref 与原对象属性保持双向同步。
 *
 * 典型用途：解构 reactive 对象时保持响应性。
 * ```js
 * const state = reactive({ x: 1, y: 2 })
 * const { x, y } = toRefs(state) // x 和 y 现在是 ref
 * ```
 *
 * @param object - 响应式对象
 * @see https://vuejs.org/api/reactivity-utilities.html#torefs
 */
/*@__NO_SIDE_EFFECTS__*/
export function toRefs<T extends object>(object: T): ToRefs<T> {
  if (__DEV__ && !isProxy(object)) {
    warn(`toRefs() expects a reactive object but received a plain one.`)
  }
  const ret: any = isArray(object) ? new Array(object.length) : {}
  for (const key in object) {
    ret[key] = propertyToRef(object, key)
  }
  return ret
}

// ============================================================
// ObjectRefImpl —— toRef(object, key) 的实现
// ============================================================

/**
 * ObjectRefImpl —— 与源对象属性双向同步的 ref
 *
 * 通过 getDepFromReactive 获取源对象的 Dep，实现真正的双向绑定：
 * - 读取时 → 追踪源对象的依赖
 * - 写入时 → 直接修改源对象（通过 proxy setter 触发更新）
 *
 * ### _shallow 判断
 * 循环遍历 proxy 层级（通过 RAW 标记），检查是否有浅层 proxy。
 * 浅层 proxy 不自动解包 ref，所以 ObjectRefImpl 的 value 也需要解包。
 */
class ObjectRefImpl<T extends object, K extends keyof T> {
  public readonly [ReactiveFlags.IS_REF] = true
  public _value: T[K] = undefined!

  private readonly _raw: T
  private readonly _key: K
  private readonly _shallow: boolean

  constructor(
    private readonly _object: T,
    key: K,
    private readonly _defaultValue?: T[K],
  ) {
    this._key = (isSymbol(key) ? key : String(key)) as K
    this._raw = toRaw(_object)

    let shallow = true
    let obj = _object

    // 数组 + 整数 key → ref 不解包（保持数组原生行为）
    if (!isArray(_object) || isSymbol(this._key) || !isIntegerKey(this._key)) {
      // 从上到下遍历 proxy 链检查是否有 shallow
      do {
        shallow = !isProxy(obj) || isShallow(obj)
      } while (shallow && (obj = (obj as Target)[ReactiveFlags.RAW]))
    }

    this._shallow = shallow
  }

  get value() {
    let val = this._object[this._key]
    if (this._shallow) {
      val = unref(val) // 浅层模式下显式解包 ref
    }
    return (this._value = val === undefined ? this._defaultValue! : val)
  }

  set value(newVal) {
    // 浅层模式 + 源属性是 ref：穿透写入 ref.value
    if (this._shallow && isRef(this._raw[this._key])) {
      const nestedRef = this._object[this._key]
      if (isRef(nestedRef)) {
        nestedRef.value = newVal
        return
      }
    }

    this._object[this._key] = newVal
  }

  get dep(): Dep | undefined {
    return getDepFromReactive(this._raw, this._key)
  }
}

// ============================================================
// GetterRefImpl —— toRef(getter) 的实现
// ============================================================

/**
 * GetterRefImpl —— 只读 getter ref
 *
 * toRef(() => props.foo) 创建。
 * 每次读取 .value 时调用 getter。只读，不接受写入。
 */
class GetterRefImpl<T> {
  public readonly [ReactiveFlags.IS_REF] = true
  public readonly [ReactiveFlags.IS_READONLY] = true
  public _value: T = undefined!

  constructor(private readonly _getter: () => T) {}
  get value() {
    return (this._value = this._getter())
  }
}

export type ToRef<T> = IfAny<T, Ref<T>, [T] extends [Ref] ? T : Ref<T>>

// ============================================================
// toRef —— 多态 API
// ============================================================

/**
 * toRef(source, key?)
 *
 * 多态 API：根据参数不同创建不同类型的 ref。
 *
 * ### 三种调用方式
 * 1. `toRef(existingRef)` → 返回自身
 * 2. `toRef(() => value)` → GetterRefImpl（只读，每次读取调用 getter）
 * 3. `toRef(obj, 'key', defaultValue?)` → ObjectRefImpl（与源对象属性双向同步）
 * 4. `toRef(nonRefValue)` → ref(nonRefValue)（退化为普通 ref）
 *
 * @param source - 响应式对象 / getter / 现有 ref / 非 ref 值
 * @param [key]  - 属性名（与 source 组合使用）
 * @see https://vuejs.org/api/reactivity-utilities.html#toref
 */
export function toRef<T>(
  value: T,
): T extends () => infer R
  ? Readonly<Ref<R>>
  : T extends Ref
    ? T
    : Ref<UnwrapRef<T>>
export function toRef<T extends object, K extends ToRefKey<T>>(
  object: T,
  key: K,
): ToRef<ToRefValue<T, K>>
export function toRef<T extends object, K extends ToRefKey<T>>(
  object: T,
  key: K,
  defaultValue: ToRefValue<T, K>,
): ToRef<Exclude<ToRefValue<T, K>, undefined>>
/*@__NO_SIDE_EFFECTS__*/
export function toRef(
  source: Record<PropertyKey, any> | MaybeRef,
  key?: string | number | symbol,
  defaultValue?: unknown,
): Ref {
  if (isRef(source)) {
    return source
  } else if (isFunction(source)) {
    return new GetterRefImpl(source) as any
  } else if (isObject(source) && arguments.length > 1) {
    return propertyToRef(source, key!, defaultValue)
  } else {
    return ref(source)
  }
}

/** toRef 的 ObjectRefImpl 创建辅助函数 */
function propertyToRef(
  source: Record<PropertyKey, any>,
  key: string | number | symbol,
  defaultValue?: unknown,
) {
  return new ObjectRefImpl(source, key, defaultValue) as any
}

// ============================================================
// RefUnwrapBailTypes —— Ref 解包豁免类型
// ============================================================

/**
 * RefUnwrapBailTypes —— 扩展接口
 *
 * 供其他包声明应跳过 ref 解包的额外类型。
 * 例如 @vue/runtime-dom 可声明：
 * ```ts
 * declare module '@vue/reactivity' {
 *   export interface RefUnwrapBailTypes {
 *     runtimeDOMBailTypes: Node | Window
 *   }
 * }
 * ```
 */
export interface RefUnwrapBailTypes {}

// ============================================================
// 工具类型：ShallowUnwrapRef / DistributeRef / UnwrapRef
// ============================================================

/**
 * ShallowUnwrapRef<T>
 *
 * proxyRefs 返回的类型：浅层解包每层属性中的 ref。
 * ShallowReactiveBrand 类型不变（保持 brand 标记）。
 */
export type ShallowUnwrapRef<T> = T extends ShallowReactiveBrand
  ? T
  : {
      [K in keyof T]: DistributeRef<T[K]>
    }

type DistributeRef<T> = T extends Ref<infer V, unknown> ? V : T

/**
 * UnwrapRef<T>
 *
 * 深层解包 ref 的类型。
 * ShallowRef → 不解包（保持 V 类型）
 * 普通 Ref → 递归解包
 */
export type UnwrapRef<T> =
  T extends ShallowRef<infer V, unknown>
    ? V
    : T extends Ref<infer V, unknown>
      ? UnwrapRefSimple<V>
      : UnwrapRefSimple<T>

/**
 * UnwrapRefSimple<T>
 *
 * 递归解包 ref 的辅助类型。
 * 对内置类型/Ref/豁免类型/RawBrand/ShallowReactiveBrand → 不变。
 * 对 Map/Set/WeakMap/WeakSet → 递归解包元素。
 * 对普通对象 → 递归解包每个属性。
 */
export type UnwrapRefSimple<T> = T extends
  | Builtin
  | Ref
  | RefUnwrapBailTypes[keyof RefUnwrapBailTypes]
  | { [RawSymbol]?: true }
  ? T
  : T extends ShallowReactiveBrand
    ? T
    : T extends Map<infer K, infer V>
      ? Map<K, UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof Map<any, any>>>
      : T extends WeakMap<infer K, infer V>
        ? WeakMap<K, UnwrapRefSimple<V>> &
            UnwrapRef<Omit<T, keyof WeakMap<any, any>>>
        : T extends Set<infer V>
          ? Set<UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof Set<any>>>
          : T extends WeakSet<infer V>
            ? WeakSet<UnwrapRefSimple<V>> &
                UnwrapRef<Omit<T, keyof WeakSet<any>>>
            : T extends ReadonlyArray<any>
              ? { [K in keyof T]: UnwrapRefSimple<T[K]> }
              : T extends object
                ? {
                    [P in keyof T]: P extends symbol ? T[P] : UnwrapRef<T[P]>
                  }
                : T
