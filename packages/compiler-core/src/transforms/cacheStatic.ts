/**
 * cacheStatic —— 静态节点缓存与提升优化
 *
 * ## 功能概述
 * 这是 Vue 编译器核心优化之一：静态提升（Static Hoisting）。
 * 在编译阶段，将完全静态的 VNode 提升到渲染函数外部，避免每次渲染时重新创建。
 *
 * ## 优化效果
 * ```
 * // 优化前：每次 render 都创建新 VNode
 * function render() {
 *   return createVNode('div', null, [
 *     createVNode('span', null, 'Hello') // ← 每次都 new
 *   ])
 * }
 *
 * // 优化后：静态 VNode 提升为常量
 * const _hoisted_1 = createVNode('span', null, 'Hello')
 * function render() {
 *   return createVNode('div', null, [_hoisted_1]) // ← 直接引用
 * }
 * ```
 *
 * ## 常量类型（ConstantTypes）分级
 * - NOT_CONSTANT (0)：包含动态内容，不可提升
 * - CAN_SKIP_PATCH (1)：不含动态内容，可跳过 diff
 * - CAN_CACHE (2)：可被 context.cache() 缓存
 * - CAN_STRINGIFY (3)：完全静态，可序列化为字符串常量
 *
 * ## 设计要点
 * - walk 递归遍历 AST，识别可缓存的节点
 * - getConstantType 判断节点的常量级别
 * - 支持 children 数组级别的提升（all children cacheable → array cache）
 * - 对仅 props 静态、children 动态的节点做 partial hoisting
 * - v-for/v-if 的单子节点不提升（它们必须是 Block）
 */

import {
  type CacheExpression,
  type CallExpression,
  type ComponentNode,
  ConstantTypes,
  ElementTypes,
  type ExpressionNode,
  type JSChildNode,
  NodeTypes,
  type ParentNode,
  type PlainElementNode,
  type RootNode,
  type SimpleExpressionNode,
  type SlotFunctionExpression,
  type TemplateChildNode,
  type TemplateNode,
  type TextCallNode,
  type VNodeCall,
  createArrayExpression,
  getVNodeBlockHelper,
  getVNodeHelper,
} from '../ast'
import type { TransformContext } from '../transform'
import {
  PatchFlagNames,
  PatchFlags,
  isArray,
  isString,
  isSymbol,
} from '@vue/shared'
import { findDir, isSlotOutlet } from '../utils'
import {
  GUARD_REACTIVE_PROPS,
  NORMALIZE_CLASS,
  NORMALIZE_PROPS,
  NORMALIZE_STYLE,
  OPEN_BLOCK,
} from '../runtimeHelpers'

/**
 * 静态节点缓存入口
 *
 * @param root     - AST 根节点
 * @param context  - 转换上下文
 *
 * 第三个参数 doNotHoistNode：如果根节点只有一个元素，这个元素不可提升。
 * 因为根元素可能承受父组件的 fallthrough attributes（透传属性），
 * 这是运行时才能确定的，所以不能静态提升。
 */
export function cacheStatic(root: RootNode, context: TransformContext): void {
  walk(
    root,
    undefined,
    context,
    !!getSingleElementRoot(root), // 单元素根 → 父元素不可提升
  )
}

/**
 * 判断根节点是否只有单个元素子节点
 *
 * 忽略注释，如果只有一个 ELEMENT 类型且不是 slot outlet 的子节点，
 * 则返回该元素。
 */
export function getSingleElementRoot(
  root: RootNode,
): PlainElementNode | ComponentNode | TemplateNode | null {
  const children = root.children.filter(x => x.type !== NodeTypes.COMMENT)
  return children.length === 1 &&
    children[0].type === NodeTypes.ELEMENT &&
    !isSlotOutlet(children[0])
    ? children[0]
    : null
}

/**
 * 递归遍历 AST，进行静态节点缓存
 *
 * @param node           - 当前父节点
 * @param parent         - 父节点（用于 <template> slot 场景）
 * @param context        - 转换上下文
 * @param doNotHoistNode - 当前容器是否不可提升（v-for 单子/v-if 单子/根元素）
 * @param inFor          - 是否在 v-for 内部
 */
