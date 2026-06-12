/**
 * pluginScoped.ts —— Scoped CSS PostCSS 插件
 *
 * ## 功能概述
 * 实现 Vue SFC 的 Scoped CSS 特性。
 * 为所有选择器添加 `[data-v-xxxxx]` 属性选择器，
 * 并处理 :deep()、:slotted()、:global() 等深度选择器。
 *
 * ## 选择器重写规则
 *
 * | 原始 | 编译后 | 说明 |
 * |------|--------|------|
 * | `.foo` | `.foo[data-v-xxx]` | 普通选择器后置 |
 * | `*` | `[data-v-xxx]` | 通配符替换 |
 * | `:deep(.bar)` | `[data-v-xxx] .bar` | 穿透当前组件 |
 * | `:slotted(.slot)` | `[data-v-xxx-s] .slot` | slot 内容限定 |
 * | `:global(.baz)` | `.baz` | 全局样式（不添加属性） |
 * | `>>> .x` | `[data-v-xxx] .x` | 已废弃语法 |
 *
 * ## Deep 容器的嵌套处理
 *
 * 对于 `:is()` / `:where()` / `:has()` / `:not()` 中包含 :deep() 的情况：
 *
 * ```
 * .parent :is(.a, :deep(.b), .c) .child
 * → .parent :is(.a, [data-v-xxx] .b, .c[data-v-xxx]) .child
 * ```
 *
 * 当 :is/:where/:has 中存在混合选择器且需要拆分时，
 * 使用 splitSelectorForNestedDeep 将选择器拆分为多条规则。
 *
 * ## 关键帧处理
 *
 * keyframes 名称会被添加 scoped ID 后缀以避免冲突：
 * ```
 * @keyframes fade → @keyframes fade-xxxxx
 * animation: fade  → animation: fade-xxxxx
 * ```
 *
 * ## 规则提取（extractAndWrapNodes）
 *
 * 当 CSS 规则中混合了 rules + declarations 时，
 * 将 declarations 提取并用 `&` 包装：
 * ```css
 * .foo { color: red; .bar { ... } }  →  .foo { .bar { ... } } + .foo { & { color: red } }
 * ```
 */

import {
  type AtRule,
  type Container,
  type Document,
  type PluginCreator,
  Rule,
} from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { warn } from '../warn'

const animationNameRE = /^(?:-\w+-)?animation-name$/
const animationRE = /^(?:-\w+-)?animation$/
const keyframesRE = /^(?:-\w+-)?keyframes$/

const scopedPlugin: PluginCreator<string> = (id = '') => {
  const keyframes = Object.create(null)
  const shortId = id.replace(/^data-v-/, '')

  return {
    postcssPlugin: 'vue-sfc-scoped',
    Rule(rule) {
      processRule(id, rule)
    },
    AtRule(node) {
      // 注册 keyframes 并添加 scoped ID 后缀
      if (keyframesRE.test(node.name) && !node.params.endsWith(`-${shortId}`)) {
        keyframes[node.params] = node.params = node.params + '-' + shortId
      }
    },
    OnceExit(root) {
      if (Object.keys(keyframes).length) {
        // 重写 animation / animation-name 中的 keyframes 引用
        root.walkDecls(decl => {
          // animation-name
          if (animationNameRE.test(decl.prop)) {
            decl.value = decl.value
              .split(',')
              .map(v => keyframes[v.trim()] || v.trim())
              .join(',')
          }
          // animation 简写
          if (animationRE.test(decl.prop)) {
            decl.value = decl.value
              .split(',')
              .map(v => {
                const vals = v.trim().split(/\s+/)
                const i = vals.findIndex(val => keyframes[val])
                if (i !== -1) {
                  vals.splice(i, 1, keyframes[vals[i]])
                  return vals.join(' ')
                } else {
                  return v
                }
              })
              .join(',')
          }
        })
      }
    },
  }
}

const processedRules = new WeakSet<Rule>()

function processRule(id: string, rule: Rule) {
  if (
    processedRules.has(rule) ||
    (rule.parent &&
      rule.parent.type === 'atrule' &&
      keyframesRE.test((rule.parent as AtRule).name))
  ) {
    return
  }
  processedRules.add(rule)
  // 判断是否在 deep 容器中
  let deep = false
  let parent: Document | Container | undefined = rule.parent
  while (parent && parent.type !== 'root') {
    if ((parent as any).__deep) {
      deep = true
      break
    }
    parent = parent.parent
  }
  rule.selector = selectorParser(selectorRoot => {
    selectorRoot.each(selector => {
      rewriteSelector(id, rule, selector, selectorRoot, deep)
    })
  }).processSync(rule.selector)
}

