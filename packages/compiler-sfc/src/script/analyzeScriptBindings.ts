/**
 * analyzeScriptBindings.ts —— 普通 <script> 绑定分析
 *
 * ## 功能概述
 * 分析传统 Options API 的 `<script>` 块，推断顶层绑定及类型。
 *
 * ## 与 compileScriptSetup 的区别
 * `compileScriptSetup` 在编译过程中已分析 bindings，
 * 此函数仅用于**单 `<script>` 块**（无 `<script setup>`）的 SFC。
 *
 * ## 分析的绑定类型
 *
 * | 选项 | 绑定类型 | 说明 |
 * |------|----------|------|
 * | props | BindingTypes.PROPS | 来自 props 声明的属性 |
 * | inject | BindingTypes.OPTIONS | 通过 inject 注入的值 |
 * | computed | BindingTypes.OPTIONS | 计算属性 |
 * | methods | BindingTypes.OPTIONS | 方法 |
 * | setup 返回值 | SETUP_MAYBE_REF | setup() 返回的可能为 ref |
 * | data 返回值 | BindingTypes.DATA | data() 返回的响应式数据 |
 *
 * ## __isScriptSetup 标记
 *
 * 非 script setup 的绑定设置 `__isScriptSetup = false`（#3270, #3275），
 * 防止模板编译器从这些绑定中解析组件/指令引用。
 */

import type {
  ArrayExpression,
  Node,
  ObjectExpression,
  Statement,
} from '@babel/types'
import { type BindingMetadata, BindingTypes } from '@vue/compiler-dom'
import { resolveObjectKey } from './utils'

export function analyzeScriptBindings(ast: Statement[]): BindingMetadata {
  for (const node of ast) {
    if (
      node.type === 'ExportDefaultDeclaration' &&
      node.declaration.type === 'ObjectExpression'
    ) {
      return analyzeBindingsFromOptions(node.declaration)
    }
  }
  return {}
}

function analyzeBindingsFromOptions(node: ObjectExpression): BindingMetadata {
  const bindings: BindingMetadata = {}
  // #3270, #3275
  // 标记非 setup，避免模板解析时将其当作组件/指令来源
  Object.defineProperty(bindings, '__isScriptSetup', {
    enumerable: false,
    value: false,
  })
  for (const property of node.properties) {
    if (
      property.type === 'ObjectProperty' &&
      !property.computed &&
      property.key.type === 'Identifier'
    ) {
      // props: ['foo'] / props: { foo: ... }
      if (property.key.name === 'props') {
        for (const key of getObjectOrArrayExpressionKeys(property.value)) {
          bindings[key] = BindingTypes.PROPS
        }
      }

      // inject: ['foo'] / inject: { foo: {} }
      else if (property.key.name === 'inject') {
        for (const key of getObjectOrArrayExpressionKeys(property.value)) {
          bindings[key] = BindingTypes.OPTIONS
        }
      }

      // computed / methods: { foo() {} }
      else if (
        property.value.type === 'ObjectExpression' &&
        (property.key.name === 'computed' || property.key.name === 'methods')
      ) {
        for (const key of getObjectExpressionKeys(property.value)) {
          bindings[key] = BindingTypes.OPTIONS
        }
      }
    }

    // setup & data → 分析 return 语句中的对象键
    else if (
      property.type === 'ObjectMethod' &&
      property.key.type === 'Identifier' &&
      (property.key.name === 'setup' || property.key.name === 'data')
    ) {
      for (const bodyItem of property.body.body) {
        if (
          bodyItem.type === 'ReturnStatement' &&
          bodyItem.argument &&
          bodyItem.argument.type === 'ObjectExpression'
        ) {
          for (const key of getObjectExpressionKeys(bodyItem.argument)) {
            bindings[key] =
              property.key.name === 'setup'
                ? BindingTypes.SETUP_MAYBE_REF
                : BindingTypes.DATA
          }
        }
      }
    }
  }

  return bindings
}

function getObjectExpressionKeys(node: ObjectExpression): string[] {
  const keys = []
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') continue
    const key = resolveObjectKey(prop.key, prop.computed)
    if (key) keys.push(String(key))
  }
  return keys
}

function getArrayExpressionKeys(node: ArrayExpression): string[] {
  const keys = []
  for (const element of node.elements) {
    if (element && element.type === 'StringLiteral') {
      keys.push(element.value)
    }
  }
  return keys
}

export function getObjectOrArrayExpressionKeys(value: Node): string[] {
  if (value.type === 'ArrayExpression') {
    return getArrayExpressionKeys(value)
  }
  if (value.type === 'ObjectExpression') {
    return getObjectExpressionKeys(value)
  }
  return []
}
