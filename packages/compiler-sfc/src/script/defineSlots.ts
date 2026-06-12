/**
 * defineSlots.ts —— defineSlots 编译处理
 *
 * ## 功能概述
 * 处理 `<script setup>` 中的 defineSlots() 调用。
 * defineSlots 用于为作用域插槽提供类型支持。
 *
 * ## 编译行为
 * - 检测 AST 中 `defineSlots()` 调用
 * - 不接受参数（纯类型辅助宏）
 * - 如果调用处有赋值声明（如 `const slots = defineSlots<{...}>()`），
 *   整个调用被替换为 `useSlots()` 运行时调用
 * - 不允许重复调用
 */

import type { LVal, Node } from '@babel/types'
import { isCallOf } from './utils'
import type { ScriptCompileContext } from './context'

/** 编译器宏名称 */
export const DEFINE_SLOTS = 'defineSlots'

export function processDefineSlots(
  ctx: ScriptCompileContext,
  node: Node,
  declId?: LVal,
): boolean {
  if (!isCallOf(node, DEFINE_SLOTS)) {
    return false
  }
  if (ctx.hasDefineSlotsCall) {
    ctx.error(`duplicate ${DEFINE_SLOTS}() call`, node)
  }
  ctx.hasDefineSlotsCall = true

  // defineSlots 不接受运行时参数，只用于类型标注
  if (node.arguments.length > 0) {
    ctx.error(`${DEFINE_SLOTS}() cannot accept arguments`, node)
  }

  // 如果有赋值声明 → 替换为 useSlots() 运行时等价调用
  if (declId) {
    ctx.s.overwrite(
      ctx.startOffset! + node.start!,
      ctx.startOffset! + node.end!,
      `${ctx.helper('useSlots')}()`,
    )
  }

  return true
}