function rewriteSelector(
  id: string,
  rule: Rule,
  selector: selectorParser.Selector,
  selectorRoot: selectorParser.Root,
  deep: boolean,
  slotted = false,
) {
  let node: selectorParser.Node | null = null
  let shouldInject = !deep
  let hasNestedDeep = false
  let splitForNestedDeep = false
  // 找到最后一个子节点来插入属性选择器
  selector.each(n => {
    // DEPRECATED ">>>" and "/deep/" combinator
    if (
      n.type === 'combinator' &&
      (n.value === '>>>' || n.value === '/deep/')
    ) {
      n.value = ' '
      n.spaces.before = n.spaces.after = ''
      warn(
        `the >>> and /deep/ combinators have been deprecated. ` +
          `Use :deep() instead.`,
      )
      return false
    }

    if (n.type === 'pseudo') {
      const { value } = n
      // 容器伪类（:is/:where/:has/:not）中包含 :deep()
      if (isDeepContainerPseudo(n)) {
        const hasDeepSelectors = n.nodes.some(selector =>
          selector.some(isDeepSelector),
        )
        if (hasDeepSelectors) {
          const hasScopeAnchor = !!node
          const hasMixedSelectors = n.nodes.some(
            selector => !selector.some(isDeepSelector),
          )
          const hasTrailingNodes = selector.index(n) < selector.length - 1
          // :is/:where/:has 可拆分时 → 拆分为多条规则
          if (
            canSplitDeepContainerPseudo(n) &&
            !deep &&
            !hasScopeAnchor &&
            hasMixedSelectors &&
            hasTrailingNodes
          ) {
            splitSelectorForNestedDeep(
              id,
              rule,
              selector,
              selectorRoot,
              n,
              deep,
              slotted,
            )
            splitForNestedDeep = true
            return false
          }

          // :not 不可拆分 → 当前选择器前插入属性
          if (
            value === ':not' &&
            !deep &&
            !hasScopeAnchor &&
            hasMixedSelectors &&
            hasTrailingNodes
          ) {
            return
          }

          // 递归处理容器内的每个分支
          n.nodes.forEach(selector =>
            rewriteSelector(
              id,
              rule,
              selector,
              selectorRoot,
              deep || hasScopeAnchor,
              slotted,
            ),
          )
          if (!hasScopeAnchor) {
            node = n
            shouldInject = false
          }
          hasNestedDeep = true
        }
      }

      // :deep() / ::v-deep() → 穿透，不注入 scoped 属性
      if (value === ':deep' || value === '::v-deep') {
        ;(rule as any).__deep = true
        if (n.nodes.length) {
          // .foo ::v-deep(.bar) → [data-v-xxx] .foo .bar
          let last: selectorParser.Selector['nodes'][0] = n
          n.nodes[0].each(ss => {
            selector.insertAfter(last, ss)
            last = ss
          })
          // 在前面插入空格 combinator
          const prev = selector.at(selector.index(n) - 1)
          if (!prev || !isSpaceCombinator(prev)) {
            selector.insertAfter(
              n,
              selectorParser.combinator({
                value: ' ',
              }),
            )
          }
          selector.removeChild(n)
        } else {
          // 旧语法：::v-deep .bar → [data-v-xxx] .bar
          warn(
            `${value} usage as a combinator has been deprecated. ` +
              `Use :deep(<inner-selector>) instead of ${value} <inner-selector>.`,
          )

          const prev = selector.at(selector.index(n) - 1)
          if (prev && isSpaceCombinator(prev)) {
            selector.removeChild(prev)
          }
          selector.removeChild(n)
        }
        return false
      }

      // :slotted() / ::v-slotted() → [data-v-xxx-s] .foo
      if (value === ':slotted' || value === '::v-slotted') {
        rewriteSelector(
          id,
          rule,
          n.nodes[0],
          selectorRoot,
          deep,
          true /* slotted */,
        )
        let last: selectorParser.Selector['nodes'][0] = n
        n.nodes[0].each(ss => {
          selector.insertAfter(last, ss)
          last = ss
        })
        selector.removeChild(n)
        // slotted 属性已限定作用域，不需要普通 scoped 属性
        shouldInject = false
        return false
      }

      // :global() / ::v-global() → 仅保留内部选择器
      if (value === ':global' || value === '::v-global') {
        selector.replaceWith(n.nodes[0])
        return false
      }
    }

    // 通配符 → 替换为属性选择器
    if (n.type === 'universal') {
      const prev = selector.at(selector.index(n) - 1)
      const next = selector.at(selector.index(n) + 1)
      if (!prev) {
        // * .foo {} → .foo[data-v-xxx] {}
        if (next) {
          if (next.type === 'combinator' && next.value === ' ') {
            selector.removeChild(next)
          }
          selector.removeChild(n)
          return
        } else {
          // * {} → [data-v-xxx] {}
          node = selectorParser.combinator({
            value: '',
          })
          selector.insertBefore(n, node)
          selector.removeChild(n)
          return false
        }
      }
      // .foo * → [data-v-xxx] .foo *
      if (node) return
    }

    // 记录最后一个非伪类/非 combinatior 节点
    if (
      !hasNestedDeep &&
      ((n.type !== 'pseudo' && n.type !== 'combinator') ||
        (n.type === 'pseudo' &&
          (n.value === ':is' || n.value === ':where') &&
          !node))
    ) {
      node = n
    }
  })

  if (splitForNestedDeep) {
    return
  }

  // 如果规则内有子 rule → 提取 declarations
  if (rule.nodes.some(node => node.type === 'rule')) {
    const deep = (rule as any).__deep
    if (!deep) {
      extractAndWrapNodes(rule)
      const atruleNodes = rule.nodes.filter(node => node.type === 'atrule')
      for (const atnode of atruleNodes) {
        extractAndWrapNodes(atnode)
      }
    }
    shouldInject = deep
  }

  // :is/:where 作为插入点的特殊处理
  if (node && !hasNestedDeep) {
    const { type, value } = node as selectorParser.Node
    if (type === 'pseudo' && (value === ':is' || value === ':where')) {
      ;(node as selectorParser.Pseudo).nodes.forEach(value =>
        rewriteSelector(id, rule, value, selectorRoot, deep, slotted),
      )
      shouldInject = false
    }
  }

  if (node) {
    ;(node as selectorParser.Node).spaces.after = ''
  } else {
    // deep 选择器和独立伪类选择器 → 属性前置而非后置
    // → 清理开头空白
    selector.first.spaces.before = ''
  }

  if (shouldInject) {
    const idToAdd = slotted ? id + '-s' : id
    selector.insertAfter(
      node as any,
      selectorParser.attribute({
        attribute: idToAdd,
        value: idToAdd,
        raws: {},
        quoteMark: `"`,
      }),
    )
  }
}

