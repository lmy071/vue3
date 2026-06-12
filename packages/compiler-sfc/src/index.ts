/**
 * index.ts —— @vue/compiler-sfc 包公共入口
 *
 * ## 功能概述
 * compiler-sfc 包的单一导出入口，整理了所有公共 API。
 *
 * ## 导出分类
 *
 * ### 核心编译 API
 * - **parse**：SFC 文件解析
 * - **compileTemplate**：模板编译
 * - **compileStyle / compileStyleAsync**：样式编译（同步 + 异步）
 * - **compileScript**：脚本编译
 *
 * ### 工具 API
 * - **rewriteDefault / rewriteDefaultAST**：默认导出重写
 * - **resolveTypeElements / inferRuntimeType**：类型解析
 *
 * ### 内部工具（供 @vue/repl 等使用）
 * - **babelParse**：babel 解析器封装
 * - **MagicString**：字符串操作
 * - **walk**：ESTree AST 遍历
 * - **generateCodeFrame / walkIdentifiers / extractIdentifiers / isInDestructureAssignment / isStaticProperty**
 *
 * ### 内部类型解析 API
 * - **invalidateTypeCache / registerTS**：TS 类型缓存管理
 * - **extractRuntimeProps / extractRuntimeEmits**：运行时 props/emits 提取
 *
 * ### 类型导出
 * - SFC 文件描述符相关类型
 * - 编译选项相关类型
 * - Asset URL 处理类型
 *
 * ### 兼容性
 * - **shouldTransformRef**：已废弃，保留以兼容 vite-plugin-vue < 5.0
 * - **parseCache**：解析缓存 Map（#9521 避免暴露 LRU 类型）
 */

export const version: string = __VERSION__

// API
export { parse } from './parse'
export { compileTemplate } from './compileTemplate'
export { compileStyle, compileStyleAsync } from './compileStyle'
export { compileScript } from './compileScript'
export { rewriteDefault, rewriteDefaultAST } from './rewriteDefault'
export { resolveTypeElements, inferRuntimeType } from './script/resolveType'

import { type SFCParseResult, parseCache as _parseCache } from './parse'
// #9521 将 parseCache 导出为简单 Map，避免暴露 LRU 类型
export const parseCache = _parseCache as Map<string, SFCParseResult>

// error messages
import {
  DOMErrorMessages,
  errorMessages as coreErrorMessages,
} from '@vue/compiler-dom'

export const errorMessages: Record<number, string> = {
  ...coreErrorMessages,
  ...DOMErrorMessages,
}

// Utilities
export { parse as babelParse } from '@babel/parser'
import MagicString from 'magic-string'
export { MagicString }
// 技术上属于内部 API，但 @vue/repl 需要它
// 用 any 类型转换避免依赖 estree 类型
import { walk as _walk } from 'estree-walker'
export const walk = _walk as any
export {
  generateCodeFrame,
  walkIdentifiers,
  extractIdentifiers,
  isInDestructureAssignment,
  isStaticProperty,
} from '@vue/compiler-core'

// Internals for type resolution
export { invalidateTypeCache, registerTS } from './script/resolveType'
export { extractRuntimeProps } from './script/defineProps'
export { extractRuntimeEmits } from './script/defineEmits'

// Types
export type {
  SFCParseOptions,
  SFCParseResult,
  SFCDescriptor,
  SFCBlock,
  SFCTemplateBlock,
  SFCScriptBlock,
  SFCStyleBlock,
} from './parse'
export type {
  TemplateCompiler,
  SFCTemplateCompileOptions,
  SFCTemplateCompileResults,
} from './compileTemplate'
export type {
  SFCStyleCompileOptions,
  SFCAsyncStyleCompileOptions,
  SFCStyleCompileResults,
} from './compileStyle'
export type { SFCScriptCompileOptions } from './compileScript'
export type { ScriptCompileContext } from './script/context'
export type {
  TypeResolveContext,
  SimpleTypeResolveOptions,
  SimpleTypeResolveContext,
} from './script/resolveType'
export type {
  AssetURLOptions,
  AssetURLTagConfig,
} from './template/transformAssetUrl'
export type {
  CompilerOptions,
  CompilerError,
  BindingMetadata,
} from '@vue/compiler-core'

/**
 * @deprecated 保留以兼容 reactivitiyTransform: true 的 vite-plugin-vue < 5.0。
 * 预期行为：静默忽略该选项而非报错。
 */
export const shouldTransformRef = () => false
