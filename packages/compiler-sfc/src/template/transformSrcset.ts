/**
 * transformSrcset.ts —— srcset 属性转换
 *
 * ## 功能概述
 * 转换模板中 `<img>` 和 `<source>` 元素的 srcset 属性，
 * 将相对路径的图片 URL 替换为 import 引用。
 *
 * ## 处理流程
 *
 * 1. **分割候选列表**：按逗号分割 `srcset` 属性值为多个 candidate
 * 2. **Data URL 合并**：data url 中的逗号会被误分割，需重新合并
 * 3. **URL 分类**：
 *    - 外部链接 / Data URL → 保持原样
 *    - 相对路径 / 可处理 URL → 转换为 import
 * 4. **Base 路径处理**：如果有 base 选项，`.`开头的路径直接拼接 base
 * 5. **生成复合表达式**：多个 candidate 通过 `+` 拼接
 * 6. **静态提升**：hoistStatic 开启时将整个 srcset 表达式提升为常量
 *
 * ## srcset 示例
 *
 * ```
 * // 输入
 * <img srcset="./small.jpg 480w, ./large.jpg 1080w" />
 *
 * // 输出
 * <img :srcset="_imports_0 + ' 480w, ' + _imports_1 + ' 1080w'" />
 * ```
 */

import path from 'path'
import {
  ConstantTypes,
  type ExpressionNode,
  type NodeTransform,
  NodeTypes,
  type SimpleExpressionNode,
  createCompoundExpression,
  createSimpleExpression,
} from '@vue/compiler-core'
import {
  isDataUrl,
  isExternalUrl,
  isRelativeUrl,
  normalizeDecodedImportPath,
  parseUrl,
} from './templateUtils'
import {
  type AssetURLOptions,
  defaultAssetUrlOptions,
} from './transformAssetUrl'

const srcsetTags = ['img', 'source']

interface ImageCandidate {
  url: string
  descriptor: string
}

// W3C 图像候选字符串规范中的转义空白字符
const escapedSpaceCharacters = /( |\\t|\\n|\\f|\\r)+/g

export const createSrcsetTransformWithOptions = (
  options: Required<AssetURLOptions>,
): NodeTransform => {
  return (node, context) =>
    (transformSrcset as Function)(node, context, options)
}

export const transformSrcset: NodeTransform = (
  node,
  context,
  options: Required<AssetURLOptions> = defaultAssetUrlOptions,
) => {
  if (node.type === NodeTypes.ELEMENT) {
    if (srcsetTags.includes(node.tag) && node.props.length) {
      node.props.forEach((attr, index) => {
        if (attr.name === 'srcset' && attr.type === NodeTypes.ATTRIBUTE) {
          if (!attr.value) return
          const value = attr.value.content
          if (!value) return
          // 按逗号分割候选列表，还原转义的空白字符
          const imageCandidates: ImageCandidate[] = value.split(',').map(s => {
            const [url, descriptor] = s
              .replace(escapedSpaceCharacters, ' ')
              .trim()
              .split(' ', 2)
            return { url, descriptor }
          })

          // data URL 中的逗号被误分割，需重新合并
          for (let i = 0; i < imageCandidates.length; i++) {
            const { url } = imageCandidates[i]
            if (isDataUrl(url)) {
              imageCandidates[i + 1].url =
                url + ',' + imageCandidates[i + 1].url
              imageCandidates.splice(i, 1)
            }
          }

          const shouldProcessUrl = (url: string) => {
            return (
              url &&
              !isExternalUrl(url) &&
              !isDataUrl(url) &&
              (options.includeAbsolute || isRelativeUrl(url))
            )
          }
          // 没有需要转换的 URL → 跳过
          if (!imageCandidates.some(({ url }) => shouldProcessUrl(url))) {
            return
          }

          // base 路径处理：`.`开头的路径直接拼接 base
          if (options.base) {
            const base = options.base
            const set: string[] = []
            let needImportTransform = false

            imageCandidates.forEach(candidate => {
              let { url, descriptor } = candidate
              descriptor = descriptor ? ` ${descriptor}` : ``
              if (url[0] === '.') {
                candidate.url = (path.posix || path).join(base, url)
                set.push(candidate.url + descriptor)
              } else if (shouldProcessUrl(url)) {
                needImportTransform = true
              } else {
                set.push(url + descriptor)
              }
            })

            if (!needImportTransform) {
              attr.value.content = set.join(', ')
              return
            }
          }

          // 构建复合表达式：替换 URL 为 import 引用
          const compoundExpression = createCompoundExpression([], attr.loc)
          imageCandidates.forEach(({ url, descriptor }, index) => {
            if (shouldProcessUrl(url)) {
              const { path, hash } = parseUrl(url)
              const source = path ? path : hash
              if (source) {
                const normalizedSource = normalizeDecodedImportPath(source)
                const existingImportsIndex = context.imports.findIndex(
                  i => i.path === normalizedSource,
                )
                let exp: SimpleExpressionNode
                if (existingImportsIndex > -1) {
                  // 复用已有 import
                  exp = createSimpleExpression(
                    `_imports_${existingImportsIndex}`,
                    false,
                    attr.loc,
                    ConstantTypes.CAN_STRINGIFY,
                  )
                } else {
                  exp = createSimpleExpression(
                    `_imports_${context.imports.length}`,
                    false,
                    attr.loc,
                    ConstantTypes.CAN_STRINGIFY,
                  )
                  context.imports.push({ exp, path: normalizedSource })
                }
                // 带 hash 的 URL → 拼接 hash 后缀
                if (path && hash) {
                  exp = createSimpleExpression(
                    `${exp.content} + '${hash}'`,
                    false,
                    attr.loc,
                    ConstantTypes.CAN_STRINGIFY,
                  )
                }
                compoundExpression.children.push(exp)
              }
            } else {
              // 非相对 URL → 保持为字符串字面量
              const exp = createSimpleExpression(
                `"${url}"`,
                false,
                attr.loc,
                ConstantTypes.CAN_STRINGIFY,
              )
              compoundExpression.children.push(exp)
            }
            // 拼接分隔符（descriptor + 逗号）
            const isNotLast = imageCandidates.length - 1 > index
            if (descriptor && isNotLast) {
              compoundExpression.children.push(` + ' ${descriptor}, ' + `)
            } else if (descriptor) {
              compoundExpression.children.push(` + ' ${descriptor}'`)
            } else if (isNotLast) {
              compoundExpression.children.push(` + ', ' + `)
            }
          })

          let exp: ExpressionNode = compoundExpression
          // 静态提升：整个 srcset 表达式变为常量
          if (context.hoistStatic) {
            exp = context.hoist(compoundExpression)
            exp.constType = ConstantTypes.CAN_STRINGIFY
          }

          // 将静态 srcset 属性替换为 :srcset 动态指令
          node.props[index] = {
            type: NodeTypes.DIRECTIVE,
            name: 'bind',
            arg: createSimpleExpression('srcset', true, attr.loc),
            exp,
            modifiers: [],
            loc: attr.loc,
          }
        }
      })
    }
  }
}
