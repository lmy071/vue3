/**
 * defineModel.ts —— defineModel 编译处理
 *
 * ## 功能概述
 * 处理 `<script setup>` 中的 defineModel() 调用。
 * defineModel 是 v-model 在 `<script setup>` 中的等价宏，
 * 自动生成对应的 prop 和 update:xxx emit 事件。
 *
 * ## 调用形式
 *
 * ```
 * // 简单形式（默认 modelValue）
 * const count = defineModel<number>()
 *
 * // 具名形式
 * const title = defineModel<string>('title')
 *
 * // 带选项形式
 * const count = defineModel<number>({ default: 0, required: true })
 * ```
 *
 * ## 编译流程（processDefineModel）
 *
 * 1. 检测调用并标记 `hasDefineModelCall`
 * 2. 提取类型参数（`<T>`）
 * 3. 解析名称：`defineModel('name')` → 具名 / `defineModel()` → 'modelValue'
 * 4. 处理 options 参数：分离 prop 选项与运行时 get/set
 * 5. 替换为 `useModel(__props, 'name', options)`
 * 6. 注册为 PROPS 绑定
 *
 * ## genModelProps
 *
 * 为所有 defineModel 调用生成 props 声明对象：
 * - 每个 model 生成 `name: { type: [...] }` 和 `nameModifiers: {}`
 * - 类型提取：Boolean/Function/null/Unknown 有特殊处理
 * - 生产环境可丢弃纯类型信息
 * - TS 模式使用对象展开，JS 模式使用 Object.assign
 *
 * ## ModelDecl 结构
 *
 * ```ts
 * { type, options, identifier, runtimeOptionNodes }
 * ```
 */

import type { LVal, Node, TSType } from '@babel/types'
import type { ScriptCompileContext } from './context'
import { inferRuntimeType } from './resolveType'
import { UNKNOWN_TYPE, isCallOf, toRuntimeTypeString } from './utils'
import { BindingTypes, unwrapTSNode } from '@vue/compiler-dom'

/** 编译器宏名称 */
export const DEFINE_MODEL = 'defineModel'

export interface ModelDecl {
  type: TSType | undefined
  options: string | undefined
  identifier: string | undefined
  runtimeOptionNodes: Node[]
}

export function processDefineModel(
  ctx: ScriptCompileContext,
  node: Node,
  declId?: LVal,
): boolean {
  if (!isCallOf(node, DEFINE_MODEL)) {
    return false
  }

  ctx.hasDefineModelCall = true

  // 类型参数 → 用于生成 props 的 type 校验
  const type =
    (node.typeParameters && node.typeParameters.params[0]) || undefined
  let modelName: string
  let options: Node | undefined
  const arg0 = node.arguments[0] && unwrapTSNode(node.arguments[0])
  // 第一个参数是否是以字符串/模板字面量指定的名称
  const hasName =
    arg0 &&
    (arg0.type === 'StringLiteral' ||
      (arg0.type === 'TemplateLiteral' && arg0.expressions.length === 0))
  if (hasName) {
    modelName =
      arg0.type === 'StringLiteral' ? arg0.value : arg0.quasis[0].value.cooked!
    options = node.arguments[1]
  } else {
    modelName = 'modelValue'
    options = arg0
  }

  if (ctx.modelDecls[modelName]) {
    ctx.error(`duplicate model name ${JSON.stringify(modelName)}`, node)
  }

  let optionsString = options && ctx.getString(options)
  let optionsRemoved = !options
  const runtimeOptionNodes: Node[] = []

  if (
    options &&
    options.type === 'ObjectExpression' &&
    !options.properties.some(p => p.type === 'SpreadElement' || p.computed)
  ) {
    let removed = 0
    for (let i = options.properties.length - 1; i >= 0; i--) {
      const p = options.properties[i]
      const next = options.properties[i + 1]
      const start = p.start!
      const end = next ? next.start! : options.end! - 1
      if (
        (p.type === 'ObjectProperty' || p.type === 'ObjectMethod') &&
        ((p.key.type === 'Identifier' &&
          (p.key.name === 'get' || p.key.name === 'set')) ||
          (p.key.type === 'StringLiteral' &&
            (p.key.value === 'get' || p.key.value === 'set')))
      ) {
        // 移除运行时 get/set → 避免与 prop options 重复
        optionsString =
          optionsString.slice(0, start - options.start!) +
          optionsString.slice(end - options.start!)
      } else {
        // 从运行时代码中移除 prop options → 由 genModelProps 统一生成
        removed++
        ctx.s.remove(ctx.startOffset! + start, ctx.startOffset! + end)
        runtimeOptionNodes.push(p)
      }
    }
    if (removed === options.properties.length) {
      optionsRemoved = true
      ctx.s.remove(
        ctx.startOffset! + (hasName ? arg0.end! : options.start!),
        ctx.startOffset! + options.end!,
      )
    }
  }

  ctx.modelDecls[modelName] = {
    type,
    options: optionsString,
    runtimeOptionNodes,
    identifier:
      declId && declId.type === 'Identifier' ? declId.name : undefined,
  }
  // 注册为 props 绑定
  ctx.bindingMetadata[modelName] = BindingTypes.PROPS

  // defineModel → useModel 运行时调用
  ctx.s.overwrite(
    ctx.startOffset! + node.callee.start!,
    ctx.startOffset! + node.callee.end!,
    ctx.helper('useModel'),
  )
  // 注入 __props 和 model 名称参数
  ctx.s.appendLeft(
    ctx.startOffset! +
      (node.arguments.length ? node.arguments[0].start! : node.end! - 1),
    `__props, ` +
      (hasName
        ? ``
        : `${JSON.stringify(modelName)}${optionsRemoved ? `` : `, `}`),
  )

  return true
}

