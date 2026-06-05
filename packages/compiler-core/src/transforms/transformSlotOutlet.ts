/**
 * transformSlotOutlet —— `<slot>` 出口元素的编译时转换
 *
 * ## 功能概述
 * `<slot>` 元素是组件插槽的"出口"——在父组件中定义了插槽内容，
 * 子组件通过 `<slot>` 标签将其渲染出来。这个转换器：
 *
 * 1. 将 `<slot>` 编译为 `renderSlot($slots, name, props, fallback)` 调用
 * 2. 解析 slot 名称（默认 "default"）
 * 3. 处理 slot props（作用域插槽的参数）
 * 4. 处理 fallback 内容（slot 为空时的默认内容）
 *
 * ## 使用示例
 * ```html
 * <!-- 默认插槽 -->
 * <slot />
 * <!-- → renderSlot($slots, "default") -->
 *
 * <!-- 具名插槽 -->
 * <slot name="header" />
 * <!-- → renderSlot($slots, "header") -->
 *
 * <!-- 作用域插槽 -->
 * <slot :user="user" name="item" />
 * <!-- → renderSlot($slots, "item", { user: user }) -->
 * ```
 */

import type { NodeTransform, TransformContext } from '../transform'
import {
  type CallExpression,
  type ExpressionNode,
  NodeTypes,
  type SlotOutletNode,
  createCallExpression,
  createFunctionExpression,
  createSimpleExpression,
} from '../ast'
import { isSlotOutlet, isStaticArgOf, isStaticExp } from '../utils'
import { type PropsExpression, buildProps } from './transformElement'
import { ErrorCodes, createCompilerError } from '../errors'
import { RENDER_SLOT } from '../runtimeHelpers'
import { camelize } from '@vue/shared'
import { processExpression } from './transformExpression'

/**
 * Slot 出口的节点转换器
 *
 * 检测到 `<slot>` 元素时，将其转换为 renderSlot 运行时调用。
 * 这个转换在进入阶段（而非退出阶段）执行，因为 slot 本身不需要
 * 等待子节点处理结果——fallback 内容单独作为函数表达式传递。
 */
export const transformSlotOutlet: NodeTransform = (node, context) => {
  if (isSlotOutlet(node)) {
    const { children, loc } = node

    /**
     * 解析 slot 名称和 scope props
     *
     * processSlotOutlet 返回：
     * - slotName: 插槽名称（字符串或动态表达式）
     * - slotProps: 作用域插槽的 props 对象表达式
     */
    const { slotName, slotProps } = processSlotOutlet(node, context)

    /**
     * renderSlot 调用的参数数组
     *
     * 参数位置：
     * [0] $slots        —— 插槽集合对象
     * [1] slotName      —— 插槽名称（默认 "default"）
     * [2] slotProps     —— 作用域 props 对象（{} 或实际 props）
     * [3] fallbackFn    —— fallback 渲染函数
     * [4] contextFlag   —— scopeId 标识
     *
     * expectedLen 用于标记实际使用的参数数量，
     * 超出的默认值会被 splice 移除，减少无用参数。
     */
    const slotArgs: CallExpression['arguments'] = [
      // 前缀模式下使用 _ctx.$slots 确保正确的作用域访问
      context.prefixIdentifiers ? `_ctx.$slots` : `$slots`,
      slotName,
      '{}',        // 默认空 props 对象
      'undefined', // 默认无 fallback
      'true',      // 默认的 context flag
    ]
    let expectedLen = 2 // 至少需要 $slots 和 slotName

    // 如果有 slot props，替换第三个参数
    if (slotProps) {
      slotArgs[2] = slotProps
      expectedLen = 3
    }

    // 如果有子节点，创建 fallback 渲染函数
    // fallback 在父组件没有提供该插槽内容时渲染
    if (children.length) {
      slotArgs[3] = createFunctionExpression(
        [],        // 无参数
        children,  // 函数体 = slot 的子节点
        false,     // 不是 Block 返回值
        false,     // 不需要 newline
        loc,
      )
      expectedLen = 4
    }

    // 当有 scopeId 且不是 slotted 模式时，需要第五个参数
    if (context.scopeId && !context.slotted) {
      expectedLen = 5
    }

    // 移除未使用的尾随参数，减少最终代码体积
    slotArgs.splice(expectedLen)

    // 生成 renderSlot 调用节点
    node.codegenNode = createCallExpression(
      context.helper(RENDER_SLOT),
      slotArgs,
      loc,
    )
  }
}

