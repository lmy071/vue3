/**
 * vIf 转换器 —— v-if / v-else-if / v-else 指令的编译时转换
 *
 * ## 功能概述
 * v-if 是 Vue 的条件渲染指令。在编译阶段，v-if/v-else-if/v-else 链被转换为
 * 嵌套的三元表达式（条件表达式），运行时通过条件判断决定渲染哪个分支。
 *
 * ## 转换示例
 * ```html
 * <div v-if="a">A</div>
 * <div v-else-if="b">B</div>
 * <div v-else>C</div>
 * ```
 * 编译为（伪代码）：
 * ```
 * a ? (block A with key 0) : b ? (block B with key 1) : (block C with key 2)
 * ```
 *
 * ## 设计要点
 * - 使用 createStructuralDirectiveTransform 创建（结构型指令）
 * - v-if 创建 IfNode 并替换原节点
 * - v-else-if/v-else 回找相邻 v-if，追加到其 branches 数组
 * - 每个分支生成带自动 key 的 Block（确保正确的 DOM 复用）
 * - 单元素分支直接使用子元素 codegenNode，多元素用 Fragment
 */

import {
  type NodeTransform,
  type TransformContext,
  createStructuralDirectiveTransform,
  traverseNode,
} from '../transform'
import {
  type AttributeNode,
  type BlockCodegenNode,
  type CacheExpression,
  ConstantTypes,
  type DirectiveNode,
  type ElementNode,
  ElementTypes,
  type IfBranchNode,
  type IfConditionalExpression,
  type IfNode,
  type MemoExpression,
  NodeTypes,
  type SimpleExpressionNode,
  convertToBlock,
  createCallExpression,
  createConditionalExpression,
  createObjectExpression,
  createObjectProperty,
  createSimpleExpression,
  createVNodeCall,
  locStub,
} from '../ast'
import { ErrorCodes, createCompilerError } from '../errors'
import { processExpression } from './transformExpression'
import { validateBrowserExpression } from '../validateExpression'
import { cloneLoc } from '../parser'
import { CREATE_COMMENT, FRAGMENT } from '../runtimeHelpers'
import {
  findDir,
  findProp,
  getMemoedVNodeCall,
  injectProp,
  isCommentOrWhitespace,
} from '../utils'
import { PatchFlags } from '@vue/shared'

/**
 * v-if 节点转换器
 *
 * 匹配 if、else-if、else 三个指令名称。
 * 使用 createStructuralDirectiveTransform —— 结构型指令会改变节点结构。
 */
export const transformIf: NodeTransform = createStructuralDirectiveTransform(
  /^(?:if|else|else-if)$/,
  (node, dir, context) => {
    return processIf(node, dir, context, (ifNode, branch, isRoot) => {
      /**
       * 计算分支 key 索引
       *
       * #1587：key 需要基于兄弟 IfNode 的数量动态递增。
       * 因为串联的 v-if/else 分支在 DOM 中处于同一深度，
       * 它们的 key 必须反映在整个 if/else 链中的位置。
       *
       * 向后遍历兄弟节点，统计之前出现的 IfNode 的 branches 总数。
       * 这确保了 key 在整个链中的唯一性。
       */
      const siblings = context.parent!.children
      let i = siblings.indexOf(ifNode)
      let key = 0
      while (i-- >= 0) {
        const sibling = siblings[i]
        if (sibling && sibling.type === NodeTypes.IF) {
          key += sibling.branches.length
        }
      }

      /**
       * 退出回调：所有子节点处理完毕后生成 codegenNode
       *
       * isRoot (v-if)：
       *   创建 IfNode 的顶层条件表达式
       *
       * !isRoot (v-else-if / v-else)：
       *   将当前分支的条件表达式追加到父级条件链的 alternate 位置
       */
      return () => {
        if (isRoot) {
          // v-if 根分支：创建完整的条件表达式链
          ifNode.codegenNode = createCodegenNodeForBranch(
            branch,
            key,
            context,
          ) as IfConditionalExpression
        } else {
          // v-else-if/v-else：追加到父级条件链
          const parentCondition = getParentCondition(ifNode.codegenNode!)
          parentCondition.alternate = createCodegenNodeForBranch(
            branch,
            key + ifNode.branches.length - 1, // 基于当前 branches 数量修正 key
            context,
          )
        }
      }
    })
  },
)

