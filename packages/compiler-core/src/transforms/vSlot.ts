/**
 * vSlot 转换器 —— v-slot 指令的编译时转换
 *
 * ## 功能概述
 * v-slot 是 Vue 的插槽指令，用于在父组件中定义传递给子组件的插槽内容。
 * 编译阶段将所有插槽声明合并为一个 `slots` 对象，包含插槽名称、作用域 props 和渲染函数。
 *
 * ## 模块组成
 * - `trackSlotScopes`：追踪作用域插槽的标识符和嵌套深度
 * - `trackVForSlotScopes`：追踪 v-for 与 v-slot 结合时的作用域变量
 * - `buildSlots`：构建完整的 slots 对象表达式
 *
 * ## Slot 标志位
 * 每个 slots 对象包含一个 `_` 属性，指示 slot 的类型：
 * - STABLE (1)：静态 slots，可跳过规范化和 diff
 * - DYNAMIC (2)：动态 slots，需要规范化但可跳过 diff
 * - FORWARDED (3)：需要转发给子组件的 slots
 */

import {
  type CallExpression,
  type ConditionalExpression,
  type DirectiveNode,
  type ElementNode,
  ElementTypes,
  type ExpressionNode,
  type FunctionExpression,
  NodeTypes,
  type ObjectExpression,
  type Property,
  type SlotsExpression,
  type SourceLocation,
  type TemplateChildNode,
  createArrayExpression,
  createCallExpression,
  createConditionalExpression,
  createFunctionExpression,
  createObjectExpression,
  createObjectProperty,
  createSimpleExpression,
} from '../ast'
import type { NodeTransform, TransformContext } from '../transform'
import { ErrorCodes, createCompilerError } from '../errors'
import {
  assert,
  findDir,
  hasScopeRef,
  isCommentOrWhitespace,
  isStaticExp,
  isTemplateNode,
  isVSlot,
  isWhitespaceText,
} from '../utils'
import { CREATE_SLOTS, RENDER_LIST, WITH_CTX } from '../runtimeHelpers'
import { createForLoopParams, finalizeForParseResult } from './vFor'
import { SlotFlags, slotFlagsText } from '@vue/shared'

// 条件分支中未渲染 slot 的默认回退值
const defaultFallback = createSimpleExpression(`undefined`, false)

// ============================================================
// trackSlotScopes：作用域插槽的作用域追踪
// ============================================================

/**
 * 作用域插槽的标识符追踪
 *
 * 两个职责：
 * 1. 追踪作用域插槽的 props 标识符，使其不被 transformExpression 添加前缀
 *    这样 `v-slot="{ item }"` 中的 `item` 保持为原始标识符
 * 2. 追踪插槽嵌套深度（vSlot 计数），用于判断是否需要动态 slots
 *
 * 退出回调在 buildSlots 之前执行，所以只有嵌套的插槽能看到正数
 * （自己的 vSlot 在退出时已经递减了）。
 */
export const trackSlotScopes: NodeTransform = (node, context) => {
  if (
    node.type === NodeTypes.ELEMENT &&
    (node.tagType === ElementTypes.COMPONENT ||
      node.tagType === ElementTypes.TEMPLATE)
  ) {
    // 只关心有作用域 props 的 v-slot
    const vSlot = findDir(node, 'slot')
    if (vSlot) {
      const slotProps = vSlot.exp

      // 进入阶段：向上下文注入作用域标识符
      if (!__BROWSER__ && context.prefixIdentifiers) {
        slotProps && context.addIdentifiers(slotProps)
      }
      context.scopes.vSlot++ // 递增插槽嵌套深度

      // 退出阶段：清理作用域
      return () => {
        if (!__BROWSER__ && context.prefixIdentifiers) {
          slotProps && context.removeIdentifiers(slotProps)
        }
        context.scopes.vSlot--
      }
    }
  }
}

// ============================================================
// trackVForSlotScopes：v-for + v-slot 的作用域追踪
// ============================================================

/**
 * v-for 与 v-slot 结合时的作用域追踪
 *
 * 当 `<template v-for="item in list" v-slot="{ item }">` 时，
 * 需要追踪 v-for 的迭代变量，确保它们不会被添加前缀。
 * 仅在非浏览器构建且开启 prefixIdentifiers 时生效。
 */
export const trackVForSlotScopes: NodeTransform = (node, context) => {
  let vFor
  if (
    isTemplateNode(node) &&
    node.props.some(isVSlot) &&
    (vFor = findDir(node, 'for'))
  ) {
    const result = vFor.forParseResult
    if (result) {
      finalizeForParseResult(result, context)
      const { value, key, index } = result
      const { addIdentifiers, removeIdentifiers } = context

      // 进入阶段：注入 v-for 变量
      value && addIdentifiers(value)
      key && addIdentifiers(key)
      index && addIdentifiers(index)

      // 退出阶段：清理
      return () => {
        value && removeIdentifiers(value)
        key && removeIdentifiers(key)
        index && removeIdentifiers(index)
      }
    }
  }
}

