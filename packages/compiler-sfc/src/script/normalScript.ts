/**
 * normalScript.ts —— 普通（非 setup）<script> 编译
 *
 * ## 功能概述
 * 处理传统 Options API 的 `<script>` 块（不带 setup 属性）。
 *
 * ## 编译流程
 * 1. 分析脚本 AST，提取顶层绑定（analyzeScriptBindings）
 * 2. 如果需要 `genDefaultAs` 或存在 CSS vars：
 *    - 用 MagicString 重写 `export default { ... }` 为变量声明
 *    - 插入 CSS vars 的编译代码
 *    - 追加 `export default __default__`
 * 3. 附加 bindings 和 scriptAst 到结果上
 *
 * ## genDefaultAs
 * `compilerOptions.genDefaultAs` 选项用于将默认导出重写为具名变量。
 *
 * ## 错误处理
 * 解析失败时静默回退返回原始 script（用户可能使用自定义 babel 语法）。
 */

import { analyzeScriptBindings } from './analyzeScriptBindings'
import type { ScriptCompileContext } from './context'
import MagicString from 'magic-string'
import { rewriteDefaultAST } from '../rewriteDefault'
import { genNormalScriptCssVarsCode } from '../style/cssVars'
import type { SFCScriptBlock } from '../parse'

/** 默认导出的变量名 */
export const normalScriptDefaultVar = `__default__`

export function processNormalScript(
  ctx: ScriptCompileContext,
  scopeId: string,
): SFCScriptBlock {
  const script = ctx.descriptor.script!
  try {
    let content = script.content
    let map = script.map
    const scriptAst = ctx.scriptAst!
    const bindings = analyzeScriptBindings(scriptAst.body)
    const { cssVars } = ctx.descriptor
    const { genDefaultAs, isProd } = ctx.options

    if (cssVars.length || genDefaultAs) {
      const defaultVar = genDefaultAs || normalScriptDefaultVar
      const s = new MagicString(content)
      // 将 export default 重写为变量声明
      rewriteDefaultAST(scriptAst.body, s, defaultVar)
      content = s.toString()
      // 插入 CSS vars 编译代码
      if (cssVars.length && !ctx.options.templateOptions?.ssr) {
        content += genNormalScriptCssVarsCode(
          cssVars,
          bindings,
          scopeId,
          !!isProd,
          defaultVar,
        )
      }
      if (!genDefaultAs) {
        content += `\nexport default ${defaultVar}`
      }
    }
    return {
      ...script,
      content,
      map,
      bindings,
      scriptAst: scriptAst.body,
    }
  } catch (e: any) {
    // 静默回退：用户可能使用自定义 babel 语法导致解析失败
    return script
  }
}
