/**
 * defineOptions.ts —— defineOptions 编译处理
 *
 * ## 功能概述
 * 处理 `<script setup>` 中的 defineOptions() 调用。
 * defineOptions 允许在 `<script setup>` 中声明 Options API 级别的
 * 组件选项（如 name、inheritAttrs 等），但不包括 props/emits/expose/slots。
 *
 * ## 编译行为
 * - 检测并标记 defineOptions 调用
 * - 解包 TS 类型注解，保留运行时对象字面量
 * - **不允许**声明 props/emits/expose/slots——这些有专门的编译器宏
 *   defineProps / defineEmits / defineExpose / defineSlots
 * - 不允许重复调用
 *
 * ## ctx.optionsRuntimeDecl
 * 解包 TS 后的运行时选项 AST 节点，后续 compileScript 将其提取为
 * 独立的运行时声明。
 */

import type { Node } from '@babel/types'
import { unwrapTSNode } from '@vue/compiler-dom'
import type { ScriptCompileContext } from './context'
import { isCallOf } from './utils'
import { DEFINE_PROPS } from './defineProps'
import { DEFINE_EMITS } from './defineEmits'
import { DEFINE_EXPOSE } from './defineExpose'
import { DEFINE_SLOTS } from './defineSlots'

/** 编译器宏名称 */
export const DEFINE_OPTIONS = 'defineOptions'

export function processDefineOptions(
  ctx: ScriptCompileContext,
  node: Node,
): boolean {
  if (!isCallOf(node, DEFINE_OPTIONS)) {
    return false
  }
  if (ctx.hasDefineOptionsCall) {
    ctx.error(`duplicate ${DEFINE_OPTIONS}() call`, node)
  }
  if (node.typeParameters) {
    ctx.error(`${DEFINE_OPTIONS}() cannot accept type arguments`, node)
  }
  // 无参数 → 无运行时选项 → 仅类型标注用途
  if (!node.arguments[0]) return true

  ctx.hasDefineOptionsCall = true
  // 剥离 TypeScript 类型注解，保留运行时对象
  ctx.optionsRuntimeDecl = unwrapTSNode(node.arguments[0])

  // 遍历选项对象，禁止 props/emits/expose/slots 属性
  let propsOption = undefined
  let emitsOption = undefined
  let exposeOption = undefined
  let slotsOption = undefined
  if (ctx.optionsRuntimeDecl.type === 'ObjectExpression') {
    for (const prop of ctx.optionsRuntimeDecl.properties) {
      if (
        (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') &&
        prop.key.type === 'Identifier'
      ) {
        switch (prop.key.name) {
          case 'props':
            propsOption = prop
            break

          case 'emits':
            emitsOption = prop
            break

          case 'expose':
            exposeOption = prop
            break

          case 'slots':
            slotsOption = prop
            break
        }
      }
    }
  }

  // 提示用户使用专门的编译器宏
  if (propsOption) {
    ctx.error(
      `${DEFINE_OPTIONS}() cannot be used to declare props. Use ${DEFINE_PROPS}() instead.`,
      propsOption,
    )
  }
  if (emitsOption) {
    ctx.error(
      `${DEFINE_OPTIONS}() cannot be used to declare emits. Use ${DEFINE_EMITS}() instead.`,
      emitsOption,
    )
  }
  if (exposeOption) {
    ctx.error(
      `${DEFINE_OPTIONS}() cannot be used to declare expose. Use ${DEFINE_EXPOSE}() instead.`,
      exposeOption,
    )
  }
  if (slotsOption) {
    ctx.error(
      `${DEFINE_OPTIONS}() cannot be used to declare slots. Use ${DEFINE_SLOTS}() instead.`,
      slotsOption,
    )
  }

  return true
}