// ============================================================
// buildSlots：构建 slots 对象
// ============================================================

/**
 * Slot 函数构建器的类型
 */
export type SlotFnBuilder = (
  slotProps: ExpressionNode | undefined,
  vFor: DirectiveNode | undefined,
  slotChildren: TemplateChildNode[],
  loc: SourceLocation,
) => FunctionExpression

/**
 * 客户端 slot 函数构建器
 *
 * 创建一个无名称的函数表达式作为插槽的渲染函数。
 * isSlot: true 告知运行时这是一个 slot 函数。
 */
const buildClientSlotFn: SlotFnBuilder = (props, _vForExp, children, loc) =>
  createFunctionExpression(
    props,
    children,
    false /* newline */,
    true /* isSlot */,
    children.length ? children[0].loc : loc,
  )

/**
 * 构建组件的 slots 对象
 *
 * 这是 v-slot 指令的入口函数，在 transformElement 中被调用。
 * 扫描组件的所有子节点，将 v-slot 声明收集、合并为一个 slots 表达式。
 *
 * 处理三种场景：
 * 1. 组件自身的 v-slot（默认插槽简写）
 * 2. `<template v-slot:name>` 显式插槽
 * 3. 插槽的条件分支（v-if/v-else/v-for on slot）
 *
 * @returns { slots, hasDynamicSlots }
 */
