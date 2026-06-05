/**
 * vMemo 转换器 —— v-memo 指令的编译时转换
 *
 * ## 功能概述
 * v-memo 是 Vue 3.2+ 引入的性能优化指令。它接收一个依赖数组表达式，
 * 只有当依赖项发生变化时，才会重新渲染该子树。
 * 如果依赖项没有变化，则跳过整个子树的 vnode 创建和 diff 过程，
 * 直接复用上次的渲染结果。这比 v-once 更灵活——v-once 是"永不更新"，
 * 而 v-memo 是"条件更新"。
 *
 * ## 工作原理
 * 1. 编译阶段：识别带 v-memo 的元素，将 codegenNode 包裹为 WITH_MEMO 运行时调用
 * 2. 运行时：首次渲染创建 vnode 并缓存；更新时先检查 memo 依赖是否变化
 *    - 依赖不变 → 直接返回缓存的 vnode，跳过子树的所有操作
 *    - 依赖变化 → 重新创建 vnode 并更新缓存
 *
 * ## 使用示例
 * ```html
 * <!-- 仅当 list 长度变化时才更新 -->
 * <div v-memo="[list.length]">
 *   <p v-for="item in list">{{ item }}</p>
 * </div>
 * ```
 *
 * ## 设计要点
 * - 与 v-once 类似，使用 WeakSet 防止重复处理
 * - SSR 模式下同样跳过（服务端无缓存收益）
 * - 非组件子树会被转换为 Block，以支持块级缓存优化
 * - 生成的 WITH_MEMO 调用包含：依赖表达式、渲染函数、缓存索引
 */

import type { NodeTransform } from '../transform'
import { findDir } from '../utils'
import {
  ElementTypes,
  type MemoExpression,
  NodeTypes,
  type PlainElementNode,
  convertToBlock,
  createCallExpression,
  createFunctionExpression,
} from '../ast'
import { WITH_MEMO } from '../runtimeHelpers'

/**
 * 用于追踪已处理节点的 WeakSet（与 vOnce 相同的模式）
 */
const seen = new WeakSet()

/**
 * v-memo 指令的节点转换器
 *
 * 采用与 transformOnce 相同的进入/退出两阶段模式：
 * 【进入阶段】检测 v-memo 指令并标记节点
 * 【退出阶段】用 WITH_MEMO 包裹 codegenNode
 */
export const transformMemo: NodeTransform = (node, context) => {
  // 只处理元素节点
  if (node.type === NodeTypes.ELEMENT) {
    // 查找 v-memo 指令
    const dir = findDir(node, 'memo')

    /**
     * 三重守卫：以下条件任一满足则跳过
     * 1. !dir           —— 节点上没有 v-memo 指令
     * 2. seen.has(node) —— 节点已被处理过
     * 3. context.inSSR  —— SSR 模式无需缓存优化
     */
    if (!dir || seen.has(node) || context.inSSR) {
      return
    }

    // 标记已处理
    seen.add(node)

    // ============================================================
    // 退出阶段：生成 WITH_MEMO 调用
    // ============================================================
    return () => {
      /**
       * 获取 codegenNode
       *
       * 优先使用 node.codegenNode，如果不存在（某些 AST 结构下
       * codegenNode 可能在父上下文中），则从 context.currentNode 获取
       */
      const codegenNode =
        node.codegenNode ||
        (context.currentNode as PlainElementNode).codegenNode

      // 仅当 codegenNode 存在且为 VNODE_CALL 类型时才处理
      if (codegenNode && codegenNode.type === NodeTypes.VNODE_CALL) {
        /**
         * 非组件子树需要转换为 Block
         *
         * Block 是 Vue 3 编译优化的核心数据结构：
         * - 它维护一个 dynamicChildren 数组，只追踪动态子节点
         * - v-memo 缓存的是整个 Block，更新时需要能快速比对
         * - 组件自身已经有自己的渲染逻辑，不需要在这里转 Block
         */
        if (node.tagType !== ElementTypes.COMPONENT) {
          convertToBlock(codegenNode, context)
        }

        /**
         * 生成 WITH_MEMO 运行时调用
         *
         * 生成的代码大致为：
         *   _withMemo([dep1, dep2], () => (...vnode创建...), _cache, 0)
         *
         * 参数说明：
         * @param dir.exp!
         *   用户传入的依赖表达式，如 [list.length]
         *
         * @param createFunctionExpression(undefined, codegenNode)
         *   将 codegenNode 包裹为一个无参函数表达式
         *   这个函数在依赖变化时才被调用，实现"按需渲染"
         *
         * @param `_cache`
         *   缓存的引用标识符，指向组件的 _cache 数组
         *
         * @param String(context.cached.length)
         *   当前缓存槽位索引（转为字符串传入）
         *   每个 v-memo 占用一个独立的缓存槽位
         */
        node.codegenNode = createCallExpression(context.helper(WITH_MEMO), [
          dir.exp!,
          createFunctionExpression(undefined, codegenNode),
          `_cache`,
          String(context.cached.length),
        ]) as MemoExpression

        /**
         * 增加缓存计数
         *
         * context.cached 是组件级别的缓存槽位数组
         * 每次 push(null) 预占一个槽位，确保每个 v-memo 有独立的缓存空间
         */
        context.cached.push(null)
      }
    }
  }
}
