/**
 * transformAssetUrl.ts —— 资源 URL 转换插件
 *
 * ## 功能概述
 * 编译器核心插件，将模板中的相对资源 URL 转换为 import 语句。
 * 这是 `@vue/compiler-sfc` 特有的转换，不在 compiler-core 中。
 *
 * ## 转换示例
 *
 * ```js
 * // 输入
 * createVNode('img', { src: './logo.png' })
 *
 * // 输出
 * import _imports_0 from './logo.png'
 * createVNode('img', { src: _imports_0 })
 * ```
 *
 * ## 内置资源配置
 *
 * | 标签 | 属性 | 说明 |
 * |------|------|------|
 * | video | src, poster | 视频资源 |
 * | source | src | 媒体资源 |
 * | img | src | 图片资源 |
 * | image | xlink:href, href | SVG 图片（默认扩展） |
 * | use | xlink:href, href | SVG use 引用（默认扩展） |
 *
 * 注意：默认配置中 `image` 和 `use` 是用户可覆盖的扩展。
 * `use` 和 `image` 的纯 hash URL（如 `#myClip`）是文档内引用，不应转换。
 *
 * ## URL 分类
 *
 * - **外部链接**（http/https）→ 保持原样
 * - **Data URL**（data:）→ 保持原样
 * - **纯 `#`** → 不转换
 * - **Hash 引用**（`#xxx`）→ 仅 image/use 的 xlink:href/href 可转换
 * - **相对路径** → 转换为 import
 * - **Base 模式** → 相对路径拼接到 base URL
 *
 * ## 通配符标签
 *
 * 配置中 `*` 标签可匹配所有元素上指定属性的 URL 转换。
 */

import path from 'path'
import {
  ConstantTypes,
  type ExpressionNode,
  type NodeTransform,
  NodeTypes,
  type SimpleExpressionNode,
  type SourceLocation,
  type TransformContext,
  createSimpleExpression,
} from '@vue/compiler-core'
import {
  isDataUrl,
  isExternalUrl,
  isRelativeUrl,
  normalizeDecodedImportPath,
  parseUrl,
} from './templateUtils'
import { isArray } from '@vue/shared'

export interface AssetURLTagConfig {
  [name: string]: string[]
}

export interface AssetURLOptions {
  /**
   * 如果提供了 base，相对 URL 将直接重写为绝对 URL
   * 而非生成 import（适用于已知部署路径的场景）
   */
  base?: string | null
  /**
   * 为 true 时也处理绝对 URL
   */
  includeAbsolute?: boolean
  tags?: AssetURLTagConfig
}

// 内置资源 URL 标签配置
// `use` 和 `image` 故意未包含在内，因为它们的纯 hash 值
// 是文档内引用而非模块说明符
const resourceUrlTagConfig: AssetURLTagConfig = {
  video: ['src', 'poster'],
  source: ['src'],
  img: ['src'],
}

/** 默认资源配置（扩展了 image/use 的支持） */
export const defaultAssetUrlOptions: Required<AssetURLOptions> = {
  base: null,
  includeAbsolute: false,
  tags: {
    ...resourceUrlTagConfig,
    image: ['xlink:href', 'href'],
    use: ['xlink:href', 'href'],
  },
}

/**
 * 规范化选项 —— 兼容旧的 tags-only 格式
 */
export const normalizeOptions = (
  options: AssetURLOptions | AssetURLTagConfig,
): Required<AssetURLOptions> => {
  if (Object.keys(options).some(key => isArray((options as any)[key]))) {
    // 旧格式：直接传 tags 配置
    return {
      ...defaultAssetUrlOptions,
      tags: options as any,
    }
  }
  return {
    ...defaultAssetUrlOptions,
    ...options,
  }
}

export const createAssetUrlTransformWithOptions = (
  options: Required<AssetURLOptions>,
): NodeTransform => {
  return (node, context) =>
    (transformAssetUrl as Function)(node, context, options)
}

/**
 * 检查指定标签+属性组合是否可转换纯 hash import
 * 仅内置配置中的 image/use 的 xlink:href/href 支持
 */
function canTransformHashImport(tag: string, attrName: string): boolean {
  return !!resourceUrlTagConfig[tag]?.includes(attrName)
}

/**
 * `@vue/compiler-core` 插件：将相对资源 URL 转换为 import 或绝对 URL
 */