export function buildSlots(
  node: ElementNode,
  context: TransformContext,
  buildSlotFn: SlotFnBuilder = buildClientSlotFn,
): {
  slots: SlotsExpression
  hasDynamicSlots: boolean
} {
  // WITH_CTX：用于作用域插槽，确保子节点在正确的渲染上下文中创建
  context.helper(WITH_CTX)

  const { children, loc } = node
  const slotsProperties: Property[] = []  // 静态 slot 属性列表
  const dynamicSlots: (ConditionalExpression | CallExpression)[] = []  // 动态 slot 列表

  /**
   * 动态 slots 判断
   *
   * 初始判断：
   * - 如果当前在 v-for 或 v-slot 嵌套内 → force 动态
   *   因为嵌套的 slot 引用了外层作用域变量
   *
   * 精确判断（prefixIdentifiers 模式）：
   * - slot 的 arg 或 exp 引用了作用域变量
   * - slot 的子节点引用了作用域变量
   */
  let hasDynamicSlots = context.scopes.vSlot > 0 || context.scopes.vFor > 0

  if (!__BROWSER__ && !context.ssr && context.prefixIdentifiers) {
    hasDynamicSlots =
      node.props.some(
        prop =>
          isVSlot(prop) &&
          (hasScopeRef(prop.arg, context.identifiers) ||
            hasScopeRef(prop.exp, context.identifiers)),
      ) || children.some(child => hasScopeRef(child, context.identifiers))
  }

  /**
   * 场景 1：组件自身的 v-slot
   *
   * `<Comp v-slot="{ prop }">...</Comp>`
   *
   * 这是默认插槽的简写，slot 名称固定为 "default"。
   * arg 为动态时标记为动态 slots。
   */
  const onComponentSlot = findDir(node, 'slot', true)
  if (onComponentSlot) {
    const { arg, exp } = onComponentSlot
    if (arg && !isStaticExp(arg)) {
      hasDynamicSlots = true
    }
    slotsProperties.push(
      createObjectProperty(
        arg || createSimpleExpression('default', true),
        buildSlotFn(exp, undefined, children, loc),
      ),
    )
  }

  /**
   * 场景 2：<template v-slot:name>
   *
   * 遍历子节点，收集所有 template v-slot 声明。
   */
  let hasTemplateSlots = false
  let hasNamedDefaultSlot = false
  const implicitDefaultChildren: TemplateChildNode[] = []
  const seenSlotNames = new Set<string>()  // 用于重复名称检查
  let conditionalBranchIndex = 0          // 条件分支的 key 索引

  for (let i = 0; i < children.length; i++) {
    const slotElement = children[i]
    let slotDir

    // 只处理 <template v-slot> 形式的节点
    if (
      !isTemplateNode(slotElement) ||
      !(slotDir = findDir(slotElement, 'slot', true))
    ) {
      // 非 template 或非 v-slot：收集为隐式默认插槽内容
      if (slotElement.type !== NodeTypes.COMMENT) {
        implicitDefaultChildren.push(slotElement)
      }
      continue
    }

    /**
     * 错误：同时使用组件自身 v-slot 和 template v-slot
     *
     * `<Comp v-slot="props"><template v-slot:foo>...</template></Comp>`
     * 这种混合用法会引发歧义，应报错。
     */
    if (onComponentSlot) {
      context.onError(
        createCompilerError(ErrorCodes.X_V_SLOT_MIXED_SLOT_USAGE, slotDir.loc),
      )
      break
    }

    hasTemplateSlots = true
    const { children: slotChildren, loc: slotLoc } = slotElement
    const {
      arg: slotName = createSimpleExpression(`default`, true),
      exp: slotProps,
      loc: dirLoc,
    } = slotDir

    // 检查 slot 名称是否为静态
    let staticSlotName: string | undefined
    if (isStaticExp(slotName)) {
      staticSlotName = slotName ? slotName.content : `default`
    } else {
      hasDynamicSlots = true // 动态名称 → 必须运行时处理
    }

    // 检查是否与 v-for 结合
    const vFor = findDir(slotElement, 'for')
    const slotFunction = buildSlotFn(slotProps, vFor, slotChildren, slotLoc)

    /**
     * 条件插槽处理
     *
     * 支持 v-if、v-else-if、v-else 在 `<template v-slot>` 上。
     * 条件插槽在运行时可能不会渲染，因此必须在运行时做条件判断。
     * 它们会被放入 dynamicSlots 数组供运行时处理。
     */

    // v-if on slot
    let vIf: DirectiveNode | undefined
    let vElse: DirectiveNode | undefined
    if ((vIf = findDir(slotElement, 'if'))) {
      hasDynamicSlots = true
      dynamicSlots.push(
        createConditionalExpression(
          vIf.exp!,
          buildDynamicSlot(slotName, slotFunction, conditionalBranchIndex++),
          defaultFallback,
        ),
      )
    } else if (
      (vElse = findDir(slotElement, /^else(?:-if)?$/, true /* allowEmpty */))
    ) {
      /**
       * v-else / v-else-if on slot
       *
       * 找到前一个 template v-slot（跳过注释），
       * 将当前 slot 附加到其条件链的 alternate 位置。
       */
      let j = i
      let prev
      while (j--) {
        prev = children[j]
        if (!isCommentOrWhitespace(prev)) break
      }
      if (prev && isTemplateNode(prev) && findDir(prev, /^(?:else-)?if$/)) {
        __TEST__ && assert(dynamicSlots.length > 0)

        // 穿透条件链找到最底层节点
        let conditional = dynamicSlots[
          dynamicSlots.length - 1
        ] as ConditionalExpression
        while (
          conditional.alternate.type === NodeTypes.JS_CONDITIONAL_EXPRESSION
        ) {
          conditional = conditional.alternate
        }

        // 追加新条件或最终分支
        conditional.alternate = vElse.exp
          ? createConditionalExpression(
              vElse.exp,
              buildDynamicSlot(slotName, slotFunction, conditionalBranchIndex++),
              defaultFallback,
            )
          : buildDynamicSlot(slotName, slotFunction, conditionalBranchIndex++)
      } else {
        context.onError(
          createCompilerError(ErrorCodes.X_V_ELSE_NO_ADJACENT_IF, vElse.loc),
        )
      }
    } else if (vFor) {
      /**
       * v-for on slot
       *
       * 动态 slots 通过 renderList + buildDynamicSlot 生成。
       * 运行时创建一个 slot 对象数组。
       */
      hasDynamicSlots = true
      const parseResult = vFor.forParseResult
      if (parseResult) {
        finalizeForParseResult(parseResult, context)
        dynamicSlots.push(
          createCallExpression(context.helper(RENDER_LIST), [
            parseResult.source,
            createFunctionExpression(
              createForLoopParams(parseResult),
              buildDynamicSlot(slotName, slotFunction),
              true /* force newline */,
            ),
          ]),
        )
      } else {
        context.onError(
          createCompilerError(
            ErrorCodes.X_V_FOR_MALFORMED_EXPRESSION,
            vFor.loc,
          ),
        )
      }
    } else {
      /**
       * 普通静态插槽
       *
       * 检查重复名称：
       * - 同名 slot 声明多次是错误用法
       * - 跟踪 named default 的出现
       */
      if (staticSlotName) {
        if (seenSlotNames.has(staticSlotName)) {
          context.onError(
            createCompilerError(
              ErrorCodes.X_V_SLOT_DUPLICATE_SLOT_NAMES,
              dirLoc,
            ),
          )
          continue
        }
        seenSlotNames.add(staticSlotName)
        if (staticSlotName === 'default') {
          hasNamedDefaultSlot = true
        }
      }
      slotsProperties.push(createObjectProperty(slotName, slotFunction))
    }
  }

  /**
   * 隐式默认插槽处理
   *
   * 没有被 `<template v-slot>` 包裹的内容 = 隐式默认插槽。
   *
   * 三种情况：
   * 1. 没有显式 template slots → 所有子节点都是隐式默认插槽
   * 2. 有显式 template slots + 有隐式子节点 → 混合使用
   * 3. 有显式 template slots + 所有隐式子节点是空白 → 忽略空白（#3766）
   */
  if (!onComponentSlot) {
    const buildDefaultSlotProperty = (
      props: ExpressionNode | undefined,
      children: TemplateChildNode[],
    ) => {
      const fn = buildSlotFn(props, undefined, children, loc)
      if (__COMPAT__ && context.compatConfig) {
        fn.isNonScopedSlot = true // compat 模式标记
      }
      return createObjectProperty(`default`, fn)
    }

    if (!hasTemplateSlots) {
      // 纯隐式默认插槽
      slotsProperties.push(buildDefaultSlotProperty(undefined, children))
    } else if (
      implicitDefaultChildren.length &&
      // #3766：过滤纯空白节点
      !implicitDefaultChildren.every(isWhitespaceText)
    ) {
      // 混合：显式命名 + 隐式默认
      if (hasNamedDefaultSlot) {
        context.onError(
          createCompilerError(
            ErrorCodes.X_V_SLOT_EXTRANEOUS_DEFAULT_SLOT_CHILDREN,
            implicitDefaultChildren[0].loc,
          ),
        )
      } else {
        slotsProperties.push(
          buildDefaultSlotProperty(undefined, implicitDefaultChildren),
        )
      }
    }
  }

  /**
   * Slot 标志位计算
   *
   * DYNAMIC  ：有动态 slot（条件/v-for/动态名称）
   * FORWARDED：子节点包含 `<slot>` 元素 → 需要转发
   * STABLE   ：纯静态 slots
   */
  const slotFlag = hasDynamicSlots
    ? SlotFlags.DYNAMIC
    : hasForwardedSlots(node.children)
      ? SlotFlags.FORWARDED
      : SlotFlags.STABLE

  // 构建 slots 对象表达式，`_` 属性存储 slot flag
  let slots = createObjectExpression(
    slotsProperties.concat(
      createObjectProperty(
        `_`,
        // 2 = 编译但动态 → 可跳过规范化，但必须 diff
        // 1 = 编译且静态 → 可跳过规范化 AND diff
        createSimpleExpression(
          slotFlag + (__DEV__ ? ` /* ${slotFlagsText[slotFlag]} */` : ``),
          false,
        ),
      ),
    ),
    loc,
  ) as SlotsExpression

  /**
   * 动态 slots 包装
   *
   * 如果有动态 slot，需要调用 createSlots() 运行时函数，
   * 它会将静态 slots 对象和动态 slot 数组合并处理。
   */
  if (dynamicSlots.length) {
    slots = createCallExpression(context.helper(CREATE_SLOTS), [
      slots,
      createArrayExpression(dynamicSlots),
    ]) as SlotsExpression
  }

  return {
    slots,
    hasDynamicSlots,
  }
}

