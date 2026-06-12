/**
 * parse.ts —— SFC 解析核心
 *
 * ## 功能概述
 * 将 `.vue` 单文件组件解析为 SFCDescriptor。
 * 是整个 compiler-sfc 的入口和基础。
 *
 * ## 解析流程
 *
 * ```
 * source → compiler.parse() → AST 遍历 → 提取块 → source map → CSS vars → 缓存
 * ```
 *
 * 1. **缓存检查**：基于 source + options 的 hash 查缓存
 * 2. **编译器解析**：使用 compiler.parse() → RootNode
 * 3. **遍历 AST**：提取 template/script/style/custom blocks
 * 4. **校验**：script setup + src 冲突、重复块检测
 * 5. **Pug 去缩进**：处理 pug/jade 模板的缩进
 * 6. **Source Map**：为每个块生成源映射
 * 7. **CSS Vars 提取**：parseCssVars
 * 8. **:slotted 检测**：计算 slotted 标志
 *
 * ## 块类型
 *
 * | 类型 | 接口 | 特殊属性 |
 * |------|------|----------|
 * | template | SFCTemplateBlock | lang, src, ast |
 * | script | SFCScriptBlock | setup, bindings, imports |
 * | script setup | SFCScriptBlock | setup, bindings, imports |
 * | style | SFCStyleBlock | scoped, module, lang |
 * | custom | SFCBlock | 任意属性 |
 *
 * ## 缓存（parseCache）
 * - 默认使用 LRU 缓存
 * - 基于 source + options 的 hash 查找
 *
 * ## Padding 处理
 *
 * 当 `pad` 选项为 true 时，用空白/注释填充块内容，
 * 使 source map 的行列直接对应原始文件位置。
 *
 * - `pad: 'line'` → 用空行填充
 * - `pad: 'space'` → 用空格填充
 * - script 无 lang → 用 `//` 注释填充
 *
 * ## HMR 重载判断（hmrShouldReload）
 *
 * 检测 `<script setup lang="ts">` 中因模板变化导致的
 * unused import 裁剪差异 → 决定 HMR 是热更新还是重载。
 *
 * ## dedent
 *
 * 计算并移除 Pug/Jade 模板的公共缩进，
 * 使编译器能正确解析模板内容。
 */

import {
  type BindingMetadata,
  type CodegenSourceMapGenerator,
  type CompilerError,
  type ElementNode,
  NodeTypes,
  type ParserOptions,
  type RawSourceMap,
  type RootNode,
  type SourceLocation,
  createRoot,
} from '@vue/compiler-core'
import * as CompilerDOM from '@vue/compiler-dom'
import { SourceMapGenerator } from 'source-map-js'
import type { TemplateCompiler } from './compileTemplate'
import { parseCssVars } from './style/cssVars'
import { createCache } from './cache'
import type { ImportBinding } from './compileScript'
import { isImportUsed } from './script/importUsageCheck'
import type { LRUCache } from 'lru-cache'
import { genCacheKey } from '@vue/shared'

export const DEFAULT_FILENAME = 'anonymous.vue'

export interface SFCParseOptions {
  filename?: string
  sourceMap?: boolean
  sourceRoot?: string
  pad?: boolean | 'line' | 'space'
  ignoreEmpty?: boolean
  compiler?: TemplateCompiler
  templateParseOptions?: ParserOptions
}

export interface SFCBlock {
  type: string
  content: string
  attrs: Record<string, string | true>
  loc: SourceLocation
  map?: RawSourceMap
  lang?: string
  src?: string
}

export interface SFCTemplateBlock extends SFCBlock {
  type: 'template'
  ast?: RootNode
}

export interface SFCScriptBlock extends SFCBlock {
  type: 'script'
  setup?: string | boolean
  bindings?: BindingMetadata
  imports?: Record<string, ImportBinding>
  scriptAst?: import('@babel/types').Statement[]
  scriptSetupAst?: import('@babel/types').Statement[]
  warnings?: string[]
  /**
   * 完整解析的依赖文件路径（unix 斜杠），含宏使用的导入类型，
   * 用于 @vitejs/plugin-vue 和 vue-loader 的 HMR 缓存失效
   */
  deps?: string[]
}