export const transformAssetUrl: NodeTransform = (
  node,
  context,
  options: AssetURLOptions = defaultAssetUrlOptions,
) => {
  if (node.type === NodeTypes.ELEMENT) {
    if (!node.props.length) {
      return
    }

    const tags = options.tags || defaultAssetUrlOptions.tags
    const attrs = tags[node.tag]
    const wildCardAttrs = tags['*']
    if (!attrs && !wildCardAttrs) {
      return
    }

    const assetAttrs = (attrs || []).concat(wildCardAttrs || [])
    node.props.forEach((attr, index) => {
      if (
        attr.type !== NodeTypes.ATTRIBUTE ||
        !assetAttrs.includes(attr.name) ||
        !attr.value
      ) {
        return
      }

      const urlValue = attr.value.content
      const isHashOnlyValue = urlValue[0] === '#'
      if (
        isExternalUrl(urlValue) ||
        isDataUrl(urlValue) ||
        // 纯 `#` 不是有效 import
        urlValue === '#' ||
        (isHashOnlyValue && !canTransformHashImport(node.tag, attr.name)) ||
        (!options.includeAbsolute && !isRelativeUrl(urlValue))
      ) {
        return
      }

      const url = parseUrl(urlValue)
      // base 模式：相对路径直接拼接到 base URL
      if (options.base && urlValue[0] === '.') {
        const base = parseUrl(options.base)
        const protocol = base.protocol || ''
        const host = base.host ? protocol + '//' + base.host : ''
        const basePath = base.path || '/'

        attr.value.content =
          host +
          (path.posix || path).join(basePath, url.path + (url.hash || ''))
        return
      }

      // 转换为 import（由打包器解析为正确的绝对 URL）
      const exp = getImportsExpressionExp(url.path, url.hash, attr.loc, context)
      node.props[index] = {
        type: NodeTypes.DIRECTIVE,
        name: 'bind',
        arg: createSimpleExpression(attr.name, true, attr.loc),
        exp,
        modifiers: [],
        loc: attr.loc,
      }
    })
  }
}

/**
 * 解析或注册 import（去重）
 */
function resolveOrRegisterImport(
  source: string,
  loc: SourceLocation,
  context: TransformContext,
): {
  name: string
  exp: SimpleExpressionNode
} {
  const normalizedSource = normalizeDecodedImportPath(source)
  const existingIndex = context.imports.findIndex(
    i => i.path === normalizedSource,
  )
  if (existingIndex > -1) {
    return {
      name: `_imports_${existingIndex}`,
      exp: context.imports[existingIndex].exp as SimpleExpressionNode,
    }
  }

  const name = `_imports_${context.imports.length}`
  const exp = createSimpleExpression(
    name,
    false,
    loc,
    ConstantTypes.CAN_STRINGIFY,
  )

  context.imports.push({
    exp,
    path: normalizedSource,
  })

  return { name, exp }
}

/**
 * 将资源 URL 转换为 import 表达式或字符串字面量
 *
 * 处理四种情况：
 * 1. 无 path 无 hash → `''`
 * 2. 仅 hash 无 path → import(hash)
 * 3. 仅 path 无 hash → import(path)
 * 4. path + hash → import(path) + 'hash'（可提升）
 */
function getImportsExpressionExp(
  path: string | null,
  hash: string | null,
  loc: SourceLocation,
  context: TransformContext,
): ExpressionNode {
  if (!path && !hash) {
    return createSimpleExpression(`''`, false, loc, ConstantTypes.CAN_STRINGIFY)
  }

  if (!path && hash) {
    const { exp } = resolveOrRegisterImport(hash, loc, context)
    return exp
  }

  if (path && !hash) {
    const { exp } = resolveOrRegisterImport(path, loc, context)
    return exp
  }

  // path + hash 组合 → 需拼接
  const { name } = resolveOrRegisterImport(path!, loc, context)

  const hashExp = `${name} + '${hash}'`
  const finalExp = createSimpleExpression(
    hashExp,
    false,
    loc,
    ConstantTypes.CAN_STRINGIFY,
  )

  if (!context.hoistStatic) {
    return finalExp
  }

  // 检查是否已有相同内容的提升表达式
  const existingHoistIndex = context.hoists.findIndex(h => {
    return (
      h &&
      h.type === NodeTypes.SIMPLE_EXPRESSION &&
      !h.isStatic &&
      h.content === hashExp
    )
  })

  if (existingHoistIndex > -1) {
    return createSimpleExpression(
      `_hoisted_${existingHoistIndex + 1}`,
      false,
      loc,
      ConstantTypes.CAN_STRINGIFY,
    )
  }

  // 提升为静态表达式
  return context.hoist(finalExp)
}