function walk(
  node: ParentNode,
  parent: ParentNode | undefined,
  context: TransformContext,
  doNotHoistNode: boolean = false,
  inFor = false,
) {
  const { children } = node
  const toCache: (PlainElementNode | TextCallNode)[] = []

  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    /**
     * CASE 1：普通元素
     *
     * 只有原生 HTML 元素可以缓存（ElementTypes.ELEMENT）。
     * 组件不能静态提升——因为组件有自己的渲染逻辑和状态。
     */
    if (
      child.type === NodeTypes.ELEMENT &&
      child.tagType === ElementTypes.ELEMENT
    ) {
      const constantType = doNotHoistNode
        ? ConstantTypes.NOT_CONSTANT
        : getConstantType(child, context)

      if (constantType > ConstantTypes.NOT_CONSTANT) {
        if (constantType >= ConstantTypes.CAN_CACHE) {
          /**
           * 元素可缓存
           *
           * 标记 CACHED patchFlag，加入 toCache 队列。
           * 后续会将此元素从渲染函数中提升为外部常量。
           */
          ;(child.codegenNode as VNodeCall).patchFlag = PatchFlags.CACHED
          toCache.push(child)
          continue
        }
      } else {
        /**
         * 元素不可缓存但 props 可能可以提升（partial hoisting）
         *
         * 场景：
         *   <div :class="dynamic" style="color: red"></div>
         *   class 是动态的，但 style 是静态的 → style 可以提升
         *
         * 条件：
         * - VNodeCall 类型
         * - patchFlag 是 undefined、NEED_PATCH 或 TEXT（说明 props 变化有限）
         * - getGeneratedPropsConstantType >= CAN_CACHE
         */
        const codegenNode = child.codegenNode!
        if (codegenNode.type === NodeTypes.VNODE_CALL) {
          const flag = codegenNode.patchFlag
          if (
            (flag === undefined ||
              flag === PatchFlags.NEED_PATCH ||
              flag === PatchFlags.TEXT) &&
            getGeneratedPropsConstantType(child, context) >=
              ConstantTypes.CAN_CACHE
          ) {
            const props = getNodeProps(child)
            if (props) {
              // props 可提升：用 context.hoist 提升 props 对象
              codegenNode.props = context.hoist(props)
            }
          }
          // dynamicProps 始终可提升（它是一个字符串数组常量）
          if (codegenNode.dynamicProps) {
            codegenNode.dynamicProps = context.hoist(codegenNode.dynamicProps)
          }
        }
      }
    } else if (child.type === NodeTypes.TEXT_CALL) {
      /**
       * CASE 2：文本调用节点（createTextVNode 调用）
       *
       * 如果文本内容是常量，可以缓存 createTextVNode 调用。
       */
      const constantType = doNotHoistNode
        ? ConstantTypes.NOT_CONSTANT
        : getConstantType(child, context)

      if (constantType >= ConstantTypes.CAN_CACHE) {
        if (
          child.codegenNode.type === NodeTypes.JS_CALL_EXPRESSION &&
          child.codegenNode.arguments.length > 0
        ) {
          // 附加 CACHED patchFlag
          child.codegenNode.arguments.push(
            PatchFlags.CACHED +
              (__DEV__ ? ` /* ${PatchFlagNames[PatchFlags.CACHED]} */` : ``),
          )
        }
        toCache.push(child)
        continue
      }
    }

    /**
     * 递归遍历子 AST
     *
     * - ELEMENT 节点：继续 walk（组件会增加 vSlot count）
     * - FOR 节点：单子时不提升子节点（必须是 Block）
     * - IF 节点：每个分支单子时不提升
     */
    if (child.type === NodeTypes.ELEMENT) {
      const isComponent = child.tagType === ElementTypes.COMPONENT
      if (isComponent) {
        context.scopes.vSlot++
      }
      walk(child, node, context, false, inFor)
      if (isComponent) {
        context.scopes.vSlot--
      }
    } else if (child.type === NodeTypes.FOR) {
      // v-for 的单子节点不提升——它必须是 Block
      walk(child, node, context, child.children.length === 1, true)
    } else if (child.type === NodeTypes.IF) {
      for (let i = 0; i < child.branches.length; i++) {
        // v-if 的单子节点不提升——它必须是 Block
        walk(
          child.branches[i],
          node,
          context,
          child.branches[i].children.length === 1,
          inFor,
        )
      }
    }
  }

  /**
   * 数组级别提升优化
   *
   * 当父节点的所有子节点都可缓存时，将整个 children 数组提升为常量。
   * 这避免了为每个子节点单独创建缓存引用。
   *
   * 三种场景：
   * 1. 普通元素 → codegenNode.children 作为数组提升
   * 2. 组件的默认 slot → slot.returns 作为数组提升
   * 3. template 的命名 slot → slot.returns 作为数组提升
   */
  let cachedAsArray = false
  if (toCache.length === children.length && node.type === NodeTypes.ELEMENT) {
    if (
      node.tagType === ElementTypes.ELEMENT &&
      node.codegenNode &&
      node.codegenNode.type === NodeTypes.VNODE_CALL &&
      isArray(node.codegenNode.children)
    ) {
      // 场景 1：所有子节点都提升了 → children 数组整体提升
      node.codegenNode.children = getCacheExpression(
        createArrayExpression(node.codegenNode.children),
      )
      cachedAsArray = true
    } else if (
      node.tagType === ElementTypes.COMPONENT &&
      node.codegenNode &&
      node.codegenNode.type === NodeTypes.VNODE_CALL &&
      node.codegenNode.children &&
      !isArray(node.codegenNode.children) &&
      node.codegenNode.children.type === NodeTypes.JS_OBJECT_EXPRESSION
    ) {
      // 场景 2：组件默认 slot 的提升
      const slot = getSlotNode(node.codegenNode, 'default')
      if (slot) {
        slot.returns = getCacheExpression(
          createArrayExpression(slot.returns as TemplateChildNode[]),
        )
        cachedAsArray = true
      }
    } else if (
      node.tagType === ElementTypes.TEMPLATE &&
      parent &&
      parent.type === NodeTypes.ELEMENT &&
      parent.tagType === ElementTypes.COMPONENT &&
      parent.codegenNode &&
      parent.codegenNode.type === NodeTypes.VNODE_CALL &&
      parent.codegenNode.children &&
      !isArray(parent.codegenNode.children) &&
      parent.codegenNode.children.type === NodeTypes.JS_OBJECT_EXPRESSION
    ) {
      // 场景 3：命名 template slot 的提升
      const slotName = findDir(node, 'slot', true)
      const slot =
        slotName &&
        slotName.arg &&
        getSlotNode(parent.codegenNode, slotName.arg)
      if (slot) {
        slot.returns = getCacheExpression(
          createArrayExpression(slot.returns as TemplateChildNode[]),
        )
        cachedAsArray = true
      }
    }
  }

  /**
   * 非数组提升：逐个节点缓存
   *
   * 当不是所有子节点都可缓存时，对可缓存的节点逐个调用 context.cache()。
   */
  if (!cachedAsArray) {
    for (const child of toCache) {
      child.codegenNode = context.cache(child.codegenNode!)
    }
  }

  /**
   * 缓存表达式包装
   *
   * #6978, #7138, #7114：v-for 内缓存的 children 数组在挂载第一个元素时会被修改，
   * 导致 HMR 错误。
   *
   * #13221：缓存的 VNode 在一次 mount/unmount 周期中绑定 DOM 引用后，
   * 下次 mount 会复用这些过期引用。数组展开（spread）确保不修改缓存的原始数组，
   * 避免内存泄漏和数据污染。
   */
  function getCacheExpression(value: JSChildNode): CacheExpression {
    const exp = context.cache(value)
    exp.needArraySpread = true  // 运行时用 [...array] 展开，不修改缓存数组
    return exp
  }

  /**
   * 从 VNodeCall 的 slots 对象中查找指定名称的 slot 函数
   */
  function getSlotNode(
    node: VNodeCall,
    name: string | ExpressionNode,
  ): SlotFunctionExpression | undefined {
    if (
      node.children &&
      !isArray(node.children) &&
      node.children.type === NodeTypes.JS_OBJECT_EXPRESSION
    ) {
      const slot = node.children.properties.find(
        p =>
          p.key === name ||
          (p.key as SimpleExpressionNode).content === name,
      )
      return slot && slot.value
    }
  }

  /**
   * 调用自定义的 transformHoist 钩子
   *
   * 允许外部扩展（如 Vue 的 SFC 编译器）在提升后做额外处理。
   */
  if (toCache.length && context.transformHoist) {
    context.transformHoist(children, context, node)
  }
}

