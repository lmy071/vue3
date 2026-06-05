/**
 * vFor 转换器 —— v-for 指令的编译时转换
 *
 * ## 功能概述
 * v-for 是 Vue 的列表渲染指令。在编译阶段，v-for 被转换为基于 renderList 的
 * 渲染函数调用，处理迭代源、key 管理、Fragment 包装、v-memo 集成等。
 *
 * ## 转换流程
 * 1. 解析 v-for 表达式（"item in list" → source, value, key, index）
 * 2. 创建 ForNode 替换原节点
 * 3. 进入阶段：创建 renderList 调用框架
 * 4. 退出阶段：根据子节点结构生成具体的 childBlock 代码
 *
 * ## Fragment 类型
 * - STABLE_FRAGMENT：source 是常量，不需要 key diff
 * - KEYED_FRAGMENT：有 key 属性，支持高效 DOM 复用
 * - UNKEYED_FRAGMENT：无 key，简单就地更新
 */

import {
  type NodeTransform,
  type TransformContext,
  createStructuralDirectiveTransform,
} from '../transform'
import {
  type BlockCodegenNode,
  ConstantTypes,
  type DirectiveNode,
  type ElementNode,
  type ExpressionNode,
  type ForCodegenNode,
  type ForIteratorExpression,
  type ForNode,
  type ForParseResult,
  type ForRenderListExpression,
  NodeTypes,
  type PlainElementNode,
  type RenderSlotCall,
  type SimpleExpressionNode,
  type SlotOutletNode,
  type VNodeCall,
  createBlockStatement,
  createCallExpression,
  createCompoundExpression,
  createFunctionExpression,
  createObjectExpression,
  createObjectProperty,
  createSimpleExpression,
  createVNodeCall,
  getVNodeBlockHelper,
  getVNodeHelper,
} from '../ast'
import { ErrorCodes, createCompilerError } from '../errors'
import {
  findDir,
  findProp,
  injectProp,
  isSlotOutlet,
  isTemplateNode,
} from '../utils'
import {
  FRAGMENT,
  IS_MEMO_SAME,
  OPEN_BLOCK,
  RENDER_LIST,
} from '../runtimeHelpers'
import { processExpression } from './transformExpression'
import { validateBrowserExpression } from '../validateExpression'
import { PatchFlags } from '@vue/shared'

/**
 * v-for 节点转换器
 *
 * 使用 createStructuralDirectiveTransform 创建，
 * 这意味着它是结构型指令（会改变 DOM 结构）。
 * 处理分为三个阶段：
 *   进入阶段：创建 ForNode 和 renderList 框架
 *   退出阶段：生成完整的迭代代码（childBlock + key + memo）
 */
