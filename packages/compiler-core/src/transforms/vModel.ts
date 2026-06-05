/**
 * vModel 转换器 —— v-model 指令的编译时转换
 *
 * ## 功能概述
 * v-model 是 Vue 的核心双向绑定指令。在编译阶段，v-model 被展开为：
 *
 * 1. **modelValue prop**：将数据作为 prop 传入组件/设置元素 value
 * 2. **onUpdate:modelValue 事件**：监听更新事件并回写数据
 *
 * ## 转换示例
 * ```html
 * <input v-model="text" />
 * <!-- 等价于 -->
 * <input :value="text" @input="text = $event.target.value" />
 *
 * <MyComp v-model="text" />
 * <!-- 等价于 -->
 * <MyComp :modelValue="text" @update:modelValue="text = $event" />
 *
 * <MyComp v-model:title="text" />
 * <!-- 等价于 -->
 * <MyComp :title="text" @update:title="text = $event" />
 * ```
 *
 * ## 设计要点
 * - 支持多种绑定类型：普通变量、ref、maybeRef
 * - 对 ref 绑定自动展开 .value 访问
 * - 修饰符通过 modelModifiers prop 传递给组件
 * - handler 可缓存优化（无闭包引用时）
 * - 检查 v-model 不能绑定到 props、const 等只读数据源
 */

import type { DirectiveTransform } from '../transform'
import {
  ConstantTypes,
  ElementTypes,
  type ExpressionNode,
  NodeTypes,
  type Property,
  createCompoundExpression,
  createObjectProperty,
  createSimpleExpression,
} from '../ast'
import { ErrorCodes, createCompilerError } from '../errors'
import {
  hasScopeRef,
  isMemberExpression,
  isSimpleIdentifier,
  isStaticExp,
} from '../utils'
import { IS_REF } from '../runtimeHelpers'
import { BindingTypes } from '../options'
import { camelize } from '@vue/shared'

/**
 * v-model 指令的转换器
 *
 * 将 v-model 展开为 prop + event 的组合：
 * - 默认：modelValue + onUpdate:modelValue
 * - 带参数：:arg + onUpdate:arg
 */
