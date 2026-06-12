/**
 * constants.ts —— 响应式系统的常量与枚举定义
 *
 * 定义了三种核心枚举，贯穿整个响应式系统：
 * 1. TrackOpTypes    —— 依赖追踪的操作类型（读取了什么）
 * 2. TriggerOpTypes  —— 触发更新的操作类型（修改了什么）
 * 3. ReactiveFlags   —— 响应式对象的内部标记属性
 *
 * 使用字符串字面量而非数字，便于在 debugger 中识别事件类型。
 */

/**
 * TrackOpTypes —— 依赖追踪的操作类型
 *
 * 当 activeSub 存在时，每次读取响应式数据都会触发 track，
 * 操作类型告诉调试器和开发者"当前在读取什么"。
 */
export enum TrackOpTypes {
  /** 读取属性值（proxy getter） */
  GET = 'get',
  /** 检查属性是否存在（in 操作符、has 方法） */
  HAS = 'has',
  /** 迭代操作（for...in、for...of、Object.keys 等） */
  ITERATE = 'iterate',
}

/**
 * TriggerOpTypes —— 触发更新的操作类型
 *
 * 当响应式数据被修改时触发，决定哪些订阅者需要重新执行。
 * 不同类型的操作需要通知不同的"迭代"依赖。
 */
export enum TriggerOpTypes {
  /** 设置已有属性的值 */
  SET = 'set',
  /** 添加新属性（或数组索引赋值超过当前长度） */
  ADD = 'add',
  /** 删除属性 */
  DELETE = 'delete',
  /** 清空集合（Map.clear / Set.clear） */
  CLEAR = 'clear',
}

/**
 * ReactiveFlags —— 响应式对象的内部隐藏属性
 *
 * 以 `__v_` 为前缀的"魔法"属性，存储在 Proxy 目标对象上。
 * 它们不在 proxy handler 中被代理，而是用于系统内部状态查询：
 *
 * - 判断一个对象是否是响应式代理（isReactive / isReadonly）
 * - 获取原始对象（toRaw）
 * - 跳过响应式转换（markRaw）
 */
export enum ReactiveFlags {
  /**
   * 标记对象是否应该被跳过（不进行响应式转换）
   *
   * markRaw() 设置此标记为 true。
   * targetTypeMap 和 createReactiveObject 会检查此标记。
   */
  SKIP = '__v_skip',

  /** 标记对象是否是 reactive / shallowReactive 创建的 */
  IS_REACTIVE = '__v_isReactive',

  /** 标记对象是否是 readonly / shallowReadonly 创建的 */
  IS_READONLY = '__v_isReadonly',

  /** 标记对象是否是 shallow（浅层响应式） */
  IS_SHALLOW = '__v_isShallow',

  /**
   * 获取原始对象（未被 Proxy 包装的源对象）
   *
   * 在 baseHandlers 的 get 中特殊处理：验证 receiver 是有效的 proxy 后返回原始 target。
   * toRaw() 利用此标记递归获取最底层的原始对象。
   */
  RAW = '__v_raw',

  /** 标记对象是否是 Ref */
  IS_REF = '__v_isRef',
}