export const transformFor: NodeTransform = createStructuralDirectiveTransform(
  'for',
  (node, dir, context) => {
    const { helper, removeHelper } = context
    return processFor(node, dir, context, forNode => {
      // ============================================================
      // 进入阶段：创建 renderList 调用框架
      // ============================================================

      /**
       * 创建 renderList(source, iterator) 调用表达式
       *
       * 此时只传入 source，iterator 在退出阶段补充（需要等子节点处理完毕）
       */
      const renderExp = createCallExpression(helper(RENDER_LIST), [
        forNode.source,
      ]) as ForRenderListExpression

      const isTemplate = isTemplateNode(node)

      // 检查是否有 v-memo 指令（与 v-for 配合使用）
      const memo = findDir(node, 'memo')

      // 提取 key 表达式
      const keyProp = findProp(node, `key`, false, true)
      const isDirKey = keyProp && keyProp.type === NodeTypes.DIRECTIVE
      let keyExp =
        keyProp &&
        (keyProp.type === NodeTypes.ATTRIBUTE
          ? keyProp.value
            ? createSimpleExpression(keyProp.value.content, true)
            : undefined
          : keyProp.exp)
      const keyProperty = keyExp ? createObjectProperty(`key`, keyExp) : null

      /**
       * 模板形式的 v-for 特殊处理
       *
       * #2085 / #5288：`<template v-for>` 上的 :key 和 v-memo 需要在此处理。
       * 因为对于 template v-for，原始节点会被丢弃而不被遍历，
       * 所以其绑定表达式不会被常规的 transform 处理到。
       */
      if (!__BROWSER__) {
        if (isTemplate && memo) {
          memo.exp = processExpression(
            memo.exp! as SimpleExpressionNode,
            context,
          )
        }
        if ((isTemplate || memo) && keyProperty && isDirKey) {
          keyExp = keyProp.exp = keyProperty.value =
            processExpression(
              keyProperty.value as SimpleExpressionNode,
              context,
            )
        }
      }

      /**
       * Fragment 稳定性判断
       *
       * isStableFragment：
       *   source 是简单表达式且 constType > NOT_CONSTANT
       *   → 列表长度和内容都不会变化 → STABLE_FRAGMENT
       *
       * 不稳定时根据是否有 key 决定：
       *   - 有 key → KEYED_FRAGMENT
       *   - 无 key → UNKEYED_FRAGMENT
       */
      const isStableFragment =
        forNode.source.type === NodeTypes.SIMPLE_EXPRESSION &&
        forNode.source.constType > ConstantTypes.NOT_CONSTANT
      const fragmentFlag = isStableFragment
        ? PatchFlags.STABLE_FRAGMENT
        : keyProp
          ? PatchFlags.KEYED_FRAGMENT
          : PatchFlags.UNKEYED_FRAGMENT

      /**
       * 创建 v-for 的 codegenNode（Fragment vnode 调用）
       *
       * 参数说明：
       * - tag: FRAGMENT（Symbol）
       * - props: undefined（key 通过 injectProp 注入）
       * - children: renderExp（renderList 调用）
       * - patchFlag: fragmentFlag
       * - isBlock: true
       * - disableTracking: 非稳定 Fragment 时禁用动态追踪
       */
      forNode.codegenNode = createVNodeCall(
        context,
        helper(FRAGMENT),
        undefined,
        renderExp,
        fragmentFlag,
        undefined,
        undefined,
        true /* isBlock */,
        !isStableFragment /* disableTracking */,
        false /* isComponent */,
        node.loc,
      ) as ForCodegenNode

      // ============================================================
      // 退出阶段：生成迭代代码
      // ============================================================
      return () => {
        let childBlock: BlockCodegenNode
        const { children } = forNode

        /**
         * 开发模式检查：<template v-for> 的 key 应该放在 template 上
         * 而非放在内部的元素上
         */
        if ((__DEV__ || !__BROWSER__) && isTemplate) {
          node.children.some(c => {
            if (c.type === NodeTypes.ELEMENT) {
              const key = findProp(c, 'key')
              if (key) {
                context.onError(
                  createCompilerError(
                    ErrorCodes.X_V_FOR_TEMPLATE_KEY_PLACEMENT,
                    key.loc,
                  ),
                )
                return true
              }
            }
          })
        }

        /**
         * 判断是否需要 Fragment 包装
         *
         * 需要 Fragment 的情况：
         * - children.length !== 1（多个子节点）
         * - 唯一子节点不是 ELEMENT（文本、插值等）
         */
        const needFragmentWrapper =
          children.length !== 1 || children[0].type !== NodeTypes.ELEMENT

        /**
         * Slot Outlet 检查
         *
         * `<slot v-for="...">` → 直接使用 slot 的 codegenNode
         * `<template v-for="..."><slot/></template>` → 同上
         */
        const slotOutlet = isSlotOutlet(node)
          ? node
          : isTemplate &&
              node.children.length === 1 &&
              isSlotOutlet(node.children[0])
            ? (node.children[0] as SlotOutletNode)
            : null

        if (slotOutlet) {
          // slot 的 v-for：直接使用 renderSlot 调用结果
          childBlock = slotOutlet.codegenNode as RenderSlotCall
          if (isTemplate && keyProperty) {
            // template 上的 key 需要注入到 renderSlot 的第 3 个参数中
            injectProp(childBlock, keyProperty, context)
          }
        } else if (needFragmentWrapper) {
          /**
           * 多子节点或非元素子节点：为每个迭代项创建 Fragment Block
           *
           * `<template v-for="...">` 中包含文本或多个元素时，
           * 每次循环需要把内容包装为一个独立的 Fragment。
           */
          childBlock = createVNodeCall(
            context,
            helper(FRAGMENT),
            keyProperty ? createObjectExpression([keyProperty]) : undefined,
            node.children,
            PatchFlags.STABLE_FRAGMENT,
            undefined,
            undefined,
            true,
            undefined,
            false /* isComponent */,
          )
        } else {
          /**
           * 单个元素 v-for：直接使用子元素的 codegenNode
           *
           * 这是最常见的场景。只需标记为 Block 并注入 key 即可。
           */
          childBlock = (children[0] as PlainElementNode).codegenNode as VNodeCall

          if (isTemplate && keyProperty) {
            injectProp(childBlock, keyProperty, context)
          }

          /**
           * Block 状态切换
           *
           * 根据稳定性决定使用 Block 还是普通 VNode：
           * - 稳定 Fragment：使用普通 VNode（跳过动态追踪）
           * - 不稳定 Fragment：使用 Block（需要动态 diff）
           *
           * 切换时需要清理旧 helper、注册新 helper
           */
          if (childBlock.isBlock !== !isStableFragment) {
            if (childBlock.isBlock) {
              // 从 Block 切换到 VNode：移除 Block helper
              removeHelper(OPEN_BLOCK)
              removeHelper(
                getVNodeBlockHelper(context.inSSR, childBlock.isComponent),
              )
            } else {
              // 从 VNode 切换到 Block：移除 VNode helper
              removeHelper(
                getVNodeHelper(context.inSSR, childBlock.isComponent),
              )
            }
          }
          childBlock.isBlock = !isStableFragment

          if (childBlock.isBlock) {
            helper(OPEN_BLOCK)
            helper(getVNodeBlockHelper(context.inSSR, childBlock.isComponent))
          } else {
            helper(getVNodeHelper(context.inSSR, childBlock.isComponent))
          }
        }

        /**
         * v-memo 集成
         *
         * 当 v-for 与 v-memo 一起使用时，为每个迭代项创建缓存。
         * 生成的代码大致为：
         * ```
         * renderList(source, (_item, _key, _index, _cached) => {
         *   const _memo = (memo表达式)
         *   if (_cached && _cached.key === _key && isMemoSame(_cached, _memo))
         *     return _cached
         *   const _item = (childBlock)
         *   _item.memo = _memo
         *   return _item
         * })
         * ```
         */
        if (memo) {
          const loop = createFunctionExpression(
            createForLoopParams(forNode.parseResult, [
              createSimpleExpression(`_cached`),
            ]),
          )
          loop.body = createBlockStatement([
            // 计算 memo 依赖
            createCompoundExpression([`const _memo = (`, memo.exp!, `)`]),
            // 缓存命中检查：存在且 key 匹配且依赖未变
            createCompoundExpression([
              `if (_cached`,
              ...(keyExp ? [` && _cached.key === `, keyExp] : []),
              ` && ${context.helperString(IS_MEMO_SAME)}(_cached, _memo)) return _cached`,
            ]),
            // 缓存未命中：创建新项
            createCompoundExpression([`const _item = `, childBlock as any]),
            // 在新项上记录 memo 依赖
            createSimpleExpression(`_item.memo = _memo`),
            createSimpleExpression(`return _item`),
          ])
          renderExp.arguments.push(
            loop as ForIteratorExpression,
            createSimpleExpression(`_cache`),
            createSimpleExpression(String(context.cached.length)),
          )
          context.cached.push(null)
        } else {
          // 无 memo：简单的迭代函数
          renderExp.arguments.push(
            createFunctionExpression(
              createForLoopParams(forNode.parseResult),
              childBlock,
              true /* force newline */,
            ) as ForIteratorExpression,
          )
        }
      }
    })
  },
)

