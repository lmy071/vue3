/**
 * index.ts —— @vue/reactivity 包的公共 API 入口
 *
 * 本文件是 reactivity 包的导出聚合（barrel export），将所有模块的
 * 公开 API 集中重导出，供 runtime-core 和最终用户使用。
 *
 * ## 模块划分
 *
 * | 模块 | 主要导出 | 职责 |
 * |------|---------|------|
 * | ref.ts | ref, shallowRef, isRef, toRef, unref, proxyRefs, customRef, triggerRef | ref 响应式引用 |
 * | reactive.ts | reactive, readonly, isReactive, isReadonly, shallowReactive, shallowReadonly, markRaw, toRaw | 对象响应式转换 |
 * | computed.ts | computed, ComputedRef, WritableComputedRef | 计算属性 |
 * | effect.ts | effect, stop, ReactiveEffect, EffectFlags, onEffectCleanup, pauseTracking, enableTracking | 副作用系统 |
 * | dep.ts | track, trigger, ITERATE_KEY, ARRAY_ITERATE_KEY | 依赖追踪核心 |
 * | effectScope.ts | effectScope, EffectScope, getCurrentScope, onScopeDispose | 副作用作用域 |
 * | arrayInstrumentations.ts | reactiveReadArray, shallowReadArray | 数组响应式读取辅助 |
 * | constants.ts | TrackOpTypes, TriggerOpTypes, ReactiveFlags | 常量枚举 |
 * | watch.ts | watch, getCurrentWatcher, traverse, onWatcherCleanup | 侦听器 |
 */

export {
  ref,
  shallowRef,
  isRef,
  toRef,
  toValue,
  toRefs,
  unref,
  proxyRefs,
  customRef,
  triggerRef,
  type Ref,
  type MaybeRef,
  type MaybeRefOrGetter,
  type ToRef,
  type ToRefs,
  type UnwrapRef,
  type ShallowRef,
  type ShallowUnwrapRef,
  type RefUnwrapBailTypes,
  type CustomRefFactory,
} from './ref'
export {
  reactive,
  readonly,
  isReactive,
  isReadonly,
  isShallow,
  isProxy,
  shallowReactive,
  shallowReadonly,
  markRaw,
  toRaw,
  toReactive,
  toReadonly,
  type Raw,
  type DeepReadonly,
  type ShallowReactive,
  type UnwrapNestedRefs,
  type Reactive,
  type ReactiveMarker,
} from './reactive'
export {
  computed,
  type ComputedRef,
  type WritableComputedRef,
  type WritableComputedOptions,
  type ComputedGetter,
  type ComputedSetter,
  type ComputedRefImpl,
} from './computed'
export {
  effect,
  stop,
  enableTracking,
  pauseTracking,
  resetTracking,
  onEffectCleanup,
  ReactiveEffect,
  EffectFlags,
  type ReactiveEffectRunner,
  type ReactiveEffectOptions,
  type EffectScheduler,
  type DebuggerOptions,
  type DebuggerEvent,
  type DebuggerEventExtraInfo,
} from './effect'
export {
  trigger,
  track,
  ITERATE_KEY,
  ARRAY_ITERATE_KEY,
  MAP_KEY_ITERATE_KEY,
} from './dep'
export {
  effectScope,
  EffectScope,
  getCurrentScope,
  onScopeDispose,
} from './effectScope'
export { reactiveReadArray, shallowReadArray } from './arrayInstrumentations'
export { TrackOpTypes, TriggerOpTypes, ReactiveFlags } from './constants'
export {
  watch,
  getCurrentWatcher,
  traverse,
  onWatcherCleanup,
  WatchErrorCodes,
  type WatchOptions,
  type WatchScheduler,
  type WatchStopHandle,
  type WatchHandle,
  type WatchEffect,
  type WatchSource,
  type WatchCallback,
  type OnCleanup,
} from './watch'
