/**
 * compileTemplate.ts —— 模板编译核心
 *
 * ## 功能概述
 * 编译 SFC 的 `<template>` 块为 render 函数。
 * 整合模板预处理器、编译器选项、资源 URL 转换和 source map。
 *
 * ## 编译流程
 *
 * ```
 * 源码 → 预处理器 → [AST 重用] → compiler.compile() → source map 合并 → 输出
 * ```
 *
 * ### 1. 预处理器
 * 通过 `@vue/consolidate` 支持 Pug/Jade 等模板引擎。
 * 预处理后 AST 失效，需重新解析。
 *
 * ### 2. AST 重用
 * 如果 descriptor 中已有未变换的 AST，可跳过解析直接编译。
 * 但自定义编译器时 AST 不兼容，需重新解析。
 *
 * ### 3. 编译器选择
 * - 默认：SSR → compiler-ssr，客户端 → compiler-dom
 * - 可选：自定义 TemplateCompiler
 *
 * ### 4. 资源 URL 转换
 * - `transformAssetUrl`：img/video/source 等标签的 src 属性
 * - `transformSrcset`：srcset 属性
 *
 * ### 5. Source Map 合并
 * 当存在原始 source map（来自 parse.ts），
 * 使用 source-map-js 将编译结果的映射回溯到完整 SFC 行号。
 *
 * ### 6. 错误修补（patchErrors）
 * 仅当原始 source 是完整 SFC 的子字符串时，
 * 将编译错误位置回溯到原始 SFC 位置。
 */

import {
  type CodegenResult,
  type CompilerError,
  type CompilerOptions,
  type ElementNode,
  type NodeTransform,
  NodeTypes,
  type ParserOptions,
  type RawSourceMap,
  type RootNode,
  createRoot,
} from '@vue/compiler-core'
import { SourceMapConsumer, SourceMapGenerator } from 'source-map-js'
import {
  type AssetURLOptions,
  type AssetURLTagConfig,
  createAssetUrlTransformWithOptions,
  normalizeOptions,
  transformAssetUrl,
} from './template/transformAssetUrl'
import {
  createSrcsetTransformWithOptions,
  transformSrcset,
} from './template/transformSrcset'
import { generateCodeFrame, isObject } from '@vue/shared'
import * as CompilerDOM from '@vue/compiler-dom'
import * as CompilerSSR from '@vue/compiler-ssr'
import consolidate from '@vue/consolidate'
import { warnOnce } from './warn'
import { genCssVarsFromList } from './style/cssVars'

export interface TemplateCompiler {
  compile(source: string | RootNode, options: CompilerOptions): CodegenResult
  parse(template: string, options: ParserOptions): RootNode
}

export interface SFCTemplateCompileResults {
  code: string
  ast?: RootNode
  preamble?: string
  source: string
  tips: string[]
  errors: (string | CompilerError)[]
  map?: RawSourceMap
}

export interface SFCTemplateCompileOptions {
  source: string
  ast?: RootNode
  filename: string
  id: string
  scoped?: boolean
  slotted?: boolean
  isProd?: boolean
  ssr?: boolean
  ssrCssVars?: string[]
  inMap?: RawSourceMap
  compiler?: TemplateCompiler
  compilerOptions?: CompilerOptions
  preprocessLang?: string
  preprocessOptions?: any
  /**
   * 全局安装或链接场景下可能不在项目根目录，
   * 需传入自定义 require 解析预处理器
   */
  preprocessCustomRequire?: (id: string) => any
  /**
   * 配置资源 URL 转换（标签+属性），
   * 传 false 可完全关闭转换
   */
  transformAssetUrls?: AssetURLOptions | AssetURLTagConfig | boolean
}

interface PreProcessor {
  render(
    source: string,
    options: any,
    cb: (err: Error | null, res: string) => void,
  ): void
}

/**
 * 模板预处理（Pug 等）
 *
 * Consolidate 暴露回调 API，但对大多数模板引擎回调是同步调用的。
 * 这里强制同步模式以支持 Jest transforms（需通过 Node require hook 同步执行）。
 */
