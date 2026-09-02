/**
 * cssVars.ts —— CSS 变量（v-bind in CSS）编译
 *
 * ## 功能概述
 * 处理 SFC 中 CSS 内 `v-bind()` 语法的编译。
 * 将 CSS 中的 `v-bind(expr)` 转换为 `var(--hash)` CSS 自定义属性。
 *
 * ## 核心 API
 *
 * ### parseCssVars
 * 从所有 `<style>` 块中用正则提取 `v-bind(...)` 中的变量名。
 * 使用简易词法分析器处理嵌套括号和引号。
 *
 * ### cssVarsPlugin（PostCSS 插件）
 * 在 CSS 编译时将 `v-bind(expr)` 替换为 `var(--<scopeId>-<hash>)`。
 *
 * ### genCssVarsFromList
 * 生成 CSS vars 映射对象：
 * ```js
 * useCssVars(_ctx => ({
 *   "--hash": (expr)
 * }))
 * ```
 *
 * ### genVarName
 * 生成 CSS 自定义属性名：
 * - 生产环境：`hash(id + raw)`（避免以数字开头）
 * - 开发环境：`{id}-{escapedName}` 可读性优先
 *
 * ### lexBinding（词法分析）
 * 简易状态机解析 `v-bind()` 中的参数范围，
 * 正确处理嵌套括号和字符串字面量。
 *
 * ## 普通 <script> 支持
 *
 * genNormalScriptCssVarsCode 为 Options API 组件注入：
 * - import useCssVars
 * - 包装 setup() 在调用前后注入 CSS vars
 */

import {
  type BindingMetadata,
  NodeTypes,
  type SimpleExpressionNode,
  createRoot,
  createSimpleExpression,
  createTransformContext,
  processExpression,
} from '@vue/compiler-dom'
import type { SFCDescriptor } from '../parse'
import type { PluginCreator } from 'postcss'
import hash from 'hash-sum'
import { getEscapedCssVarName } from '@vue/shared'

export const CSS_VARS_HELPER = `useCssVars`

export function genCssVarsFromList(
  vars: string[],
  id: string,
  isProd: boolean,
  isSSR = false,
): string {
  return `{\n  ${vars
    .map(
      key =>
        // SSR 模式下前缀 `:` 用于 ssrRenderStyle 区分 CSS var 来源
        // 若是 ssrCssVars，需在组件实例上重置为 initial 避免继承外部同属性值
        `"${isSSR ? `:--` : ``}${genVarName(id, key, isProd, isSSR)}": (${key})`,
    )
    .join(',\n  ')}\n}`
}

/**
 * 生成 CSS 自定义属性名
 *
 * - 生产环境 → hash 值（必须以字母开头符合 CSS 命名规则）
 * - 开发环境 → `{id}-{escapedName}`（可读，可调试）
 */
function genVarName(
  id: string,
  raw: string,
  isProd: boolean,
  isSSR = false,
): string {
  if (isProd) {
    // hash 首字符不能是数字（CSS 自定义属性命名规则）
    return hash(id + raw).replace(/^\d/, r => `v${r}`)
  } else {
    // 转义 ASCII 标点符号
    // #7823 SSR 需要双重转义（属性渲染到 HTML 字符串中）
    return `${id}-${getEscapedCssVarName(raw, isSSR)}`
  }
}

function normalizeExpression(exp: string) {
  exp = exp.trim()
  if (
    (exp[0] === `'` && exp[exp.length - 1] === `'`) ||
    (exp[0] === `"` && exp[exp.length - 1] === `"`)
  ) {
    return exp.slice(1, -1)
  }
  return exp
}

