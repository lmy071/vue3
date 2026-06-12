/**
 * preprocessors.ts —— CSS 预处理器适配层
 *
 * ## 功能概述
 * 提供 SFC 样式编译时的 CSS 预处理器集成（Sass/SCSS/Less/Stylus）。
 *
 * ## StylePreprocessor 类型
 *
 * ```ts
 * (source, map, options, customRequire) => {
 *   code: string    // 编译后的 CSS
 *   map?: object    // source map (合并后)
 *   errors: Error[] // 编译错误
 *   dependencies: string[] // 依赖文件路径
 * }
 * ```
 *
 * ## 支持的预处理器
 *
 * | lang | 处理器 | 库 |
 * |------|--------|-----|
 * | scss | scss | sass |
 * | sass | sass（缩进语法） | sass |
 * | less | less | less |
 * | styl/stylus | styl | stylus |
 *
 * ## 关键实现细节
 *
 * ### Sass 双 API 兼容
 * - 优先使用新 API `compileString`（sass >= 1.45.0）
 * - 回退到旧 API `renderSync`（sass < 1.45.0 或 node-sass）
 *
 * ### additionalData 支持
 * 字符串：前置拼接；函数：调用返回完整内容。
 *
 * ### Source Map 合并
 * 使用 `merge-source-map` 合并预处理器生成的 source map，
 * 保持完整的源映射链。
 */

import merge from 'merge-source-map'
import type { RawSourceMap } from '@vue/compiler-core'
import type { SFCStyleCompileOptions } from '../compileStyle'
import { isFunction } from '@vue/shared'

export type StylePreprocessor = (
  source: string,
  map: RawSourceMap | undefined,
  options: {
    [key: string]: any
    additionalData?: string | ((source: string, filename: string) => string)
    filename: string
  },
  customRequire: SFCStyleCompileOptions['preprocessCustomRequire'],
) => StylePreprocessorResults

export interface StylePreprocessorResults {
  code: string
  map?: object
  errors: Error[]
  dependencies: string[]
}

// .scss/.sass processor
const scss: StylePreprocessor = (source, map, options, load = require) => {
  const nodeSass: typeof import('sass') = load('sass')
  const { compileString, renderSync } = nodeSass

  const data = getSource(source, options.filename, options.additionalData)
  let css: string
  let dependencies: string[]
  let sourceMap: any

  try {
    // 新 API (sass >= 1.45.0)
    if (compileString) {
      const { pathToFileURL, fileURLToPath }: typeof import('url') = load('url')

      const result = compileString(data, {
        ...options,
        url: pathToFileURL(options.filename),
        sourceMap: !!map,
      })
      css = result.css
      dependencies = result.loadedUrls.map(url => fileURLToPath(url))
      sourceMap = map ? result.sourceMap! : undefined
    } else {
      // 旧 API (sass < 1.45.0 或 node-sass)
      const result = renderSync({
        ...options,
        data,
        file: options.filename,
        outFile: options.filename,
        sourceMap: !!map,
      })
      css = result.css.toString()
      dependencies = result.stats.includedFiles
      sourceMap = map ? JSON.parse(result.map!.toString()) : undefined
    }

    if (map) {
      return {
        code: css,
        errors: [],
        dependencies,
        map: merge(map, sourceMap!),
      }
    }
    return { code: css, errors: [], dependencies }
  } catch (e: any) {
    return { code: '', errors: [e], dependencies: [] }
  }
}

// sass（缩进语法）→ 复用 scss 处理器，设置 indentedSyntax: true
const sass: StylePreprocessor = (source, map, options, load) =>
  scss(
    source,
    map,
    {
      ...options,
      indentedSyntax: true,
    },
    load,
  )

// .less
const less: StylePreprocessor = (source, map, options, load = require) => {
  const nodeLess = load('less')

  let result: any
  let error: Error | null = null
  // Less render 使用回调模式（syncImport 确保同步）
  nodeLess.render(
    getSource(source, options.filename, options.additionalData),
    { ...options, syncImport: true },
    (err: Error | null, output: any) => {
      error = err
      result = output
    },
  )

  if (error) return { code: '', errors: [error], dependencies: [] }
  const dependencies = result.imports
  if (map) {
    return {
      code: result.css.toString(),
      map: merge(map, result.map),
      errors: [],
      dependencies: dependencies,
    }
  }

  return {
    code: result.css.toString(),
    errors: [],
    dependencies: dependencies,
  }
}

// .styl / .stylus
const styl: StylePreprocessor = (source, map, options, load = require) => {
  const nodeStylus = load('stylus')
  try {
    const ref = nodeStylus(source, options)
    if (map) ref.set('sourcemap', { inline: false, comment: false })

    const result = ref.render()
    const dependencies = ref.deps()
    if (map) {
      return {
        code: result,
        map: merge(map, ref.sourcemap),
        errors: [],
        dependencies,
      }
    }

    return { code: result, errors: [], dependencies }
  } catch (e: any) {
    return { code: '', errors: [e], dependencies: [] }
  }
}

/**
 * 拼接 additionalData 与源码
 * - 字符串 → 前置拼接
 * - 函数 → 调用函数返回完整内容
 */
function getSource(
  source: string,
  filename: string,
  additionalData?: string | ((source: string, filename: string) => string),
) {
  if (!additionalData) return source
  if (isFunction(additionalData)) {
    return additionalData(source, filename)
  }
  return additionalData + source
}

export type PreprocessLang = 'less' | 'sass' | 'scss' | 'styl' | 'stylus'

/** 预处理器查找表 */
export const processors: Record<PreprocessLang, StylePreprocessor> = {
  less,
  sass,
  scss,
  styl,
  stylus: styl,
}
