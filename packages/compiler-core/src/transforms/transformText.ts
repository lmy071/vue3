/**
 * transformText —— 文本节点合并与优化转换器
 *
 * ## 功能概述
 * 这个转换器做两件关键的事情：
 *
 * 1. **相邻文本合并**：将相邻的文本节点和插值表达式合并为单个复合表达式
 *    例如 `<div>abc {{ d }} {{ e }}</div>` → 单个表达式 `"abc " + _toDisplayString(d) + " " + _toDisplayString(e)`
 *
 * 2. **文本节点预转换**：将纯文本节点转换为 `createTextVNode(text)` 调用
 *    避免运行时再做文本规范化（normalization），提升首次渲染性能
 *
 * ## 合并的好处
 * - 减少 patch 时的节点数量，降低 diff 开销
 * - 为静态提升（hoistStatic）创造更大的可提升单元
 * - 文本之间的插值可以在一次操作中更新，减少 DOM 操作
 *
 * ## 设计要点
 * - 在节点退出阶段执行（所有子表达式已处理完毕）
 * - 单文本子节点的元素不做转换——运行时对此有专用快速路径
 * - 动态文本使用 PatchFlags.TEXT 标记，确保在 Block 内被正确 patch
 * - 单个空格的文本不传参数（利用 createTextVNode 的默认值节省代码体积）
 */

import type { NodeTransform } from '../transform'
import {
  type CallExpression,
  type CompoundExpressionNode,
  ConstantTypes,
  ElementTypes,
  NodeTypes,
  createCallExpression,
  createCompoundExpression,
} from '../ast'
import { isText } from '../utils'
import { CREATE_TEXT } from '../runtimeHelpers'
import { PatchFlagNames, PatchFlags } from '@vue/shared'
import { getConstantType } from './cacheStatic'

/**
 * 文本转换器 —— 合并相邻文本节点并预转换为 createTextVNode 调用
 *
 * 适用节点类型：ROOT、ELEMENT、FOR、IF_BRANCH
 * （这些是可能有子节点且需要文本优化的容器型节点）
 */