/**
 * 获取节点的常量类型（递归分析）
 *
 * 这是静态提升的核心判断函数。递归分析一个 AST 节点，
 * 判断其是否为纯静态，以及静态的程度。
 *
 * 返回 NOT_CONSTANT 的节点不能被缓存或提升。
 * 返回 CAN_STRINGIFY 的节点可以序列化为字符串（最高优化级别）。
 */
export function getConstantType(
  node: TemplateChildNode | SimpleExpressionNode | CacheExpression,
  context: TransformContext,
): ConstantTypes {
  const { constantCache } = context

  switch (node.type) {
    case NodeTypes.ELEMENT: {
      // 只有原生 HTML 元素可以分析常量类型
      if (node.tagType !== ElementTypes.ELEMENT) {
        return ConstantTypes.NOT_CONSTANT
      }

      // 缓存查找（避免重复分析）
      const cached = constantCache.get(node)
      if (cached !== undefined) {
        return cached
      }

      const codegenNode = node.codegenNode!
      if (codegenNode.type !== NodeTypes.VNODE_CALL) {
        return ConstantTypes.NOT_CONSTANT
      }

      /**
       * Block 元素不可提升
       *
       * 除了 svg/foreignObject/math（它们只是在特定上下文需要 Block：
       * https://github.com/vuejs/core/issues/348）。
       * 如果这些元素的 props 和 children 都静态，它们也不需要 Block。
       */
      if (
        codegenNode.isBlock &&
        node.tag !== 'svg' &&
        node.tag !== 'foreignObject' &&
        node.tag !== 'math'
      ) {
        return ConstantTypes.NOT_CONSTANT
      }

      if (codegenNode.patchFlag === undefined) {
        // 无 patchFlag → 不存在明确的动态绑定，但需要进一步检查
        let returnType = ConstantTypes.CAN_STRINGIFY

        /**
         * 检查 1：props 的常量类型
         *
         * 即使没有 patchFlag，props 中仍可能有非可提升表达式：
         * - 编译器注入的 key
         * - 缓存的事件处理器
         * - 动态 props 引用
         */
        const generatedPropsType = getGeneratedPropsConstantType(node, context)
        if (generatedPropsType === ConstantTypes.NOT_CONSTANT) {
          constantCache.set(node, ConstantTypes.NOT_CONSTANT)
          return ConstantTypes.NOT_CONSTANT
        }
        if (generatedPropsType < returnType) {
          returnType = generatedPropsType
        }

        /**
         * 检查 2：children 的常量类型
         *
         * 递归检查所有子节点
         */
        for (let i = 0; i < node.children.length; i++) {
          const childType = getConstantType(node.children[i], context)
          if (childType === ConstantTypes.NOT_CONSTANT) {
            constantCache.set(node, ConstantTypes.NOT_CONSTANT)
            return ConstantTypes.NOT_CONSTANT
          }
          if (childType < returnType) {
            returnType = childType
          }
        }

        /**
         * 检查 3：v-bind 指令表达式的常量类型
         *
         * 如果有 v-bind 指令，表达式可能是动态的（即使没有 patchFlag）。
         * 比如运行时常量表达式。
         */
        if (returnType > ConstantTypes.CAN_SKIP_PATCH) {
          for (let i = 0; i < node.props.length; i++) {
            const p = node.props[i]
            if (p.type === NodeTypes.DIRECTIVE && p.name === 'bind' && p.exp) {
              const expType = getConstantType(p.exp, context)
              if (expType === ConstantTypes.NOT_CONSTANT) {
                constantCache.set(node, ConstantTypes.NOT_CONSTANT)
                return ConstantTypes.NOT_CONSTANT
              }
              if (expType < returnType) {
                returnType = expType
              }
            }
          }
        }

        /**
         * 静态 Block 优化：移除不必要的 Block 标记
         *
         * svg/foreignObject/math 在 patchFlag 为 undefined 且没有自定义指令时，
         * 不需要 Block 追踪（因为没有嵌套的动态更新）。
         * 移除 Block 相关的 runtime helper。
         */
        if (codegenNode.isBlock) {
          // 有自定义指令时不能移除 Block
          for (let i = 0; i < node.props.length; i++) {
            const p = node.props[i]
            if (p.type === NodeTypes.DIRECTIVE) {
              constantCache.set(node, ConstantTypes.NOT_CONSTANT)
              return ConstantTypes.NOT_CONSTANT
            }
          }
          // 从 Block helper 切换到普通 VNode helper
          context.removeHelper(OPEN_BLOCK)
          context.removeHelper(
            getVNodeBlockHelper(context.inSSR, codegenNode.isComponent),
          )
          codegenNode.isBlock = false
          context.helper(getVNodeHelper(context.inSSR, codegenNode.isComponent))
        }

        constantCache.set(node, returnType)
        return returnType
      } else {
        // 有 patchFlag → 存在动态绑定
        constantCache.set(node, ConstantTypes.NOT_CONSTANT)
        return ConstantTypes.NOT_CONSTANT
      }
    }

    // 纯文本和注释 → 最高优化级别
    case NodeTypes.TEXT:
    case NodeTypes.COMMENT:
      return ConstantTypes.CAN_STRINGIFY

    // 条件/循环结构 → 不可静态（即使是静态条件，结构本身是运行时决定的）
    case NodeTypes.IF:
    case NodeTypes.FOR:
    case NodeTypes.IF_BRANCH:
      return ConstantTypes.NOT_CONSTANT

    // 插值和文本调用 → 代理到 content 的常量类型
    case NodeTypes.INTERPOLATION:
    case NodeTypes.TEXT_CALL:
      return getConstantType(node.content, context)

    // 简单表达式 → 使用预设的 constType
    case NodeTypes.SIMPLE_EXPRESSION:
      return node.constType

    // 复合表达式 → 取所有子节点中最低的常量类型
    case NodeTypes.COMPOUND_EXPRESSION: {
      let returnType = ConstantTypes.CAN_STRINGIFY
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (isString(child) || isSymbol(child)) continue // 字符串字面量 = 静态
        const childType = getConstantType(child, context)
        if (childType === ConstantTypes.NOT_CONSTANT) {
          return ConstantTypes.NOT_CONSTANT
        } else if (childType < returnType) {
          returnType = childType
        }
      }
      return returnType
    }

    // 已缓存的表达式 → 可缓存级别（已被缓存处理过）
    case NodeTypes.JS_CACHE_EXPRESSION:
      return ConstantTypes.CAN_CACHE

    default:
      if (__DEV__) {
        const exhaustiveCheck: never = node
        exhaustiveCheck
      }
      return ConstantTypes.NOT_CONSTANT
  }
}