interface SlotOutletProcessResult {
  slotName: string | ExpressionNode
  slotProps: PropsExpression | undefined
}

/**
 * 处理 Slot 出口元素，解析出 slot 名称和 props
 *
 * 职责：
 * 1. 从 props 中提取 slot 名称（静态 `name="xxx"` 或动态 `:name="xxx"`）
 * 2. 收集非 name 的 props 作为 scope props
 * 3. 对 scope props 进行 buildProps 处理（style/class 规范化等）
 *
 * @param node    - Slot 出口的 AST 节点
 * @param context - 编译上下文
 * @returns slot 名称和 scope props
 */
export function processSlotOutlet(
  node: SlotOutletNode,
  context: TransformContext,
): SlotOutletProcessResult {
  // 默认插槽名称为 "default"
  let slotName: string | ExpressionNode = `"default"`
  let slotProps: PropsExpression | undefined = undefined

  const nonNameProps = []

  // 遍历 slot 元素上的所有属性/指令
  for (let i = 0; i < node.props.length; i++) {
    const p = node.props[i]

    if (p.type === NodeTypes.ATTRIBUTE) {
      /**
       * 静态属性处理
       *
       * `name="header"` → slotName = '"header"'
       */
      if (p.value) {
        if (p.name === 'name') {
          // name 属性：直接 JSON 序列化为字符串
          slotName = JSON.stringify(p.value.content)
        } else {
          // 非 name 属性：camelize 后作为 scope prop
          p.name = camelize(p.name)
          nonNameProps.push(p)
        }
      }
    } else {
      /**
       * 指令属性处理
       *
       * `:name="expr"` → 动态 slot 名称
       * `:user="user"` → scope prop
       */
      if (p.name === 'bind' && isStaticArgOf(p.arg, 'name')) {
        // v-bind:name 或 :name
        if (p.exp) {
          // 有表达式：直接作为动态 slot 名称
          slotName = p.exp
        } else if (p.arg && p.arg.type === NodeTypes.SIMPLE_EXPRESSION) {
          // 同名简写 :name → :name="name"
          const name = camelize(p.arg.content)
          slotName = p.exp = createSimpleExpression(name, false, p.arg.loc)

          // 非浏览器构建：对表达式做前缀转换处理
          if (!__BROWSER__) {
            slotName = p.exp = processExpression(p.exp, context)
          }
        }
      } else {
        // 非 name 的 bind 指令
        if (p.name === 'bind' && p.arg && isStaticExp(p.arg)) {
          // 对静态参数做 camelize 处理
          p.arg.content = camelize(p.arg.content)
        }
        nonNameProps.push(p)
      }
    }
  }

  /**
   * 处理 scope props
   *
   * 将收集到的非 name props 通过 buildProps 统一处理，
   * 生成符合 vnode props 规范的表达式
   */
  if (nonNameProps.length > 0) {
    const { props, directives } = buildProps(
      node,
      context,
      nonNameProps,
      false, // 非组件
      false, // 非 SSR
    )
    slotProps = props

    // `<slot>` 上不允许使用自定义指令
    if (directives.length) {
      context.onError(
        createCompilerError(
          ErrorCodes.X_V_SLOT_UNEXPECTED_DIRECTIVE_ON_SLOT_OUTLET,
          directives[0].loc,
        ),
      )
    }
  }

  return {
    slotName,
    slotProps,
  }
}
