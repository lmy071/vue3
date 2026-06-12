/**
 * importUsageCheck.ts —— 模板中 import 使用检测
 *
 * ## 功能概述
 * 分析 `<template>` 中引用了哪些标识符，用于确定：
 * - `<script setup>` 的 import 是否需要保留在输出中
 * - 非内联模式下 setup() 返回值应包含哪些属性
 *
 * ## 核心机制
 *
 * ### isImportUsed
 * 检测某个 import 的本地名称是否在模板中被使用。
 *
 * ### resolveTemplateAnalysisResult
 * 遍历模板 AST 收集两类信息：
 * 1. **usedIds**：模板中用到的所有标识符（组件/指令/ref/插值）
 * 2. **vModelIds**：v-model 绑定的目标标识符
 *
 * ## 分析范围
 *
 * | 来源 | 提取内容 |
 * |------|----------|
 * | 组件标签 | PascalCase + camelCase → 组件名、动态组件 |
 * | v-xxx 指令 | 非内置指令 → v-xxx 指令名 |
 * | 动态参数 | v-bind:[name] → name 标识符 |
 * | v-bind 简写(无值) | v-bind:name → name 标识符 |
 * | ref 属性 | ref="xxx" → xxx 标识符 |
 * | 插值 | {{ expr }} → 表达式中所有标识符 |
 * | v-for | v-for 源表达式 → 源中所有标识符 |
 *
 * ## 缓存
 * 使用 LRU/Map 缓存模板分析结果，避免重复遍历 AST。
 */

import type { SFCDescriptor } from '../parse'
import {
  type ExpressionNode,
  NodeTypes,
  type SimpleExpressionNode,
  type TemplateChildNode,
  isSimpleIdentifier,
  parserOptions,
  walkIdentifiers,
} from '@vue/compiler-dom'
import { createCache } from '../cache'
import { camelize, capitalize, isBuiltInDirective } from '@vue/shared'

export function isImportUsed(local: string, sfc: SFCDescriptor): boolean {
  return resolveTemplateUsedIdentifiers(sfc).has(local)
}

const templateAnalysisCache = createCache<{
  usedIds?: Set<string>
  vModelIds: Set<string>
}>()

export function resolveTemplateVModelIdentifiers(
  sfc: SFCDescriptor,
): Set<string> {
  return resolveTemplateAnalysisResult(sfc, false).vModelIds
}

function resolveTemplateUsedIdentifiers(sfc: SFCDescriptor): Set<string> {
  return resolveTemplateAnalysisResult(sfc).usedIds!
}

function resolveTemplateAnalysisResult(
  sfc: SFCDescriptor,
  collectUsedIds = true,
): {
  usedIds?: Set<string>
  vModelIds: Set<string>
} {
  const { content, ast } = sfc.template!
  const cached = templateAnalysisCache.get(content)
  if (cached && (!collectUsedIds || cached.usedIds)) {
    return cached
  }

  // collectUsedIds=false → 跳过昂贵的标识符提取，仅收集 vModelIds
  const ids = collectUsedIds ? new Set<string>() : undefined
  const vModelIds = new Set<string>()

  ast!.children.forEach(walk)

  function walk(node: TemplateChildNode) {
    switch (node.type) {
      case NodeTypes.ELEMENT:
        let tag = node.tag
        // 处理带命名空间的标签名(如 foo.bar → foo)
        if (tag.includes('.')) tag = tag.split('.')[0].trim()
        if (
          !parserOptions.isNativeTag!(tag) &&
          !parserOptions.isBuiltInComponent!(tag)
        ) {
          if (ids) {
            // 收集 PascalCase + camelCase 两种形式
            ids.add(camelize(tag))
            ids.add(capitalize(camelize(tag)))
          }
        }
        for (let i = 0; i < node.props.length; i++) {
          const prop = node.props[i]
          if (prop.type === NodeTypes.DIRECTIVE) {
            if (ids) {
              // 非内置指令名 → 可能是自定义指令 import
              if (!isBuiltInDirective(prop.name)) {
                ids.add(`v${capitalize(camelize(prop.name))}`)
              }
            }

            // v-model 目标标识符（仅简单标识符）
            if (prop.name === 'model') {
              const exp = prop.exp
              if (exp && exp.type === NodeTypes.SIMPLE_EXPRESSION) {
                const expString = exp.content.trim()
                if (
                  isSimpleIdentifier(expString) &&
                  expString !== 'undefined'
                ) {
                  vModelIds.add(expString)
                }
              }
            }

            // 动态指令参数 → 提取参数表达式中的标识符
            if (
              ids &&
              prop.arg &&
              !(prop.arg as SimpleExpressionNode).isStatic
            ) {
              extractIdentifiers(ids, prop.arg)
            }

            if (ids) {
              if (prop.name === 'for') {
                extractIdentifiers(ids, prop.forParseResult!.source)
              } else if (prop.exp) {
                extractIdentifiers(ids, prop.exp)
              } else if (prop.name === 'bind' && !prop.exp) {
                // v-bind 简写无值 → 属性名即标识符
                ids.add(camelize((prop.arg as SimpleExpressionNode).content))
              }
            }
          }
          if (
            ids &&
            prop.type === NodeTypes.ATTRIBUTE &&
            prop.name === 'ref' &&
            prop.value?.content
          ) {
            ids.add(prop.value.content)
          }
        }
        node.children.forEach(walk)
        break
      case NodeTypes.INTERPOLATION:
        if (ids) extractIdentifiers(ids, node.content)
        break
    }
  }

  const result = { usedIds: ids, vModelIds }
  templateAnalysisCache.set(content, result)
  return result
}

function extractIdentifiers(ids: Set<string>, node: ExpressionNode) {
  if (node.ast) {
    walkIdentifiers(node.ast, n => ids.add(n.name))
  } else if (node.ast === null) {
    ids.add((node as SimpleExpressionNode).content)
  }
}