function isSpaceCombinator(node: selectorParser.Node) {
  return node.type === 'combinator' && /^\s+$/.test(node.value)
}

function isDeepSelector(node: selectorParser.Node): boolean {
  if (
    node.type === 'pseudo' &&
    (node.value === ':deep' || node.value === '::v-deep')
  ) {
    return true
  }

  return !!(
    node as selectorParser.Node & { nodes?: selectorParser.Node[] }
  ).nodes?.some(child => isDeepSelector(child))
}

function isDeepContainerPseudo(
  node: selectorParser.Node,
): node is selectorParser.Pseudo {
  return (
    node.type === 'pseudo' &&
    (node.value === ':is' ||
      node.value === ':where' ||
      node.value === ':has' ||
      node.value === ':not')
  )
}

/** :not 不可拆分，仅 :is/:where/:has 可 */
function canSplitDeepContainerPseudo(node: selectorParser.Pseudo): boolean {
  return (
    node.value === ':is' || node.value === ':where' || node.value === ':has'
  )
}

/**
 * 拆分 deep 容器伪类为多条选择器
 *
 * :is(.a, :deep(.b)) .child
 * → .a[data-v-xxx] .child, [data-v-xxx] .b .child
 */
function splitSelectorForNestedDeep(
  id: string,
  rule: Rule,
  selector: selectorParser.Selector,
  selectorRoot: selectorParser.Root,
  pseudo: selectorParser.Pseudo,
  deep: boolean,
  slotted: boolean,
) {
  const pseudoIndex = selector.index(pseudo)
  const selectors = pseudo.nodes.map((branch, index) => {
    const branchSelector = selector.clone()
    if (branchSelector.first) {
      branchSelector.first.spaces.before =
        index === 0 ? selector.first.spaces.before : ' '
    }
    const branchPseudo = branchSelector.at(pseudoIndex) as selectorParser.Pseudo
    const branchClone = branch.clone()
    if (branchClone.first) {
      branchClone.first.spaces.before = ''
    }
    branchPseudo.removeAll()
    branchPseudo.append(branchClone)
    rewriteSelector(id, rule, branchSelector, selectorRoot, deep, slotted)
    return branchSelector
  })

  selector.replaceWith(...selectors)
}

/**
 * 从 CSS 规则中提取 declarations → 用 `&` 包装
 *
 * .foo { color: red; .bar { ... } }
 * → .foo { .bar { ... } } + .foo { & { color: red } }
 */
function extractAndWrapNodes(parentNode: Rule | AtRule) {
  if (!parentNode.nodes) return
  const nodes = parentNode.nodes.filter(
    node => node.type === 'decl' || node.type === 'comment',
  )
  if (nodes.length) {
    for (const node of nodes) {
      parentNode.removeChild(node)
    }
    const wrappedRule = new Rule({
      nodes: nodes,
      selector: '&',
    })
    parentNode.prepend(wrappedRule)
  }
}

scopedPlugin.postcss = true
export default scopedPlugin