/**
 * v-for 的通用处理函数
 *
 * 解析 v-for 表达式，创建 ForNode，管理作用域变量。
 * 客户端和 SSR 共用此函数。
 *
 * @param node          - 原始元素节点
 * @param dir           - v-for 指令节点
 * @param context       - 转换上下文
 * @param processCodegen - 可选的代码生成回调（客户端需要，SSR 可能不需要）
 */
export function processFor(
  node: ElementNode,
  dir: DirectiveNode,
  context: TransformContext,
  processCodegen?: (forNode: ForNode) => (() => void) | undefined,
): (() => void) | undefined {
  // 校验：必须有表达式
  if (!dir.exp) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_FOR_NO_EXPRESSION, dir.loc),
    )
    return
  }

  // 获取解析结果（由解析器填写的 forParseResult）
  const parseResult = dir.forParseResult

  if (!parseResult) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_FOR_MALFORMED_EXPRESSION, dir.loc),
    )
    return
  }

  // 最终化解析结果（处理表达式，验证浏览器表达式）
  finalizeForParseResult(parseResult, context)

  const { addIdentifiers, removeIdentifiers, scopes } = context
  const { source, value, key, index } = parseResult

  /**
   * 创建 ForNode
   *
   * template 节点：子节点是 template 的 children
   * 普通元素：子节点只包含元素自身（单个）
   */
  const forNode: ForNode = {
    type: NodeTypes.FOR,
    loc: dir.loc,
    source,
    valueAlias: value,
    keyAlias: key,
    objectIndexAlias: index,
    parseResult,
    children: isTemplateNode(node) ? node.children : [node],
  }

  // 用 ForNode 替换原始节点（改变 AST 结构）
  context.replaceNode(forNode)

  // ============================================================
  // 作用域管理
  // ============================================================

  // 记录 v-for 作用域深度
  scopes.vFor++

  if (!__BROWSER__ && context.prefixIdentifiers) {
    /**
     * 向上下文注入 v-for 的作用域变量标识符
     *
     * 这确保了在子节点的 transformExpression 中，
     * 迭代变量不会被添加前缀（它们应该保持原始名称）。
     */
    value && addIdentifiers(value)
    key && addIdentifiers(key)
    index && addIdentifiers(index)
  }

  // 调用代码生成回调（客户端模式）
  const onExit = processCodegen && processCodegen(forNode)

  /**
   * 退出回调：清理作用域
   */
  return (): void => {
    scopes.vFor--
    if (!__BROWSER__ && context.prefixIdentifiers) {
      value && removeIdentifiers(value)
      key && removeIdentifiers(key)
      index && removeIdentifiers(index)
    }
    if (onExit) onExit()
  }
}