export const transformText: NodeTransform = (node, context) => {
  if (
    node.type === NodeTypes.ROOT ||
    node.type === NodeTypes.ELEMENT ||
    node.type === NodeTypes.FOR ||
    node.type === NodeTypes.IF_BRANCH
  ) {
    /**
     * 在节点退出阶段执行
     *
     * 只有所有子节点都完成处理后（表达式已解析、指令已转换），
     * 才能正确判断哪些文本是相邻的、哪些是静态/动态的。
     */
    return () => {
      const children = node.children
      let currentContainer: CompoundExpressionNode | undefined = undefined
      let hasText = false

      /**
       * 第一步：合并相邻的文本和插值节点
       *
       * 遍历 children，当发现两个连续的"类文本"节点时，
       * 将它们合并到一个 CompoundExpression 中。
       *
       * "类文本"节点 = TEXT 节点 + 插值表达式（INTERPOLATION 节点）
       *
       * 合并策略：
       * - 第一个节点成为容器（createCompoundExpression）
       * - 后续相邻的类文本节点通过 ` + ` 追加到容器中
       * - 遇到非文本节点时，关闭当前容器，开始新的搜索
       *
       * 例如处理 [TEXT("abc"), INTERPOLATION(d), TEXT(" "), INTERPOLATION(e)]：
       * → [COMPOUND(TEXT("abc"), " + ", INTERPOLATION(d), " + ", TEXT(" "), " + ", INTERPOLATION(e))]
       */
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (isText(child)) {
          hasText = true
          // 向后搜索相邻的类文本节点
          for (let j = i + 1; j < children.length; j++) {
            const next = children[j]
            if (isText(next)) {
              if (!currentContainer) {
                // 首个文本节点：创建复合表达式容器
                currentContainer = children[i] = createCompoundExpression(
                  [child],
                  child.loc,
                )
              }
              // 将下一个文本节点追加到容器中（用 ` + ` 连接）
              currentContainer.children.push(` + `, next)
              // 从 children 中移除已合并的节点
              children.splice(j, 1)
              j--
            } else {
              // 遇到非文本节点：关闭当前容器
              currentContainer = undefined
              break
            }
          }
        }
      }

      /**
       * 跳过条件：无需做文本转换的情况
       *
       * 条件 A：没有任何文本节点（hasText === false）
       * 条件 B：整个容器只有一个文本子节点
       *   - ROOT 级别：运行时始终做规范化，不需要预转换
       *   - ELEMENT 级别且满足以下全部条件：
       *     1. 是原生 HTML 元素（非组件）
       *     2. 没有自定义指令（自定义指令可能动态增删 DOM 节点，#3756）
       *     3. 非 compat 模式下的 `<template>` 标签
       *     → 运行时直接用 textContent 设置，有专用快速路径
       */
      if (
        !hasText ||
        (children.length === 1 &&
          (node.type === NodeTypes.ROOT ||
            (node.type === NodeTypes.ELEMENT &&
              node.tagType === ElementTypes.ELEMENT &&
              // #3756 自定义指令可能在运行时任意添加 DOM 元素
              // 此时不能直接设 textContent，否则可能覆盖用户通过指令添加的元素
              !node.props.find(
                p =>
                  p.type === NodeTypes.DIRECTIVE &&
                  !context.directiveTransforms[p.name],
              ) &&
              // compat 模式下 <template> 渲染为 Fragment
              // 其子节点必须转为 vnode 而不是设置 textContent
              !(__COMPAT__ && node.tag === 'template'))))
      ) {
        return
      }

      /**
       * 第二步：将文本节点预转换为 createTextVNode 调用
       *
       * 避免运行时再做文本规范化——
       * 原本运行时要检查每个 child 是否为文本，再调用 createTextVNode，
       * 现在编译阶段直接生成调用代码。
       *
       * 对于动态文本（非 CONSTANT），附加 PatchFlags.TEXT 标记：
       *   - 在 Block 的 dynamicChildren 中，运行时能正确 patch 动态文本
       *   - 静态文本不需要 flag，可以被静态提升优化
       */
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (isText(child) || child.type === NodeTypes.COMPOUND_EXPRESSION) {
          const callArgs: CallExpression['arguments'] = []

          // createTextVNode 默认参数是单个空格 `' '`
          // 如果文本内容恰好是单个空格，传空参数可节省代码体积
          if (child.type !== NodeTypes.TEXT || child.content !== ' ') {
            callArgs.push(child)
          }

          /**
           * 动态文本的 PatchFlags 标记
           *
           * 通过 getConstantType 判断文本是否为常量：
           * - CONSTANT / CAN_HOIST：纯静态文本，不含动态内容，不需要 flag
           * - NOT_CONSTANT：包含动态内容（如插值），需要 TEXT patch flag
           *
           * TEXT patch flag 的作用：
           *   运行时在 patchBlockChildren 中，只有带此 flag 的节点才会被
           *   放入 dynamicChildren 数组，从而被正确地 diff 和更新。
           */
          if (
            !context.ssr &&
            getConstantType(child, context) === ConstantTypes.NOT_CONSTANT
          ) {
            callArgs.push(
              PatchFlags.TEXT +
                (__DEV__ ? ` /* ${PatchFlagNames[PatchFlags.TEXT]} */` : ``),
            )
          }

          // 替换子节点为 TEXT_CALL 类型
          // codegenNode 保存 createTextVNode 调用的 AST
          children[i] = {
            type: NodeTypes.TEXT_CALL,
            content: child,
            loc: child.loc,
            codegenNode: createCallExpression(
              context.helper(CREATE_TEXT),
              callArgs,
            ),
          }
        }
      }
    }
  }
}