export interface SFCStyleBlock extends SFCBlock {
  type: 'style'
  scoped?: boolean
  module?: string | boolean
}

export interface SFCDescriptor {
  filename: string
  source: string
  template: SFCTemplateBlock | null
  script: SFCScriptBlock | null
  scriptSetup: SFCScriptBlock | null
  styles: SFCStyleBlock[]
  customBlocks: SFCBlock[]
  cssVars: string[]
  /** 是否使用了 :slotted() 修饰符（编译器优化提示） */
  slotted: boolean
  /**
   * 比较前后 descriptor 决定 HMR 是 reload 还是 re-render
   *
   * 前提：前后 script 相同，仅检查 `<script setup lang="ts">`
   * 中 unused import 裁剪结果因模板变化导致的差异
   */
  shouldForceReload: (prevImports: Record<string, ImportBinding>) => boolean
}

export interface SFCParseResult {
  descriptor: SFCDescriptor
  errors: (CompilerError | SyntaxError)[]
}

export const parseCache:
  | Map<string, SFCParseResult>
  | LRUCache<string, SFCParseResult> = createCache<SFCParseResult>()

export function parse(
  source: string,
  options: SFCParseOptions = {},
): SFCParseResult {
  const sourceKey = genCacheKey(source, {
    ...options,
    compiler: { parse: options.compiler?.parse },
  })
  const cache = parseCache.get(sourceKey)
  if (cache) {
    return cache
  }

  const {
    sourceMap = true,
    filename = DEFAULT_FILENAME,
    sourceRoot = '',
    pad = false,
    ignoreEmpty = true,
    compiler = CompilerDOM,
    templateParseOptions = {},
  } = options

  const descriptor: SFCDescriptor = {
    filename,
    source,
    template: null,
    script: null,
    scriptSetup: null,
    styles: [],
    customBlocks: [],
    cssVars: [],
    slotted: false,
    shouldForceReload: prevImports => hmrShouldReload(prevImports, descriptor),
  }

  const errors: (CompilerError | SyntaxError)[] = []
  const ast = compiler.parse(source, {
    parseMode: 'sfc',
    prefixIdentifiers: true,
    ...templateParseOptions,
    onError: e => {
      errors.push(e)
    },
  })
  ast.children.forEach(node => {
    if (node.type !== NodeTypes.ELEMENT) {
      return
    }
    // 忽略空元素（非 template 标签）
    if (
      ignoreEmpty &&
      node.tag !== 'template' &&
      isEmpty(node) &&
      !hasSrc(node)
    ) {
      return
    }
    switch (node.tag) {
      case 'template':
        if (!descriptor.template) {
          const templateBlock = (descriptor.template = createBlock(
            node,
            source,
            false,
          ) as SFCTemplateBlock)

          if (!templateBlock.attrs.src) {
            templateBlock.ast = createRoot(node.children, source)
          }

          // warn against 2.x <template functional>
          if (templateBlock.attrs.functional) {
            const err = new SyntaxError(
              `<template functional> is no longer supported in Vue 3, since ` +
                `functional components no longer have significant performance ` +
                `difference from stateful ones. Just use a normal <template> ` +
                `instead.`,
            ) as CompilerError
            err.loc = node.props.find(
              p => p.type === NodeTypes.ATTRIBUTE && p.name === 'functional',
            )!.loc
            errors.push(err)
          }
        } else {
          errors.push(createDuplicateBlockError(node))
        }
        break
      case 'script':
        const scriptBlock = createBlock(node, source, pad) as SFCScriptBlock
        const isSetup = !!scriptBlock.attrs.setup
        if (isSetup && !descriptor.scriptSetup) {
          descriptor.scriptSetup = scriptBlock
          break
        }
        if (!isSetup && !descriptor.script) {
          descriptor.script = scriptBlock
          break
        }
        errors.push(createDuplicateBlockError(node, isSetup))
        break
      case 'style':
        const styleBlock = createBlock(node, source, pad) as SFCStyleBlock
        if (styleBlock.attrs.vars) {
          errors.push(
            new SyntaxError(
              `<style vars> has been replaced by a new proposal: ` +
                `https://github.com/vuejs/rfcs/pull/231`,
            ),
          )
        }
        descriptor.styles.push(styleBlock)
        break
      default:
        descriptor.customBlocks.push(createBlock(node, source, pad))
        break
    }
  })
  if (!descriptor.template && !descriptor.script && !descriptor.scriptSetup) {
    errors.push(
      new SyntaxError(
        `At least one <template> or <script> is required in a single file component. ${descriptor.filename}`,
      ),
    )
  }
  // script setup 特殊校验
  if (descriptor.scriptSetup) {
    if (descriptor.scriptSetup.src) {
      errors.push(
        new SyntaxError(
          `<script setup> cannot use the "src" attribute because ` +
            `its syntax will be ambiguous outside of the component.`,
        ),
      )
      descriptor.scriptSetup = null
    }
    if (descriptor.script && descriptor.script.src) {
      errors.push(
        new SyntaxError(
          `<script> cannot use the "src" attribute when <script setup> is ` +
            `also present because they must be processed together.`,
        ),
      )
      descriptor.script = null
    }
  }

  // Pug/Jade 模板去缩进
  let templateColumnOffset = 0
  if (
    descriptor.template &&
    (descriptor.template.lang === 'pug' || descriptor.template.lang === 'jade')
  ) {
    ;[descriptor.template.content, templateColumnOffset] = dedent(
      descriptor.template.content,
    )
  }

  // 生成 source map（每个块的 content → 原始 source）
  if (sourceMap) {
    const genMap = (block: SFCBlock | null, columnOffset = 0) => {
      if (block && !block.src) {
        block.map = generateSourceMap(
          filename,
          source,
          block.content,
          sourceRoot,
          !pad || block.type === 'template' ? block.loc.start.line - 1 : 0,
          columnOffset,
        )
      }
    }
    genMap(descriptor.template, templateColumnOffset)
    genMap(descriptor.script)
    descriptor.styles.forEach(s => genMap(s))
    descriptor.customBlocks.forEach(s => genMap(s))
  }

  // 解析 CSS 变量
  descriptor.cssVars = parseCssVars(descriptor)

  // 检查是否使用 :slotted
  const slottedRE = /(?:::v-|:)slotted\(/
  descriptor.slotted = descriptor.styles.some(
    s => s.scoped && slottedRE.test(s.content),
  )

  const result = {
    descriptor,
    errors,
  }
  parseCache.set(sourceKey, result)
  return result
}

function createDuplicateBlockError(
  node: ElementNode,
  isScriptSetup = false,
): CompilerError {
  const err = new SyntaxError(
    `Single file component can contain only one <${node.tag}${
      isScriptSetup ? ` setup` : ``
    }> element`,
  ) as CompilerError
  err.loc = node.loc
  return err
}

function createBlock(
  node: ElementNode,
  source: string,
  pad: SFCParseOptions['pad'],
): SFCBlock {
  const type = node.tag
  const loc = node.innerLoc!
  const attrs: Record<string, string | true> = {}
  const block: SFCBlock = {
    type,
    content: source.slice(loc.start.offset, loc.end.offset),
    loc,
    attrs,
  }
  if (pad) {
    block.content = padContent(source, block, pad) + block.content
  }
  node.props.forEach(p => {
    if (p.type === NodeTypes.ATTRIBUTE) {
      const name = p.name
      attrs[name] = p.value ? p.value.content || true : true
      if (name === 'lang') {
        block.lang = p.value && p.value.content
      } else if (name === 'src') {
        block.src = p.value && p.value.content
      } else if (type === 'style') {
        if (name === 'scoped') {
          ;(block as SFCStyleBlock).scoped = true
        } else if (name === 'module') {
          ;(block as SFCStyleBlock).module = attrs[name]
        }
      } else if (type === 'script' && name === 'setup') {
        ;(block as SFCScriptBlock).setup = attrs.setup
      }
    }
  })
  return block
}

const splitRE = /\r?\n/g
const emptyRE = /^(?:\/\/)?\s*$/
const replaceRE = /./g

/**
 * 生成块级别 source map
 *
 * 将块的每一行映射回原始 SFC 的对应行。
 * 只映射非空白字符，因为列对齐在 padding 下不可靠。
 */
function generateSourceMap(
  filename: string,
  source: string,
  generated: string,
  sourceRoot: string,
  lineOffset: number,
  columnOffset: number,
): RawSourceMap {
  const map = new SourceMapGenerator({
    file: filename.replace(/\\/g, '/'),
    sourceRoot: sourceRoot.replace(/\\/g, '/'),
  }) as unknown as CodegenSourceMapGenerator
  map.setSourceContent(filename, source)
  map._sources.add(filename)
  generated.split(splitRE).forEach((line, index) => {
    if (!emptyRE.test(line)) {
      const originalLine = index + 1 + lineOffset
      const generatedLine = index + 1
      for (let i = 0; i < line.length; i++) {
        if (!/\s/.test(line[i])) {
          map._mappings.add({
            originalLine,
            originalColumn: i + columnOffset,
            generatedLine,
            generatedColumn: i,
            source: filename,
            name: null,
          })
        }
      }
    }
  })
  return map.toJSON()
}

/**
 * Padding 填充
 *
 * 在块内容前填充空白使 source map 行列直接对应原始文件：
 * - 'space' → 用空格填充
 * - 其他 → 用空行/注释填充
 */
function padContent(
  content: string,
  block: SFCBlock,
  pad: SFCParseOptions['pad'],
): string {
  content = content.slice(0, block.loc.start.offset)
  if (pad === 'space') {
    return content.replace(replaceRE, ' ')
  } else {
    const offset = content.split(splitRE).length
    const padChar = block.type === 'script' && !block.lang ? '//\n' : '\n'
    return Array(offset).join(padChar)
  }
}

function hasSrc(node: ElementNode) {
  return node.props.some(p => {
    if (p.type !== NodeTypes.ATTRIBUTE) {
      return false
    }
    return p.name === 'src'
  })
}

/**
 * 过滤空文本节点后判断元素是否为空
 */
function isEmpty(node: ElementNode) {
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (child.type !== NodeTypes.TEXT || child.content.trim() !== '') {
      return false
    }
  }
  return true
}