function preprocess(
  { source, filename, preprocessOptions }: SFCTemplateCompileOptions,
  preprocessor: PreProcessor,
): string {
  let res: string = ''
  let err: Error | null = null

  preprocessor.render(
    source,
    { filename, ...preprocessOptions },
    (_err, _res) => {
      if (_err) err = _err
      res = _res
    },
  )

  if (err) throw err
  return res
}

export function compileTemplate(
  options: SFCTemplateCompileOptions,
): SFCTemplateCompileResults {
  const { preprocessLang, preprocessCustomRequire } = options

  if (
    (__ESM_BROWSER__ || __GLOBAL__) &&
    preprocessLang &&
    !preprocessCustomRequire
  ) {
    throw new Error(
      `[@vue/compiler-sfc] Template preprocessing in the browser build must ` +
        `provide the \`preprocessCustomRequire\` option to return the in-browser ` +
        `version of the preprocessor in the shape of { render(): string }.`,
    )
  }

  const preprocessor = preprocessLang
    ? preprocessCustomRequire
      ? preprocessCustomRequire(preprocessLang)
      : __ESM_BROWSER__
        ? undefined
        : consolidate[preprocessLang as keyof typeof consolidate]
    : false
  if (preprocessor) {
    try {
      return doCompileTemplate({
        ...options,
        source: preprocess(options, preprocessor),
        ast: undefined, // 预处理后 AST 失效
      })
    } catch (e: any) {
      return {
        code: `export default function render() {}`,
        source: options.source,
        tips: [],
        errors: [e],
      }
    }
  } else if (preprocessLang) {
    return {
      code: `export default function render() {}`,
      source: options.source,
      tips: [
        `Component ${options.filename} uses lang ${preprocessLang} for template. Please install the language preprocessor.`,
      ],
      errors: [
        `Component ${options.filename} uses lang ${preprocessLang} for template, however it is not installed.`,
      ],
    }
  } else {
    return doCompileTemplate(options)
  }
}

function doCompileTemplate({
  filename,
  id,
  scoped,
  slotted,
  inMap,
  source,
  ast: inAST,
  ssr = false,
  ssrCssVars,
  isProd = false,
  compiler,
  compilerOptions = {},
  transformAssetUrls,
}: SFCTemplateCompileOptions): SFCTemplateCompileResults {
  const errors: CompilerError[] = []
  const warnings: CompilerError[] = []

  // 资源 URL 转换
  let nodeTransforms: NodeTransform[] = []
  if (isObject(transformAssetUrls)) {
    const assetOptions = normalizeOptions(transformAssetUrls)
    nodeTransforms = [
      createAssetUrlTransformWithOptions(assetOptions),
      createSrcsetTransformWithOptions(assetOptions),
    ]
  } else if (transformAssetUrls !== false) {
    nodeTransforms = [transformAssetUrl, transformSrcset]
  }

  if (ssr && !ssrCssVars) {
    warnOnce(
      `compileTemplate is called with \`ssr: true\` but no ` +
        `corresponding \`cssVars\` option.`,
    )
  }
  if (!id) {
    warnOnce(`compileTemplate now requires the \`id\` option.`)
    id = ''
  }

  const shortId = id.replace(/^data-v-/, '')
  const longId = `data-v-${shortId}`

  // 默认编译器
  const defaultCompiler = ssr ? (CompilerSSR as TemplateCompiler) : CompilerDOM
  compiler = compiler || defaultCompiler

  if (compiler !== defaultCompiler) {
    // 自定义编译器 → AST 不兼容，需重新解析
    inAST = undefined
  }

  // AST 已被变换 → 不能直接复用，需基于原始 source 重新解析
  if (inAST?.transformed) {
    const newAST = (ssr ? CompilerDOM : compiler).parse(inAST.source, {
      prefixIdentifiers: true,
      ...compilerOptions,
      parseMode: 'sfc',
      onError: e => errors.push(e),
    })
    const template = newAST.children.find(
      node => node.type === NodeTypes.ELEMENT && node.tag === 'template',
    ) as ElementNode
    inAST = createRoot(template.children, inAST.source)
  }

  // 编译
  let { code, ast, preamble, map } = compiler.compile(inAST || source, {
    mode: 'module',
    prefixIdentifiers: true,
    hoistStatic: true,
    cacheHandlers: true,
    ssrCssVars:
      ssr && ssrCssVars && ssrCssVars.length
        ? genCssVarsFromList(ssrCssVars, shortId, isProd, true)
        : '',
    scopeId: scoped ? longId : undefined,
    slotted,
    sourceMap: true,
    ...compilerOptions,
    hmr: !isProd,
    nodeTransforms: nodeTransforms.concat(compilerOptions.nodeTransforms || []),
    filename,
    onError: e => errors.push(e),
    onWarn: w => warnings.push(w),
  })

  // Source map 合并：将编译结果的映射回溯到完整 SFC 行号
  if (inMap && !inAST) {
    if (map) {
      map = mapLines(inMap, map)
    }
    if (errors.length) {
      patchErrors(errors, source, inMap)
    }
  }

  const tips = warnings.map(w => {
    let msg = w.message
    if (w.loc) {
      msg += `\n${generateCodeFrame(
        inAST?.source || source,
        w.loc.start.offset,
        w.loc.end.offset,
      )}`
    }
    return msg
  })

  return { code, ast, preamble, source, errors, tips, map }
}