/**
 * 为 defineModel 调用生成 props 声明代码
 *
 * @returns props 对象字符串，包含每个 model 的 type + modifiers prop
 */
export function genModelProps(ctx: ScriptCompileContext): string | undefined {
  if (!ctx.hasDefineModelCall) return

  const isProd = !!ctx.options.isProd
  let modelPropsDecl = ''
  for (const [name, { type, options: runtimeOptions }] of Object.entries(
    ctx.modelDecls,
  )) {
    let skipCheck = false
    let codegenOptions = ``
    let runtimeTypes = type && inferRuntimeType(ctx, type)
    if (runtimeTypes) {
      const hasBoolean = runtimeTypes.includes('Boolean')
      const hasFunction = runtimeTypes.includes('Function')
      const hasUnknownType = runtimeTypes.includes(UNKNOWN_TYPE)

      // Unknown 类型 → 只保留可确定的类型
      if (hasUnknownType) {
        if (hasBoolean || hasFunction) {
          runtimeTypes = runtimeTypes.filter(t => t !== UNKNOWN_TYPE)
          skipCheck = true
        } else {
          runtimeTypes = ['null']
        }
      }

      if (!isProd) {
        // 开发环境保留完整类型
        codegenOptions =
          `type: ${toRuntimeTypeString(runtimeTypes)}` +
          (skipCheck ? ', skipCheck: true' : '')
      } else if (hasBoolean || (runtimeOptions && hasFunction)) {
        // 生产环境仅保留 Boolean（影响转换逻辑）和 Function（与 runtime options 相关）
        codegenOptions = `type: ${toRuntimeTypeString(runtimeTypes)}`
      }
      // else: 生产环境可丢弃纯类型信息
    }

    let decl: string
    if (codegenOptions && runtimeOptions) {
      // TS 用展开，JS 用 Object.assign
      decl = ctx.isTS
        ? `{ ${codegenOptions}, ...${runtimeOptions} }`
        : `Object.assign({ ${codegenOptions} }, ${runtimeOptions})`
    } else if (codegenOptions) {
      decl = `{ ${codegenOptions} }`
    } else if (runtimeOptions) {
      decl = runtimeOptions
    } else {
      decl = `{}`
    }
    modelPropsDecl += `\n    ${JSON.stringify(name)}: ${decl},`

    // 同时生成 modifiers prop
    const modifierPropName = JSON.stringify(
      name === 'modelValue' ? `modelModifiers` : `${name}Modifiers`,
    )
    modelPropsDecl += `\n    ${modifierPropName}: {},`
  }
  return `{${modelPropsDecl}\n  }`
}