/**
 * v-if 的通用处理函数
 *
 * 处理 v-if、v-else-if、v-else 的语义，创建/更新 IfNode 结构。
 * 客户端和 SSR 共用此函数。
 */
export function processIf(
  node: ElementNode,
  dir: DirectiveNode,
  context: TransformContext,
  processCodegen?: (
    node: IfNode,
    branch: IfBranchNode,
    isRoot: boolean,
  ) => (() => void) | undefined,
): (() => void) | undefined {
  /**
   * 空表达式处理
   *
   * v-if/v-else-if 必须有非空表达式
   * v-else 不需要表达式（自身就是"否则"分支）
   *
   * 如果 v-if 没有表达式，用 `true` 回退（总是渲染该分支）
   */
  if (
    dir.name !== 'else' &&
    (!dir.exp || !(dir.exp as SimpleExpressionNode).content.trim())
  ) {
    const loc = dir.exp ? dir.exp.loc : node.loc
    context.onError(
      createCompilerError(ErrorCodes.X_V_IF_NO_EXPRESSION, dir.loc),
    )
    dir.exp = createSimpleExpression(`true`, false, loc)
  }

  /**
   * 非浏览器构建：对表达式做前缀转换
   *
   * v-if 的 transform 在 transformExpression 之前执行，
   * 所以需要在这里手动调用 processExpression。
   */
  if (!__BROWSER__ && context.prefixIdentifiers && dir.exp) {
    dir.exp = processExpression(dir.exp as SimpleExpressionNode, context)
  }

  // 浏览器构建：验证表达式安全性
  if (__DEV__ && __BROWSER__ && dir.exp) {
    validateBrowserExpression(dir.exp as SimpleExpressionNode, context)
  }

  if (dir.name === 'if') {
    /**
     * v-if 处理
     *
     * 1. 创建 IfBranchNode（条件分支节点）
     * 2. 创建 IfNode（if 容器节点，branches = [branch]）
     * 3. 用 IfNode 替换原节点
     */
    const branch = createIfBranch(node, dir)
    const ifNode: IfNode = {
      type: NodeTypes.IF,
      loc: cloneLoc(node.loc),
      branches: [branch],
    }
    context.replaceNode(ifNode)
    if (processCodegen) {
      return processCodegen(ifNode, branch, true) // isRoot = true
    }
  } else {
    /**
     * v-else-if / v-else 处理
     *
     * 1. 定位相邻的 v-if 节点（向前搜索）
     * 2. 移除中间的注释/空白节点
     * 3. 将当前节点作为 branch 追加到 IfNode.branches
     */

    const siblings = context.parent!.children
    const comments = []
    let i = siblings.indexOf(node)

    // 向前搜索，找到最近的 IfNode
    while (i-- >= -1) {
      const sibling = siblings[i]

      // 跳过注释和空白节点
      if (sibling && isCommentOrWhitespace(sibling)) {
        context.removeNode(sibling)
        if (__DEV__ && sibling.type === NodeTypes.COMMENT) {
          comments.unshift(sibling) // 保留注释用于 __DEV__
        }
        continue
      }

      if (sibling && sibling.type === NodeTypes.IF) {
        /**
         * 检查 v-else 后是否紧跟 v-else-if 或重复的 v-else
         *
         * 如果最后一个分支没有 condition（已经是 else 分支），
         * 再跟 v-else-if 或 v-else 就是错误用法。
         */
        if (
          (dir.name === 'else-if' || dir.name === 'else') &&
          sibling.branches[sibling.branches.length - 1].condition === undefined
        ) {
          context.onError(
            createCompilerError(ErrorCodes.X_V_ELSE_NO_ADJACENT_IF, node.loc),
          )
        }

        // 从父容器中移除当前节点
        context.removeNode()

        // 创建新分支
        const branch = createIfBranch(node, dir)

        /**
         * 将注释附加到分支开头（开发模式）
         *
         * #3619：忽略 transition 内的注释
         *   transition 组件会创建 comment anchor，这些不是用户注释
         */
        if (
          __DEV__ &&
          comments.length &&
          !(
            context.parent &&
            context.parent.type === NodeTypes.ELEMENT &&
            (context.parent.tag === 'transition' ||
              context.parent.tag === 'Transition')
          )
        ) {
          branch.children = [...comments, ...branch.children]
        }

        /**
         * 开发模式：检查重复 key
         *
         * 如果不同分支使用了相同的 key，运行时 diff 会出错。
         * 编译期检测此问题并报告。
         */
        if (__DEV__ || !__BROWSER__) {
          const key = branch.userKey
          if (key) {
            sibling.branches.forEach(({ userKey }) => {
              if (isSameKey(userKey, key)) {
                context.onError(
                  createCompilerError(
                    ErrorCodes.X_V_IF_SAME_KEY,
                    branch.userKey!.loc,
                  ),
                )
              }
            })
          }
        }

        // 将分支追加到 IfNode
        sibling.branches.push(branch)

        // 调用代码生成（isRoot = false）
        const onExit = processCodegen && processCodegen(sibling, branch, false)

        /**
         * 手动遍历该分支
         *
         * 因为当前节点已从父容器中移除，不会被正常的 AST 遍历处理到。
         * 必须手动调用 traverseNode 来转换其子节点。
         */
        traverseNode(branch, context)

        // 执行退出回调
        if (onExit) onExit()

        /**
         * 重置 currentNode
         *
         * 标记当前节点已被移除，防止后续处理报错。
         */
        context.currentNode = null
      } else {
        // 找不到相邻的 v-if → 错误
        context.onError(
          createCompilerError(ErrorCodes.X_V_ELSE_NO_ADJACENT_IF, node.loc),
        )
      }
      break
    }
  }
}