export const transformModel: DirectiveTransform = (dir, node, context) => {
  const { exp, arg } = dir

  // 没有表达式：编译错误
  if (!exp) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_NO_EXPRESSION, dir.loc),
    )
    return createTransformProps()
  }

  // 获取原始表达式字符串
  // 注意：v-model 指令始终由解析器生成（不是人工构造），所以 exp.loc.source 可靠
  const rawExp = exp.loc.source.trim()
  const expString =
    exp.type === NodeTypes.SIMPLE_EXPRESSION ? exp.content : rawExp

  // 获取绑定类型（来自 SFC <script setup> 分析）
  const bindingType = context.bindingMetadata[rawExp]

  /**
   * 校验 1：不能绑定到 props
   *
   * props 是只读的，v-model 需要写入能力。
   * 如果检测到绑定目标是 props 或 props 别名，报错。
   */
  if (
    bindingType === BindingTypes.PROPS ||
    bindingType === BindingTypes.PROPS_ALIASED
  ) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_ON_PROPS, exp.loc),
    )
    return createTransformProps()
  }

  /**
   * 校验 2：不能绑定到常量
   *
   * const bindings 是不可写的（literal const / setup const）。
   * v-model 需要能赋值的变量。
   */
  if (
    bindingType === BindingTypes.LITERAL_CONST ||
    bindingType === BindingTypes.SETUP_CONST
  ) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_ON_CONST, exp.loc),
    )
    return createTransformProps()
  }

  /**
   * 判断是否为可能的 ref 绑定
   *
   * 条件：
   * - 非浏览器构建
   * - inline 模式（<script setup> 内联）
   * - 绑定类型是 setup let / ref / maybeRef
   *
   * maybeRef 意味着需要在运行时通过 isRef() 判断是否需要 .value
   */
  const maybeRef =
    !__BROWSER__ &&
    context.inline &&
    (bindingType === BindingTypes.SETUP_LET ||
      bindingType === BindingTypes.SETUP_REF ||
      bindingType === BindingTypes.SETUP_MAYBE_REF)

  /**
   * 校验 3：表达式必须是有效的可赋值表达式
   *
   * 以下情况视为非法：
   * - 空表达式（已被 trim 后仍然为空）
   * - 不是成员表达式且不是可能的 ref 绑定
   *
   * 合法示例：
   *   user.name (成员表达式)
   *   ref binding (maybeRef)
   */
  if (!expString.trim() || (!isMemberExpression(exp, context) && !maybeRef)) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_MALFORMED_EXPRESSION, exp.loc),
    )
    return createTransformProps()
  }

  /**
   * 校验 4：不能绑定到作用域变量
   *
   * 如果表达式是简单的标识符，且在作用域内（如 v-for 的 item），
   * 不能作为 v-model 的绑定目标——作用域变量不能从外部赋值。
   */
  if (
    !__BROWSER__ &&
    context.prefixIdentifiers &&
    isSimpleIdentifier(expString) &&
    context.identifiers[expString]
  ) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_ON_SCOPE_VARIABLE, exp.loc),
    )
    return createTransformProps()
  }

  // ============================================================
  // 生成 prop 名和事件名
  // ============================================================

  // 有参数：用参数名；无参数：默认 "modelValue"
  const propName = arg ? arg : createSimpleExpression('modelValue', true)

  // 有参数：`onUpdate:argName`；无参数：`onUpdate:modelValue`
  const eventName = arg
    ? isStaticExp(arg)
      ? `onUpdate:${camelize(arg.content)}` // 静态：编译期确定
      : createCompoundExpression(['"onUpdate:" + ', arg]) // 动态：运行时拼接
    : `onUpdate:modelValue`

  // ============================================================
  // 生成赋值表达式
  // ============================================================

  let assignmentExp: ExpressionNode
  const eventArg = context.isTS ? `($event: any)` : `$event`

  if (maybeRef) {
    /**
     * Ref 绑定的赋值
     *
     * SETUP_REF（已知是 ref）：
     *   `$event => ((rawExp).value = $event)`
     *   直接通过 .value 写入
     *
     * SETUP_MAYBE_REF / SETUP_LET（可能是 ref）：
     *   `$event => (isRef(rawExp) ? (rawExp).value = $event : altAssignment)`
     *   运行时判断是否是 ref，是则写 .value，否则直接赋值
     *   - setup let: altAssignment = `rawExp = $event`
     *   - setup maybeRef: altAssignment = `null`（可能是 prop 等其他只读数据）
     */
    if (bindingType === BindingTypes.SETUP_REF) {
      // v-model 绑定到已知的 ref
      assignmentExp = createCompoundExpression([
        `${eventArg} => ((`,
        createSimpleExpression(rawExp, false, exp.loc),
        `).value = $event)`,
      ])
    } else {
      // v-model 绑定到可能是 ref 的变量（<script setup> inline 模式）
      // 需要在运行时检查绑定是否确实是 ref
      const altAssignment =
        bindingType === BindingTypes.SETUP_LET ? `${rawExp} = $event` : `null`
      assignmentExp = createCompoundExpression([
        `${eventArg} => (${context.helperString(IS_REF)}(${rawExp}) ? (`,
        createSimpleExpression(rawExp, false, exp.loc),
        `).value = $event : ${altAssignment})`,
      ])
    }
  } else {
    /**
     * 普通变量的赋值
     *
     * `$event => ((exp) = $event)`
     *
     * 双层括号包裹处理赋值表达式的优先级问题。
     */
    assignmentExp = createCompoundExpression([
      `${eventArg} => ((`,
      exp,
      `) = $event)`,
    ])
  }

  // ============================================================
  // 构建返回的 props
  // ============================================================

  const props = [
    // prop: modelValue / arg
    createObjectProperty(propName, dir.exp!),
    // event: onUpdate:modelValue / onUpdate:arg
    createObjectProperty(eventName, assignmentExp),
  ]

  /**
   * Handler 缓存优化
   *
   * 当 handler 不引用任何闭包变量时，可以使用 context.cache() 缓存，
   * 避免每次渲染创建新的函数引用，减少子组件不必要的更新。
   *
   * 缓存条件：
   * 1. 非浏览器构建
   * 2. 开启了前缀标识符模式
   * 3. 不在 v-once 作用域内
   * 4. 开启了 handler 缓存配置
   * 5. handler 不引用闭包变量
   */
  if (
    !__BROWSER__ &&
    context.prefixIdentifiers &&
    !context.inVOnce &&
    context.cacheHandlers &&
    !hasScopeRef(exp, context.identifiers)
  ) {
    props[1].value = context.cache(props[1].value)
  }

  // ============================================================
  // 修饰符处理
  // ============================================================

  /**
   * v-model 修饰符
   *
   * 修饰符通过 modelModifiers prop 传递给子组件。
   *
   * `<MyComp v-model.trim="text" />` 生成：
   * `{ modelModifiers: { trim: true } }`
   *
   * 带参数的 v-model：
   * `<MyComp v-model:title.capitalize="text" />` 生成：
   * `{ titleModifiers: { capitalize: true } }`
   *
   * 注意：修饰符只在组件上有效——原生元素由 DOM compiler 处理。
   */
  if (dir.modifiers.length && node.tagType === ElementTypes.COMPONENT) {
    const modifiers = dir.modifiers
      .map(m => m.content)
      .map(m =>
        // 合法标识符直接使用，带特殊字符的用 JSON 序列化
        (isSimpleIdentifier(m) ? m : JSON.stringify(m)) + `: true`
      )
      .join(`, `)

    // 修饰符 key：默认 "modelModifiers"，带参数时 "argModifiers"
    const modifiersKey = arg
      ? isStaticExp(arg)
        ? `${arg.content}Modifiers`
        : createCompoundExpression([arg, ' + "Modifiers"'])
      : `modelModifiers`

    props.push(
      createObjectProperty(
        modifiersKey,
        createSimpleExpression(
          `{ ${modifiers} }`,
          false,
          dir.loc,
          ConstantTypes.CAN_CACHE, // 纯对象字面量，可以缓存
        ),
      ),
    )
  }

  return createTransformProps(props)
}

/**
 * 创建 transform 返回结果
 *
 * @param props - 生成的 props 数组
 * @returns DirectiveTransform 的标准返回值
 */
function createTransformProps(props: Property[] = []) {
  return { props }
}