/**
 * 允许提升的 runtime helper 集合
 *
 * 这些 helper 调用结果是无副作用且可缓存的：
 * - normalizeClass：class 规范化
 * - normalizeStyle：style 规范化
 * - normalizeProps：props 规范化
 * - guardReactiveProps：响应式 props 防护
 */
const allowHoistedHelperSet = new Set([
  NORMALIZE_CLASS,
  NORMALIZE_STYLE,
  NORMALIZE_PROPS,
  GUARD_REACTIVE_PROPS,
])

/**
 * 获取 helper 调用的常量类型（递归穿透）
 *
 * 对于可提升的 helper 调用（如 normalizeProps），
 * 递归检查参数表达式的常量类型。
 *
 * @example
 *   normalizeProps({ class: 'foo' }) → CAN_STRINGIFY（参数是静态对象）
 *   normalizeProps(guardReactiveProps(exp)) → 取决于 exp 的类型
 */
function getConstantTypeOfHelperCall(
  value: CallExpression,
  context: TransformContext,
): ConstantTypes {
  if (
    value.type === NodeTypes.JS_CALL_EXPRESSION &&
    !isString(value.callee) &&
    allowHoistedHelperSet.has(value.callee)
  ) {
    const arg = value.arguments[0] as JSChildNode
    if (arg.type === NodeTypes.SIMPLE_EXPRESSION) {
      return getConstantType(arg, context)
    } else if (arg.type === NodeTypes.JS_CALL_EXPRESSION) {
      // 嵌套 helper，如 normalizeProps(guardReactiveProps(exp))
      return getConstantTypeOfHelperCall(arg, context)
    }
  }
  return ConstantTypes.NOT_CONSTANT
}

