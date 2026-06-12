/**
 * context.ts —— 脚本编译上下文
 *
 * ## 功能概述
 * ScriptCompileContext 是 SFC 脚本编译的核心状态容器。
 * 它在编译过程中维护所有编译器宏的状态、导入分析和代码生成信息。
 *
 * ## 核心职责
 *
 * ### 状态管理
 * 追踪每个编译器宏的调用状态：
 * - hasDefinePropsCall / hasDefineEmitCall / hasDefineExposeCall / etc.
 * - propsCall / propsDecl / propsRuntimeDecl / propsTypeDecl
 * - emitsRuntimeDecl / emitsTypeDecl / emitDecl
 * - modelDecls（defineModel 声明表）
 * - optionsRuntimeDecl
 *
 * ### 导入分析
 * - **userImports**：用户 import 映射
 * - **helperImports**：编译器运行时 helper 导入（如 _useModel）
 * - **helper()**：自动注册并返回 `_key` 格式的 helper 引用
 *
 * ### 代码生成
 * - **MagicString (s)**：基于位置的源码替换工具
 * - **bindingMetadata**：模板识别的绑定元数据
 *
 * ### 环境检测
 * - **isJS / isTS**：脚本语言类型
 * - **isCE**：自定义元素模式
 *
 * ## 文件构造函数流程
 *
 * 1. 判断脚本语言（JS/TS）和自定义元素模式
 * 2. 解析 parser plugins（JSX/TypeScript/装饰器等）
 * 3. 解析 `<script>` 和 `<script setup>` AST
 *
 * ## 错误报告
 * - **warn()**：警告（使用 warnOnce 防重复）
 * - **error()**：抛出带源码定位的异常
 *
 * ## resolveParserPlugins
 *
 * 根据语言标识返回 babel parser plugins：
 * - importAttributes → 默认开启（HTML spec 兼容）
 * - jsx → jsx/tsx/mtsx 自动开启
 * - TypeScript → 自动开启 typescript + decorators-legacy + explicitResourceManagement
 * - 用户自定义 plugins → 追加到末尾
 */

import type { CallExpression, Node, ObjectPattern, Program } from '@babel/types'
import type { SFCDescriptor } from '../parse'
import { generateCodeFrame, isArray } from '@vue/shared'
import { type ParserPlugin, parse as babelParse } from '@babel/parser'
import type { ImportBinding, SFCScriptCompileOptions } from '../compileScript'
import type { PropsDestructureBindings } from './defineProps'
import type { ModelDecl } from './defineModel'
import type { BindingMetadata } from '../../../compiler-core/src'
import MagicString from 'magic-string'
import type { TypeScope } from './resolveType'
import { warn } from '../warn'
import { isJS, isTS } from './utils'

export class ScriptCompileContext {
  isJS: boolean
  isTS: boolean
  isCE = false

  scriptAst: Program | null
  scriptSetupAst: Program | null

  source: string = this.descriptor.source
  filename: string = this.descriptor.filename
  s: MagicString = new MagicString(this.source)
  startOffset: number | undefined =
    this.descriptor.scriptSetup?.loc.start.offset
  endOffset: number | undefined = this.descriptor.scriptSetup?.loc.end.offset

  // import / type analysis
  scope?: TypeScope
  globalScopes?: TypeScope[]
  userImports: Record<string, ImportBinding> = Object.create(null)

  // macros presence check
  hasDefinePropsCall = false
  hasDefineEmitCall = false
  hasDefineExposeCall = false
  hasDefaultExportName = false
  hasDefaultExportRender = false
  hasDefineOptionsCall = false
  hasDefineSlotsCall = false
  hasDefineModelCall = false

  // defineProps
  propsCall: CallExpression | undefined
  propsDecl: Node | undefined
  propsRuntimeDecl: Node | undefined
  propsTypeDecl: Node | undefined
  propsDestructureDecl: ObjectPattern | undefined
  propsDestructuredBindings: PropsDestructureBindings = Object.create(null)
  propsDestructureRestId: string | undefined
  propsRuntimeDefaults: Node | undefined

  // defineEmits
  emitsRuntimeDecl: Node | undefined
  emitsTypeDecl: Node | undefined
  emitDecl: Node | undefined

  // defineModel
  modelDecls: Record<string, ModelDecl> = Object.create(null)

  // defineOptions
  optionsRuntimeDecl: Node | undefined

