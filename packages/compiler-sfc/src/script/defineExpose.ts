/**
 * defineExpose.ts —— defineExpose 编译处理
 *
 * ## 功能概述
 * 处理 `<script setup>` 中的 defineExpose() 调用。
 * defineExpose 用于显式指定组件对外暴露的属性。
 *
 * ## 编译行为
 * - 检测 AST 中 `defineExpose(...)` 调用
 * - 标记 `ctx.hasDefineExposeCall = true`（用于后续编译判断）
 * - 检测重复调用并报错
 * - 运行时 defineExpose 是编译器宏，编译后保留原样
 */

import type { Node } from '@babel/types'
import { isCallOf } from './utils'
import type { ScriptCompileContext } from './context'

/** 编译器宏名称 */
export const DEFINE_EXPOSE = 'defineExpose'

/**
 * 处理 defineExpose 调用
 *
 * @returns true 如果当前节点是 defineExpose 调用
 */
export function processDefineExpose(
  ctx: ScriptCompileContext,
  node: Node,
): boolean {
  if (isCallOf(node, DEFINE_EXPOSE)) {
    if (ctx.hasDefineExposeCall) {
      ctx.error(`duplicate ${DEFINE_EXPOSE}() call`, node)
    }
    ctx.hasDefineExposeCall = true
    return true
  }
  return false
}