/**
 * 创建 IfBranch 节点
 *
 * @param node - 原始元素节点
 * @param dir  - v-if/v-else-if/v-else 指令
 */
function createIfBranch(node: ElementNode, dir: DirectiveNode): IfBranchNode {
  const isTemplateIf = node.tagType === ElementTypes.TEMPLATE
  return {
    type: NodeTypes.IF_BRANCH,
    loc: node.loc,
    // v-else 没有 condition，用 undefined 表示
    condition: dir.name === 'else' ? undefined : dir.exp,
    // template 且没有 v-for：使用 template 的子节点
    // 否则使用元素自身作为单个子节点
    children: isTemplateIf && !findDir(node, 'for') ? node.children : [node],
    // 记录用户指定的 key（用于重复 key 检查）
    userKey: findProp(node, `key`),
    isTemplateIf,
  }
}

/**
 * 为分支创建 codegenNode
 *
 * 有 condition (v-if / v-else-if)：
 *   生成条件表达式 `condition ? childrenNode : createCommentVNode`
 *   （createCommentVNode 是占位注释，用于补丁时的锚点）
 *
 * 无 condition (v-else)：
 *   直接生成子节点的 codegenNode
 */
function createCodegenNodeForBranch(
  branch: IfBranchNode,
  keyIndex: number,
  context: TransformContext,
): IfConditionalExpression | BlockCodegenNode | MemoExpression {
  if (branch.condition) {
    // 条件分支：三元表达式
    return createConditionalExpression(
      branch.condition,
      createChildrenCodegenNode(branch, keyIndex, context),
      // alternate 为注释 vnode（占位用）
      // asBlock: true 确保注释节点关闭当前 block 作用域
      createCallExpression(context.helper(CREATE_COMMENT), [
        __DEV__ ? '"v-if"' : '""',
        'true',
      ]),
    ) as IfConditionalExpression
  } else {
    // else 分支：直接渲染子节点
    return createChildrenCodegenNode(branch, keyIndex, context)
  }
}

/**
 * 为分支的子节点创建 codegenNode
 *
 * 三种处理路径：
 * 1. 多个子节点 → Fragment Block + key
 * 2. 单个 ForNode → 复用 ForNode 的 codegenNode + 注入 key
 * 3. 单个 Element → 使用子元素 codegenNode + convertToBlock + 注入 key
 */