  // codegen
  bindingMetadata: BindingMetadata = {}
  helperImports: Set<string> = new Set()
  /**
   * 返回带 `_` 前缀的 helper 函数引用名
   * 并自动记录到 helperImports 中以生成 import
   */
  helper(key: string): string {
    this.helperImports.add(key)
    return `_${key}`
  }

  /**
   * 编译依赖集合（用于 HMR 缓存失效）
   */
  deps?: Set<string>

  /**
   * 缓存的文件系统实例
   */
  fs?: NonNullable<SFCScriptCompileOptions['fs']>

  constructor(
    public descriptor: SFCDescriptor,
    public options: Partial<SFCScriptCompileOptions>,
  ) {
    const { script, scriptSetup } = descriptor
    const scriptLang = script && script.lang
    const scriptSetupLang = scriptSetup && scriptSetup.lang

    this.isJS = isJS(scriptLang, scriptSetupLang)
    this.isTS = isTS(scriptLang, scriptSetupLang)

    const customElement = options.customElement
    const filename = this.descriptor.filename
    if (customElement) {
      this.isCE =
        typeof customElement === 'boolean'
          ? customElement
          : customElement(filename)
    }
    // 解析 parser plugins
    const plugins: ParserPlugin[] = resolveParserPlugins(
      (scriptLang || scriptSetupLang)!,
      options.babelParserPlugins,
    )

    function parse(input: string, offset: number): Program {
      try {
        return babelParse(input, {
          plugins,
          sourceType: 'module',
        }).program
      } catch (e: any) {
        e.message = `[vue/compiler-sfc] ${e.message}\n\n${
          descriptor.filename
        }\n${generateCodeFrame(
          descriptor.source,
          e.pos + offset,
          e.pos + offset + 1,
        )}`
        throw e
      }
    }

    this.scriptAst =
      descriptor.script &&
      parse(descriptor.script.content, descriptor.script.loc.start.offset)

    this.scriptSetupAst =
      descriptor.scriptSetup &&
      parse(descriptor.scriptSetup!.content, this.startOffset!)
  }

  getString(node: Node, scriptSetup = true): string {
    const block = scriptSetup
      ? this.descriptor.scriptSetup!
      : this.descriptor.script!
    return block.content.slice(node.start!, node.end!)
  }

  warn(msg: string, node: Node, scope?: TypeScope): void {
    warn(generateError(msg, node, this, scope))
  }

  error(msg: string, node: Node, scope?: TypeScope): never {
    throw new Error(
      `[@vue/compiler-sfc] ${generateError(msg, node, this, scope)}`,
    )
  }
}

function generateError(
  msg: string,
  node: Node,
  ctx: ScriptCompileContext,
  scope?: TypeScope,
) {
  const offset = scope ? scope.offset : ctx.startOffset!
  return `${msg}\n\n${(scope || ctx.descriptor).filename}\n${generateCodeFrame(
    (scope || ctx.descriptor).source,
    node.start! + offset,
    node.end! + offset,
  )}`
}

/**
 * 根据语言标识返回 babel parser plugins
 *
 * 默认行为：
 * - 所有语言 → importAttributes
 * - jsx/tsx/mtsx → jsx
 * - ts/mts/tsx/cts/mtsx → typescript + decorators-legacy + explicitResourceManagement
 * - 用户自定义 plugins → 追加
 */
export function resolveParserPlugins(
  lang: string,
  userPlugins?: ParserPlugin[],
  dts = false,
): ParserPlugin[] {
  const plugins: ParserPlugin[] = []
  if (
    !userPlugins ||
    !userPlugins.some(
      p =>
        p === 'importAssertions' ||
        p === 'importAttributes' ||
        (isArray(p) && p[0] === 'importAttributes'),
    )
  ) {
    plugins.push('importAttributes')
  }
  if (lang === 'jsx' || lang === 'tsx' || lang === 'mtsx') {
    plugins.push('jsx')
  } else if (userPlugins) {
    // 非 jsx 语言但有用户配置 → 移除 jsx plugin
    userPlugins = userPlugins.filter(p => p !== 'jsx')
  }
  if (
    lang === 'ts' ||
    lang === 'mts' ||
    lang === 'tsx' ||
    lang === 'cts' ||
    lang === 'mtsx'
  ) {
    plugins.push(['typescript', { dts }], 'explicitResourceManagement')
    if (!userPlugins || !userPlugins.includes('decorators')) {
      plugins.push('decorators-legacy')
    }
  }
  if (userPlugins) {
    plugins.push(...userPlugins)
  }
  return plugins
}