const vBindRE = /v-bind\s*\(/g

/**
 * 从所有 `<style>` 块中提取 v-bind() 变量名
 *
 * 先移除块注释和行注释内容再匹配。
 */
export function parseCssVars(sfc: SFCDescriptor): string[] {
  const vars: string[] = []
  sfc.styles.forEach(style => {
    let match
    // 移除注释（/* */ 和 //）以避免误匹配
    const content = style.content.replace(/\/\*([\s\S]*?)\*\/|\/\/.*/g, '')
    while ((match = vBindRE.exec(content))) {
      const start = match.index + match[0].length
      const end = lexBinding(content, start)
      if (end !== null) {
        const variable = normalizeExpression(content.slice(start, end))
        if (!vars.includes(variable)) {
          vars.push(variable)
        }
      }
    }
  })
  return vars
}

/**
 * 词法分析器状态
 */
enum LexerState {
  inParens, // 在括号内
  inSingleQuoteString, // 在单引号字符串内
  inDoubleQuoteString, // 在双引号字符串内
}

/**
 * 简易词法分析器 —— 解析 v-bind() 参数范围
 *
 * 正确处理：
 * - 嵌套括号：v-bind(fn(a, b)) → 匹配最外层括号
 * - 字符串字面量：v-bind('a(b)') → 忽略字符串内的括号
 */
function lexBinding(content: string, start: number): number | null {
  let state: LexerState = LexerState.inParens
  let parenDepth = 0

  for (let i = start; i < content.length; i++) {
    const char = content.charAt(i)
    switch (state) {
      case LexerState.inParens:
        if (char === `'`) {
          state = LexerState.inSingleQuoteString
        } else if (char === `"`) {
          state = LexerState.inDoubleQuoteString
        } else if (char === `(`) {
          parenDepth++
        } else if (char === `)`) {
          if (parenDepth > 0) {
            parenDepth--
          } else {
            return i // 找到匹配的最外层来括号
          }
        }
        break
      case LexerState.inSingleQuoteString:
        if (char === `'`) {
          state = LexerState.inParens
        }
        break
      case LexerState.inDoubleQuoteString:
        if (char === `"`) {
          state = LexerState.inParens
        }
        break
    }
  }
  return null
}

// for compileStyle
export interface CssVarsPluginOptions {
  id: string
  isProd: boolean
}

export const cssVarsPlugin: PluginCreator<CssVarsPluginOptions> = opts => {
  const { id, isProd } = opts!
  return {
    postcssPlugin: 'vue-sfc-vars',
    Declaration(decl) {
      // 重写 CSS 声明中的 v-bind() → var(--hash)
      const value = decl.value
      if (vBindRE.test(value)) {
        vBindRE.lastIndex = 0
        let transformed = ''
        let lastIndex = 0
        let match
        while ((match = vBindRE.exec(value))) {
          const start = match.index + match[0].length
          const end = lexBinding(value, start)
          if (end !== null) {
            const variable = normalizeExpression(value.slice(start, end))
            transformed +=
              value.slice(lastIndex, match.index) +
              `var(--${genVarName(id, variable, isProd)})`
            lastIndex = end + 1
          }
        }
        decl.value = transformed + value.slice(lastIndex)
      }
    },
  }
}
cssVarsPlugin.postcss = true

export function genCssVarsCode(
  vars: string[],
  bindings: BindingMetadata,
  id: string,
  isProd: boolean,
) {
  const varsExp = genCssVarsFromList(vars, id, isProd)
  const exp = createSimpleExpression(varsExp, false)
  const context = createTransformContext(createRoot([]), {
    prefixIdentifiers: true,
    inline: true,
    bindingMetadata: bindings.__isScriptSetup === false ? undefined : bindings,
  })
  const transformed = processExpression(exp, context)
  const transformedString =
    transformed.type === NodeTypes.SIMPLE_EXPRESSION
      ? transformed.content
      : transformed.children
          .map(c => {
            return typeof c === 'string'
              ? c
              : (c as SimpleExpressionNode).content
          })
          .join('')

  return `_${CSS_VARS_HELPER}(_ctx => (${transformedString}))`
}

// <script setup> 已在 transform 过程中注入调用
// 此函数仅用于单个普通 <script> 的场景
export function genNormalScriptCssVarsCode(
  cssVars: string[],
  bindings: BindingMetadata,
  id: string,
  isProd: boolean,
  defaultVar: string,
): string {
  return (
    `\nimport { ${CSS_VARS_HELPER} as _${CSS_VARS_HELPER} } from 'vue'\n` +
    `const __injectCSSVars__ = () => {\n${genCssVarsCode(
      cssVars,
      bindings,
      id,
      isProd,
    )}}\n` +
    `const __setup__ = ${defaultVar}.setup\n` +
    `${defaultVar}.setup = __setup__\n` +
    `  ? (props, ctx) => { __injectCSSVars__();return __setup__(props, ctx) }\n` +
    `  : __injectCSSVars__\n`
  )
}
