/**
 * defineEmits.ts —— defineEmits 编译处理
 *
 * ## 功能概述
 * 处理 `<script setup>` 中的 defineEmits() 调用。
 * defineEmits 声明组件对外发出的事件。
 *
 * ## 参数模式
 * 支持两种声明方式（互斥）：
 * 1. **运行时参数**：`defineEmits(['click', 'update:modelValue'])`
 *    → ctx.emitsRuntimeDecl
 * 2. **类型参数**：`defineEmits<{ (e: 'click'): void; }>()`
 *    → ctx.emitsTypeDecl → extractRuntimeEmits 解析为事件名 Set
 *
 * ## 运行时 emits 生成（genRuntimeEmits）
 *
 * 优先级：运行时声明 > 类型声明
 *
 * ### defineModel 集成
 * 当组件使用 defineModel 时，自动合并 model emit 事件：
 * `mergeModels(userEmits, modelEmits)`
 *
 * ## extractRuntimeEmits
 *
 * 两种类型形式：
 * - **函数签名**：`(e: 'foo' | 'bar')` → 直接提取
 * - **属性 + 调用签名**：`{ 'foo': [] }` → 遍历属性名
 *   - 两种形式互斥，混用报错
 *
 * ### extractEventNames
 * 递归解析联合类型中的字符串字面量，提取事件名。
 */

import type {
  ArrayPattern,
  Identifier,
  LVal,
  Node,
  ObjectPattern,
  RestElement,
} from '@babel/types'
import { isCallOf } from './utils'
import type { ScriptCompileContext } from './context'
import {
  type TypeResolveContext,
  resolveTypeElements,
  resolveUnionType,
} from './resolveType'

/** 编译器宏名称 */
export const DEFINE_EMITS = 'defineEmits'

export function processDefineEmits(
  ctx: ScriptCompileContext,
  node: Node,
  declId?: LVal,
): boolean {
  if (!isCallOf(node, DEFINE_EMITS)) {
    return false
  }
  if (ctx.hasDefineEmitCall) {
    ctx.error(`duplicate ${DEFINE_EMITS}() call`, node)
  }
  ctx.hasDefineEmitCall = true
  // 运行时声明：defineEmits([...])
  ctx.emitsRuntimeDecl = node.arguments[0]
  if (node.typeParameters) {
    // 类型参数与运行时参数互斥
    if (ctx.emitsRuntimeDecl) {
      ctx.error(
        `${DEFINE_EMITS}() cannot accept both type and non-type arguments ` +
          `at the same time. Use one or the other.`,
        node,
      )
    }
    ctx.emitsTypeDecl = node.typeParameters.params[0]
  }

  ctx.emitDecl = declId

  return true
}

export function genRuntimeEmits(ctx: ScriptCompileContext): string | undefined {
  let emitsDecl = ''
  if (ctx.emitsRuntimeDecl) {
    // 运行时声明 → 直接使用字符串化表示
    emitsDecl = ctx.getString(ctx.emitsRuntimeDecl).trim()
  } else if (ctx.emitsTypeDecl) {
    // 类型声明 → 从类型中提取事件名
    const typeDeclaredEmits = extractRuntimeEmits(ctx)
    emitsDecl = typeDeclaredEmits.size
      ? `[${Array.from(typeDeclaredEmits)
          .map(k => JSON.stringify(k))
          .join(', ')}]`
      : ``
  }
  // 合并 defineModel 生成的 model emit 事件
  if (ctx.hasDefineModelCall) {
    let modelEmitsDecl = `[${Object.keys(ctx.modelDecls)
      .map(n => JSON.stringify(`update:${n}`))
      .join(', ')}]`
    emitsDecl = emitsDecl
      ? `/*@__PURE__*/${ctx.helper(
          'mergeModels',
        )}(${emitsDecl}, ${modelEmitsDecl})`
      : modelEmitsDecl
  }
  return emitsDecl
}

/**
 * 从 TypeScript 类型声明中提取 emit 事件名
 */
export function extractRuntimeEmits(ctx: TypeResolveContext): Set<string> {
  const emits = new Set<string>()
  const node = ctx.emitsTypeDecl!

  // 函数签名形式：(e: 'foo' | 'bar') => void
  if (node.type === 'TSFunctionType') {
    extractEventNames(ctx, node.parameters[0], emits)
    return emits
  }

  const { props, calls } = resolveTypeElements(ctx, node)

  // 属性形式：{ 'foo': [], 'bar': [] }
  let hasProperty = false
  for (const key in props) {
    emits.add(key)
    hasProperty = true
  }

  if (calls) {
    if (hasProperty) {
      ctx.error(
        `defineEmits() type cannot mixed call signature and property syntax.`,
        node,
      )
    }
    for (const call of calls) {
      extractEventNames(ctx, call.parameters[0], emits)
    }
  }

  return emits
}

/**
 * 从联合类型字符串字面量中提取事件名
 * 如 `'foo' | 'bar'` → Set<'foo', 'bar'>
 */
function extractEventNames(
  ctx: TypeResolveContext,
  eventName: ArrayPattern | Identifier | ObjectPattern | RestElement,
  emits: Set<string>,
) {
  if (
    eventName.type === 'Identifier' &&
    eventName.typeAnnotation &&
    eventName.typeAnnotation.type === 'TSTypeAnnotation'
  ) {
    const types = resolveUnionType(ctx, eventName.typeAnnotation.typeAnnotation)

    for (const type of types) {
      if (type.type === 'TSLiteralType') {
        if (
          type.literal.type !== 'UnaryExpression' &&
          type.literal.type !== 'TemplateLiteral'
        ) {
          emits.add(String(type.literal.value))
        }
      }
    }
  }
}