/**
 * HMR 重载判断
 *
 * 前提：前后 script 内容相同。
 * 仅检查 `<script setup lang="ts">` 中因模板变化导致的 unused import 裁剪差异。
 */
export function hmrShouldReload(
  prevImports: Record<string, ImportBinding>,
  next: SFCDescriptor,
): boolean {
  if (
    !next.scriptSetup ||
    (next.scriptSetup.lang !== 'ts' && next.scriptSetup.lang !== 'tsx')
  ) {
    return false
  }

  // 如果某 import 之前未使用但新模板中使用了 → 需要重载
  for (const key in prevImports) {
    if (!prevImports[key].isUsedInTemplate && isImportUsed(key, next)) {
      return true
    }
  }

  return false
}

/**
 * 去缩进
 *
 * 移除所有行公共的前导空白，使编译器能正确解析
 * Pug/Jade 模板中无缩进错误的代码。
 *
 * @returns [去缩进后的字符串, 移除的缩进列数]
 */
function dedent(s: string): [string, number] {
  const lines = s.split('\n')
  const minIndent = lines.reduce(function (minIndent, line) {
    if (line.trim() === '') {
      return minIndent
    }
    const indent = line.match(/^\s*/)?.[0]?.length || 0
    return Math.min(indent, minIndent)
  }, Infinity)
  if (minIndent === 0) {
    return [s, minIndent]
  }
  return [
    lines
      .map(function (line) {
        return line.slice(minIndent)
      })
      .join('\n'),
    minIndent,
  ]
}