function createChildrenCodegenNode(
  branch: IfBranchNode,
  keyIndex: number,
  context: TransformContext,
): BlockCodegenNode | MemoExpression {
  const { helper } = context

  // 生成的 key property：{ key: "0" } / { key: "1" } ...
  const keyProperty = createObjectProperty(
    `key`,
    createSimpleExpression(
      `${keyIndex}`,
      false,
      locStub,
      ConstantTypes.CAN_CACHE,
    ),
  )

  const { children } = branch
  const firstChild = children[0]
  const needFragmentWrapper =
    children.length !== 1 || firstChild.type !== NodeTypes.ELEMENT

  if (needFragmentWrapper) {
    if (children.length === 1 && firstChild.type === NodeTypes.FOR) {
      /**
       * 优化：子节点是 ForNode 时不额外创建 Fragment
       *
       * 因为 ForNode 本身就是 Fragment 结构，不需要双层嵌套。
       * 直接将 key 注入到 ForNode 的 codegenNode 即可。
       */
      const vnodeCall = firstChild.codegenNode!
      injectProp(vnodeCall, keyProperty, context)
      return vnodeCall
    } else {
      // 多子节点或非元素：创建 Fragment Block
      let patchFlag = PatchFlags.STABLE_FRAGMENT

      if (
        __DEV__ &&
        !branch.isTemplateIf &&
        children.filter(c => c.type !== NodeTypes.COMMENT).length === 1
      ) {
        // 开发模式：标记为 DEV_ROOT_FRAGMENT 用于 devtools
        patchFlag |= PatchFlags.DEV_ROOT_FRAGMENT
      }

      return createVNodeCall(
        context,
        helper(FRAGMENT),
        createObjectExpression([keyProperty]),
        children,
        patchFlag,
        undefined,
        undefined,
        true,
        false,
        false /* isComponent */,
        branch.loc,
      )
    }
  } else {
    // 单个元素：直接使用子元素的 codegenNode
    const ret = (firstChild as ElementNode).codegenNode as
      | BlockCodegenNode
      | MemoExpression
    const vnodeCall = getMemoedVNodeCall(ret)

    // 将 createVNode 转换为 createBlock（分支内的元素需要 Block 追踪）
    if (vnodeCall.type === NodeTypes.VNODE_CALL) {
      convertToBlock(vnodeCall, context)
    }

    // 注入分支 key
    injectProp(vnodeCall, keyProperty, context)
    return ret
  }
}

/**
 * 判断两个 key 是否相同
 *
 * 比较属性 key 和指令 key（如 :key=""）
 * 比较 value/content 是否一致
 */
function isSameKey(
  a: AttributeNode | DirectiveNode | undefined,
  b: AttributeNode | DirectiveNode,
): boolean {
  if (!a || a.type !== b.type) return false

  if (a.type === NodeTypes.ATTRIBUTE) {
    // 静态属性 key
    if (a.value!.content !== (b as AttributeNode).value!.content) return false
  } else {
    // 动态指令 key
    const exp = a.exp!
    const branchExp = (b as DirectiveNode).exp!
    if (exp.type !== branchExp.type) return false
    if (
      exp.type !== NodeTypes.SIMPLE_EXPRESSION ||
      exp.isStatic !== (branchExp as SimpleExpressionNode).isStatic ||
      exp.content !== (branchExp as SimpleExpressionNode).content
    ) return false
  }
  return true
}

/**
 * 获取条件链最底层的条件表达式
 *
 * 递归穿透 JS_CONDITIONAL_EXPRESSION 和 JS_CACHE_EXPRESSION，
 * 找到 alternate 不再是条件表达式的那个节点。
 * 这是 v-else-if 追加的位置。
 */
function getParentCondition(
  node: IfConditionalExpression | CacheExpression,
): IfConditionalExpression {
  while (true) {
    if (node.type === NodeTypes.JS_CONDITIONAL_EXPRESSION) {
      if (node.alternate.type === NodeTypes.JS_CONDITIONAL_EXPRESSION) {
        // alternate 还是条件表达式 → 继续深入
        node = node.alternate
      } else {
        // alternate 不是条件表达式 → 这就是最底层的条件节点
        return node
      }
    } else if (node.type === NodeTypes.JS_CACHE_EXPRESSION) {
      // 穿透缓存包装
      node = node.value as IfConditionalExpression
    }
  }
}
