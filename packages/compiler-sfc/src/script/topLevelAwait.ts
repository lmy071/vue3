/**
 * topLevelAwait.ts —— 顶层 await 转换
 *
 * ## 功能概述
 * 将 `<script setup>` 中的顶层 await 表达式转换为 withAsyncContext() 包装。
 *
 * ## 背景
 * Vue 3.3+ 支持 `<script setup>` 中使用顶层 await。
 * 需要保持 `getCurrentInstance()` 等上下文 API 在 await 前后的正确性。
 *
 * ## 转换规则
 *
 * **语句形式**（无赋值）：
 * ```
 * // 输入       await foo()
 * // 输出
 * ;([__temp,__restore] = withAsyncContext(() => foo())),
 *   await __temp,
 *   __restore()
 * ```
 *
 * **表达式形式**（有赋值）：
 * ```
 * // 输入       const a = await foo()
 * // 输出
 * const a = (
 *   ([__temp, __restore] = withAsyncContext(() => foo())),
 *   __temp = await __temp,
 *   __restore(),
 *   __temp
 * )
 * ```
 *
 * ## 未来方向
 * Async Context 提案（tc39/proposal-async-context）标准化后可能不再需要此转换。
 */

import type { AwaitExpression } from '@babel/types'
import type { ScriptCompileContext } from './context'

export function processAwait(
  ctx: ScriptCompileContext,
  node: AwaitExpression,
  needSemi: boolean,
  isStatement: boolean,
): void {
  // 处理括号包裹的 await 参数（如 await (foo())）
  const argumentStart =
    node.argument.extra && node.argument.extra.parenthesized
      ? (node.argument.extra.parenStart as number)
      : node.argument.start!

  const startOffset = ctx.startOffset!
  const argumentStr = ctx.descriptor.source.slice(
    argumentStart + startOffset,
    node.argument.end! + startOffset,
  )

  // 检测参数中是否有嵌套 await → 需要 async 包装
  const containsNestedAwait = /\bawait\b/.test(argumentStr)

  // 替换 await 为 withAsyncContext 包装
  ctx.s.overwrite(
    node.start! + startOffset,
    argumentStart + startOffset,
    `${needSemi ? `;` : ``}(\n  ([__temp,__restore] = ${ctx.helper(
      `withAsyncContext`,
    )}(${containsNestedAwait ? `async ` : ``}() => `,
  )
  ctx.s.appendLeft(
    node.end! + startOffset,
    `)),\n  ${isStatement ? `` : `__temp = `}await __temp,\n  __restore()${
      isStatement ? `` : `,\n  __temp`
    }\n)`,
  )
}