/**
 * Source map 合并
 *
 * 将编译结果的 source map 与原始 SFC 的 source map 合并，
 * 使得最终 source map 直接指向完整 .vue 文件的行/列。
 */
function mapLines(oldMap: RawSourceMap, newMap: RawSourceMap): RawSourceMap {
  if (!oldMap) return newMap
  if (!newMap) return oldMap

  const oldMapConsumer = new SourceMapConsumer(oldMap)
  const newMapConsumer = new SourceMapConsumer(newMap)
  const mergedMapGenerator = new SourceMapGenerator()

  newMapConsumer.eachMapping(m => {
    if (m.originalLine == null) {
      return
    }

    const origPosInOldMap = oldMapConsumer.originalPositionFor({
      line: m.originalLine,
      column: m.originalColumn!,
    })

    if (origPosInOldMap.source == null) {
      return
    }

    mergedMapGenerator.addMapping({
      generated: {
        line: m.generatedLine,
        column: m.generatedColumn,
      },
      original: {
        line: origPosInOldMap.line,
        column: m.originalColumn!,
      },
      source: origPosInOldMap.source,
      name: origPosInOldMap.name,
    })
  })

  const generator = mergedMapGenerator as any
  ;(oldMapConsumer as any).sources.forEach((sourceFile: string) => {
    generator._sources.add(sourceFile)
    const sourceContent = oldMapConsumer.sourceContentFor(sourceFile)
    if (sourceContent != null) {
      mergedMapGenerator.setSourceContent(sourceFile, sourceContent)
    }
  })

  generator._sourceRoot = oldMap.sourceRoot
  generator._file = oldMap.file
  return generator.toJSON()
}

/**
 * 错误位置回溯
 *
 * 当原始 source 是完整 SFC 的子字符串时，
 * 将编译错误位置调整为原始 SFC 中的位置。
 */
function patchErrors(
  errors: CompilerError[],
  source: string,
  inMap: RawSourceMap,
) {
  const originalSource = inMap.sourcesContent![0]
  const offset = originalSource.indexOf(source)
  const lineOffset = originalSource.slice(0, offset).split(/\r?\n/).length - 1
  errors.forEach(err => {
    if (err.loc) {
      err.loc.start.line += lineOffset
      err.loc.start.offset += offset
      if (err.loc.end !== err.loc.start) {
        err.loc.end.line += lineOffset
        err.loc.end.offset += offset
      }
    }
  })
}