/**
 * 获取生成 props 的常量类型
 *
 * 分析 codegenNode.props 对象中所有 key 和 value 的常量类型。
 * 取最低的作为整体的常量类型。
 */
function getGeneratedPropsConstantType(
  node: PlainElementNode,
  context: TransformContext,
): ConstantTypes {
  let returnType = ConstantTypes.CAN_STRINGIFY
  const props = getNodeProps(node)

  if (props && props.type === NodeTypes.JS_OBJECT_EXPRESSION) {
    const { properties } = props
    for (let i = 0; i < properties.length; i++) {
      const { key, value } = properties[i]

      // key 的常量类型
      const keyType = getConstantType(key, context)
      if (keyType === ConstantTypes.NOT_CONSTANT) return keyType
      if (keyType < returnType) returnType = keyType

      // value 的常量类型
      let valueType: ConstantTypes
      if (value.type === NodeTypes.SIMPLE_EXPRESSION) {
        valueType = getConstantType(value, context)
      } else if (value.type === NodeTypes.JS_CALL_EXPRESSION) {
        // 某些 helper 调用可以被提升
        valueType = getConstantTypeOfHelperCall(value, context)
      } else {
        valueType = ConstantTypes.NOT_CONSTANT
      }
      if (valueType === ConstantTypes.NOT_CONSTANT) return valueType
      if (valueType < returnType) returnType = valueType
    }
  }

  return returnType
}

/**
 * 从元素节点提取 codegenNode.props
 */
function getNodeProps(node: PlainElementNode) {
  const codegenNode = node.codegenNode!
  if (codegenNode.type === NodeTypes.VNODE_CALL) {
    return codegenNode.props
  }
}
