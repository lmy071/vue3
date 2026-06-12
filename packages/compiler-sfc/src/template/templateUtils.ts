/**
 * templateUtils.ts —— 模板工具函数
 *
 * ## 功能概述
 * 模板编译中用于处理资源 URL 的工具函数集。
 *
 * ## 包含的检测函数
 * - **isRelativeUrl**：相对路径检测（`.` `~` `@` `#` 开头）
 * - **isExternalUrl**：外部 URL 检测（http: / https: / // 开头）
 * - **isDataUrl**：Data URL 检测（data: 开头）
 * - **normalizeDecodedImportPath**：解码 URI 编码的路径
 * - **parseUrl**：解析 URL 字符串，处理 `~` 前缀
 *   `~` 是 webpack 的模块根路径别名，后续 `/` 可选
 */

import { type UrlWithStringQuery, parse as uriParse } from 'url'
import { isString } from '@vue/shared'

export function isRelativeUrl(url: string): boolean {
  const firstChar = url.charAt(0)
  return (
    firstChar === '.' ||
    firstChar === '~' ||
    firstChar === '@' ||
    firstChar === '#'
  )
}

const externalRE = /^(?:https?:)?\/\//
export function isExternalUrl(url: string): boolean {
  return externalRE.test(url)
}

const dataUrlRE = /^\s*data:/i
export function isDataUrl(url: string): boolean {
  return dataUrlRE.test(url)
}

export function normalizeDecodedImportPath(source: string): string {
  try {
    return decodeURIComponent(source)
  } catch {
    return source
  }
}

/**
 * 解析 URL 字符串
 *
 * 处理 `~` 前缀：移除 `~/` 或 `~` 后的路径是模块根路径解析起点。
 */
export function parseUrl(url: string): UrlWithStringQuery {
  const firstChar = url.charAt(0)
  if (firstChar === '~') {
    const secondChar = url.charAt(1)
    url = url.slice(secondChar === '/' ? 2 : 1)
  }
  return parseUriParts(url)
}

/**
 * vuejs/component-compiler-utils#22 支持 URI fragment
 *
 * 使用 querystring 模式关闭、斜杠不作主机名识别的方式解析 URL。
 */
function parseUriParts(urlString: string): UrlWithStringQuery {
  return uriParse(isString(urlString) ? urlString : '', false, true)
}
