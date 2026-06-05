/**
 * vOnce 转换器 —— v-once 指令的编译时转换
 *
 * ## 功能概述
 * v-once 是 Vue 3 中的一个内置指令，用于标记元素或组件只渲染一次。
 * 当元素/组件被标记为 v-once 后，它及其所有子节点在初始渲染后会被视为静态内容。
 * 后续的响应式数据变化不会触发这些节点的重新渲染，从而显著提升更新性能。
 *
 * ## 工作原理
 * 1. 在编译阶段，该转换器识别带有 v-once 指令的元素节点
 * 2. 通过 codegen 缓存机制（context.cache），将 vnode 创建代码包裹为缓存调用
 * 3. 运行时首次渲染时创建 vnode 并缓存；后续更新直接从缓存中取出，跳过 diff 和 patch
 *
 * ## 设计要点
 * - 使用 WeakSet 防止同一个节点被重复处理（AST 转换可能多次访问同一节点）
 * - 通过 context.inVOnce 标志位，使子节点的转换器感知当前处于 v-once 上下文中
 * - 嵌套 v-once 只会生效最外层，内部嵌套的 v-once 会被忽略
 * - SSR 模式下跳过 v-once 处理（服务端渲染不需要缓存优化）
 * - 后置回调（return 返回的函数）在子节点全部处理完毕后执行，完成缓存包裹
 */

import type { NodeTransform } from '../transform'
import { findDir } from '../utils'
import { type ElementNode, type ForNode, type IfNode, NodeTypes } from '../ast'
import { SET_BLOCK_TRACKING } from '../runtimeHelpers'

/**
 * 用于追踪已经处理过的 AST 节点的 WeakSet
 *
 * 为什么用 WeakSet？
 * - WeakSet 中的引用是弱引用，不会阻止垃圾回收
 * - 当 AST 节点不再被其他部分引用时，可以自动从 WeakSet 中清除，避免内存泄漏
 * - 这里只需要判断"是否已处理过"，不需要遍历或计数，WeakSet 的语义刚好匹配
 */
const seen = new WeakSet()

/**
 * v-once 指令的节点转换器
 *
 * 这是一个标准的 NodeTransform 函数，在 Vue 编译器的转换阶段被调用。
 * 它同时使用了进入阶段（函数体）和退出阶段（返回的回调函数）：
 *
 * 【进入阶段】（函数体）：
 *   检测节点是否带有 v-once 指令，设置上下文标志位
 *
 * 【退出阶段】（返回的函数）：
 *   在所有子节点处理完毕后，用 context.cache() 包裹 codegenNode
 *
 * @param node     - 当前正在转换的 AST 节点
 * @param context  - 转换上下文，提供辅助方法注册、状态管理等能力
 * @returns 一个后置回调函数（退出阶段执行），或 undefined（无需退出处理）
 */
export const transformOnce: NodeTransform = (node, context) => {
  // ============================================================
  // 进入阶段：检测并标记 v-once 上下文
  // ============================================================

  /**
   * 筛选条件：
   * 1. node.type === NodeTypes.ELEMENT  —— 只处理普通元素节点
   *    （组件、slot、template 等不需要 v-once 转换）
   * 2. findDir(node, 'once', true)       —— 查找节点上是否有 v-once 指令
   *    （第三个参数 true 表示在指令被移除前查找，因为后续步骤可能已经消费了该指令）
   */
  if (node.type === NodeTypes.ELEMENT && findDir(node, 'once', true)) {
    /**
     * 三重守卫：以下任一条件满足时跳过处理
     *
     * 1. seen.has(node)       —— 该节点已经被处理过（AST 走訪可能重复）
     * 2. context.inVOnce      —— 当前已处于父级 v-once 的作用域内
     *    嵌套的 v-once 被忽略，因为外层已经保证了只渲染一次，
     *    内层的缓存是多余的。这避免了不必要的运行时开销。
     * 3. context.inSSR        —— 服务端渲染模式下跳过
     *    SSR 输出的是字符串，不存在客户端更新场景，v-once 没有收益
     */
    if (seen.has(node) || context.inVOnce || context.inSSR) {
      return
    }

    // 标记该节点已被处理，防止后续重复访问
    seen.add(node)

    /**
     * 设置上下文标志位 context.inVOnce = true
     *
     * 这个标志位会影响所有子节点的转换行为：
     * - 子节点中的 v-once 会被上面的守卫条件跳过
     * - 子节点可能利用此标志位做特殊处理（如跳过不必要的响应式绑定）
     *
     * 这相当于建立了一个"v-once 作用域"，作用域内的所有内容都是静态的
     */
    context.inVOnce = true

    /**
     * 注册 SET_BLOCK_TRACKING 运行时辅助函数
     *
     * SET_BLOCK_TRACKING 是 Vue 运行时的一个内部函数，用于：
     * - 标记当前正在创建的 vnode 树属于某个"块"（Block）
     * - 块追踪（Block Tracking）是 Vue 3 的编译优化策略之一，
     *   将动态节点收集到块的 dynamicChildren 数组中，
     *   使得更新时只需要遍历动态节点，跳过静态内容
     * - 在 v-once 模式下，整个子树都是静态的，
     *   SET_BLOCK_TRACKING 确保运行时正确处理这种静态子树的追踪状态
     */
    context.helper(SET_BLOCK_TRACKING)

    // ============================================================
    // 退出阶段：包裹缓存调用
    // ============================================================
    return () => {
      /**
       * 恢复上下文标志位
       *
       * 退出当前 v-once 作用域，后续的兄弟节点不再受 v-once 影响
       */
      context.inVOnce = false

      /**
       * 获取当前节点（退出阶段的 currentNode 即当前节点自身）
       *
       * 类型断言为 ElementNode | IfNode | ForNode：
       *   v-once 可能出现在这些结构节点上，
       *   其 codegenNode 是最终生成渲染代码的节点
       */
      const cur = context.currentNode as ElementNode | IfNode | ForNode

      /**
       * 用 context.cache() 包裹 codegenNode
       *
       * 只有 codegenNode 存在时才执行缓存包裹：
       * - 某些节点（如空的 template 标签）可能没有 codegenNode
       * - 跳过包裹不会产生副作用
       */
      if (cur.codegenNode) {
        /**
         * context.cache(expr, isVNode, inVOnce) 的参数说明：
         *
         * @param expr     - 要被缓存的表达式（这里是 codegenNode）
         * @param isVNode  - true: 缓存的是一个 vnode 对象，而非普通值
         *                   运行时调用 setBlockTracking(-1) 后再创建缓存，
         *                   确保缓存的 vnode 不会被追踪为动态节点
         * @param inVOnce  - true: 表明这是在 v-once 作用域内创建的缓存
         *                   用于运行时的特殊处理和 devtools 调试信息
         *
         * 生成的代码大致为：
         *   _cache[0] || (
         *     _cache[0] = (
         *       _setBlockTracking(-1),
         *       createVNode(...),
         *       _setBlockTracking(1),
         *       _cache[0]
         *     )
         *   )
         *
         * 运行时逻辑：
         * 1. 首次渲染：缓存为空 → 创建 vnode → 存入缓存 → 返回 vnode
         * 2. 后续更新：缓存命中 → 直接返回缓存的 vnode → 跳过 diff 和 patch
         */
        cur.codegenNode = context.cache(
          cur.codegenNode,
          true /* isVNode */,
          true /* inVOnce */,
        )
      }
    }
  }
}