/**
 * 最终化 v-for 解析结果
 *
 * 对 source、value、key、index 表达式进行处理：
 * - 非浏览器构建：processExpression 做前缀转换
 * - 浏览器构建：validateBrowserExpression 做安全性验证
 * - 标记为已处理（finalized），防止重复处理
 */
export function finalizeForParseResult(
  result: ForParseResult,
  context: TransformContext,
): void {
  if (result.finalized) return

  if (!__BROWSER__ && context.prefixIdentifiers) {
    // source 不需要做前缀转换（因为它是"源"而非"标识符"）
    result.source = processExpression(
      result.source as SimpleExpressionNode,
      context,
    )
    // key、index、value 是标识符，做前缀转换
    if (result.key) {
      result.key = processExpression(
        result.key as SimpleExpressionNode,
        context,
        true,
      )
    }
    if (result.index) {
      result.index = processExpression(
        result.index as SimpleExpressionNode,
        context,
        true,
      )
    }
    if (result.value) {
      result.value = processExpression(
        result.value as SimpleExpressionNode,
        context,
        true,
      )
    }
  }

  // 浏览器构建：验证表达式安全性
  if (__DEV__ && __BROWSER__) {
    validateBrowserExpression(result.source as SimpleExpressionNode, context)
    if (result.key) {
      validateBrowserExpression(result.key as SimpleExpressionNode, context, true)
    }
    if (result.index) {
      validateBrowserExpression(result.index as SimpleExpressionNode, context, true)
    }
    if (result.value) {
      validateBrowserExpression(result.value as SimpleExpressionNode, context, true)
    }
  }

  result.finalized = true
}

/**
 * 创建 v-for 循环函数的参数列表
 *
 * 参数顺序：[value, key, index, ...memoArgs]
 * 尾部 undefined 被截断，剩余的 undefined 用 `_` 占位填充
 *
 * @example
 *   { value: 'item', key: undefined, index: 'i' }
 *   → ['item', '_', 'i']
 */
export function createForLoopParams(
  { value, key, index }: ForParseResult,
  memoArgs: ExpressionNode[] = [],
): ExpressionNode[] {
  return createParamsList([value, key, index, ...memoArgs])
}

/**
 * 创建参数列表（截断尾随 undefined + 占位填充）
 *
 * @example
 *   ['a', undefined, 'c'] → ['a', '_', 'c']
 *   ['a', undefined, undefined] → ['a']
 */
function createParamsList(
  args: (ExpressionNode | undefined)[],
): ExpressionNode[] {
  let i = args.length
  // 从尾部截断 undefined
  while (i--) {
    if (args[i]) break
  }
  return args
    .slice(0, i + 1)
    .map((arg, i) => arg || createSimpleExpression(`_`.repeat(i + 1), false))
}