/**
 * 构建单个动态 slot 描述对象
 *
 * 动态 slot 在运行时表示为一个 { name, fn, key? } 对象：
 * - name：插槽名称（动态或静态）
 * - fn：插槽渲染函数
 * - key：条件分支的索引（用于 v-if/v-else slot 的正确补丁）
 */
function buildDynamicSlot(
  name: ExpressionNode,
  fn: FunctionExpression,
  index?: number,
): ObjectExpression {
  const props = [
    createObjectProperty(`name`, name),
    createObjectProperty(`fn`, fn),
  ]
  if (index != null) {
    props.push(
      createObjectProperty(`key`, createSimpleExpression(String(index), true)),
    )
  }
  return createObjectExpression(props)
}

/**
 * 检查子节点中是否包含需要转发的 `<slot>` 元素
 *
 * 如果组件的子节点（插槽内容）中包含了 `<slot>` 标签，
 * 意味着这个插槽需要转发——即当前组件的插槽内容又声明了自己的插槽出口。
 *
 * 递归检查 Element、If、IfBranch、For 节点。
 */
function hasForwardedSlots(children: TemplateChildNode[]): boolean {
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    switch (child.type) {
      case NodeTypes.ELEMENT:
        if (
          child.tagType === ElementTypes.SLOT ||
          hasForwardedSlots(child.children)
        ) {
          return true
        }
        break
      case NodeTypes.IF:
        if (hasForwardedSlots(child.branches)) return true
        break
      case NodeTypes.IF_BRANCH:
      case NodeTypes.FOR:
        if (hasForwardedSlots(child.children)) return true
        break
    }
  }
  return false
}
