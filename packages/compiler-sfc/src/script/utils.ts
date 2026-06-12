/**
 * utils.ts —— script 编译通用工具函数
 *
 * ## 功能概述
 * 脚本编译过程中使用的通用工具函数和常量集合。
 *
 * ## 主要工具
 *
 * ### AST 操作
 * - **resolveObjectKey**：解析对象属性键（字符串/数字字面量/非计算标识符）
 * - **isLiteralNode**：检测字面量节点
 * - **isCallOf**：检测是否为指定函数调用
 * - **getId**：从 Identifier 或 StringLiteral 获取名称/值
 * - **getStringLiteralKey**：从 TS 属性签名获取键（处理计算属性）
 *
 * ### 字符串/路径
 * - **concatStrings**：连接过滤空值的字符串列表
 * - **toRuntimeTypeString**：运行态类型数组 → 字符串表示
 * - **normalizePath / joinPaths**：跨平台路径处理
 * - **getEscapedPropName**：特殊符号键 JSON 转义（如 `onUpdate:modelValue`）
 *
 * ### 语言检测
 * - **isJS / isTS**：判断语言标识（js/jsx/ts/tsx）
 *
 * ### 文件名规范化
 * - **createGetCanonicalFileName**：TS 模块解析的大小写处理工厂
 *
 * ### Import 分析
 * - **getImportedName**：获取 import specifier 的名称
 */

import type {
  CallExpression,
  Expression,
  Identifier,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  Node,
  StringLiteral,
  TSMethodSignature,
  TSPropertySignature,
} from '@babel/types'
import path from 'path'

export const UNKNOWN_TYPE = 'Unknown'

export function resolveObjectKey(
  node: Node,
  computed: boolean,
): string | undefined {
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
      return String(node.value)
    case 'Identifier':
      if (!computed) return node.name
  }
  return undefined
}

export function concatStrings(
  strs: Array<string | null | undefined | false>,
): string {
  return strs.filter((s): s is string => !!s).join(', ')
}

export function isLiteralNode(node: Node): boolean {
  return node.type.endsWith('Literal')
}

/**
 * 检测是否是指定函数的调用
 *
 * @param node 待检测节点
 * @param test 函数名（字符串）或名称匹配函数
 */
export function isCallOf(
  node: Node | null | undefined,
  test: string | ((id: string) => boolean) | null | undefined,
): node is CallExpression {
  return !!(
    node &&
    test &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    (typeof test === 'string'
      ? node.callee.name === test
      : test(node.callee.name))
  )
}

export function toRuntimeTypeString(types: string[]): string {
  return types.length > 1 ? `[${types.join(', ')}]` : types[0]
}

export function getImportedName(
  specifier:
    | ImportSpecifier
    | ImportDefaultSpecifier
    | ImportNamespaceSpecifier,
): string {
  if (specifier.type === 'ImportSpecifier')
    return specifier.imported.type === 'Identifier'
      ? specifier.imported.name
      : specifier.imported.value
  else if (specifier.type === 'ImportNamespaceSpecifier') return '*'
  return 'default'
}

export function getId(node: Identifier | StringLiteral): string
export function getId(node: Expression): string | null
export function getId(node: Expression) {
  return node.type === 'Identifier'
    ? node.name
    : node.type === 'StringLiteral'
      ? node.value
      : null
}

export function getStringLiteralKey(
  node: TSPropertySignature | TSMethodSignature,
): string | null {
  return node.computed
    ? node.key.type === 'TemplateLiteral' && !node.key.expressions.length
      ? node.key.quasis.map(q => q.value.cooked).join('')
      : null
    : node.key.type === 'Identifier'
      ? node.key.name
      : node.key.type === 'StringLiteral'
        ? node.key.value
        : node.key.type === 'NumericLiteral'
          ? String(node.key.value)
          : null
}

const identity = (str: string) => str
const fileNameLowerCaseRegExp = /[^\u0130\u0131\u00DFa-z0-9\\/:\-_\. ]+/g
const toLowerCase = (str: string) => str.toLowerCase()

function toFileNameLowerCase(x: string) {
  return fileNameLowerCaseRegExp.test(x)
    ? x.replace(fileNameLowerCaseRegExp, toLowerCase)
    : x
}

/**
 * 创建文件名规范化函数（用于 TS 模块解析缓存）
 *
 * 复制自 TypeScript 源码实现（不直接暴露 getCanonicalFileName）。
 */
export function createGetCanonicalFileName(
  useCaseSensitiveFileNames: boolean,
): (str: string) => string {
  return useCaseSensitiveFileNames ? identity : toFileNameLowerCase
}

// 浏览器构建中 polyfill 不暴露 posix 但默认行为是 posix
const normalize = (path.posix || path).normalize
const windowsSlashRE = /\\/g
export function normalizePath(p: string): string {
  return normalize(p.replace(windowsSlashRE, '/'))
}

export const joinPaths: (...paths: string[]) => string = (path.posix || path)
  .join

/**
 * 属性名可能包含符号时需 JSON 转义
 * 如 `onUpdate:modelValue` → `"onUpdate:modelValue"`
 */
export const propNameEscapeSymbolsRE: RegExp =
  /[ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~\-]/

export function getEscapedPropName(key: string): string {
  return propNameEscapeSymbolsRE.test(key) ? JSON.stringify(key) : key
}

/**
 * 检测语言标识是否为 JS 系列
 */
export const isJS = (...langs: (string | null | undefined)[]): boolean =>
  langs.some(lang => lang === 'js' || lang === 'jsx')
/**
 * 检测语言标识是否为 TS 系列
 */
export const isTS = (...langs: (string | null | undefined)[]): boolean =>
  langs.some(lang => lang === 'ts' || lang === 'tsx')
