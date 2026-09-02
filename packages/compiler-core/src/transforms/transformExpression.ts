/**
 * transformExpression —— 表达式转换为复合表达式
 *
 * ## 功能概述
 * 这是 Vue 编译器中最核心的 transform 之一。它将模板中的表达式（插值和指令表达式）
 * 转换为 prefix-aware 的复合表达式，使得运行时能正确访问各个作用域的数据。
 *
 * ## 三大职责
 * 1. **标识符前缀化**：将表达式中无修饰的标识符加上 `_ctx.` 等前缀
 *    例如 `count` → `_ctx.count`，`$ref` → `$setup.$ref`
 * 2. **Ref 展开**：根据 bindingMetadata 对 ref 类型的绑定自动展开 `.value`
 *    `count` (ref) → `_ctx.count.value`（写入）/ `unref(_ctx.count)`（读取）
 * 3. **源映射增强**：将简单表达式转换为包含精确位置信息的复合表达式
 *
 * ## 为什么只在非浏览器构建中生效
 * - 依赖 `@babel/parser` 做 JavaScript 解析（浏览器不引入）
 * - 浏览器构建使用 `with(this)` 隔离作用域，不需要前缀化
 */

import type { NodeTransform, TransformContext } from '../transform'
import {
  type CompoundExpressionNode,
  ConstantTypes,
  type ExpressionNode,
  NodeTypes,
  type SimpleExpressionNode,
  createCompoundExpression,
  createSimpleExpression,
} from '../ast'
import {
  isInDestructureAssignment,
  isInNewExpression,
  isStaticProperty,
  isStaticPropertyKey,
  walkIdentifiers,
} from '../babelUtils'
import { advancePositionWithClone, findDir, isSimpleIdentifier } from '../utils'
import {
  genPropsAccessExp,
  hasOwn,
  isGloballyAllowed,
  isString,
  makeMap,
} from '@vue/shared'
import { ErrorCodes, createCompilerError } from '../errors'
import type {
  AssignmentExpression,
  Identifier,
  Node,
  UpdateExpression,
} from '@babel/types'
import { validateBrowserExpression } from '../validateExpression'
import { parseExpression } from '@babel/parser'
import { IS_REF, UNREF } from '../runtimeHelpers'
import { BindingTypes } from '../options'

// 需要保持为字面量的白名单（不做任何前缀转换）
const isLiteralWhitelisted = /*@__PURE__*/ makeMap('true,false,null,this')

/**
 * 表达式转换器主入口
 *
 * 处理插值和元素上的指令表达式。
 *
 * 特殊跳过：
 * - v-for 指令（由 vFor transform 单独处理）
 * - v-on 带参数的指令（需要特殊处理内联语句）
 * - v-memo 的 key 参数（已在 transformFor 中处理）
 */
export const transformExpression: NodeTransform = (node, context) => {
  if (node.type === NodeTypes.INTERPOLATION) {
    // 插值表达式：{{ expr }} → 处理 expr
    node.content = processExpression(
      node.content as SimpleExpressionNode,
      context,
    )
  } else if (node.type === NodeTypes.ELEMENT) {
    // 元素上的指令表达式
    const memo = findDir(node, 'memo')
    for (let i = 0; i < node.props.length; i++) {
      const dir = node.props[i]

      if (dir.type === NodeTypes.DIRECTIVE && dir.name !== 'for') {
        const exp = dir.exp
        const arg = dir.arg

        /**
         * 处理指令表达式（exp）
         *
         * 排除条件：
         * 1. exp 不存在 / 不是 SIMPLE_EXPRESSION → 跳过
         * 2. v-on 带 arg → 跳过（v-on 需要特殊处理内联语句包装）
         * 3. v-memo 的 key 参数 → 跳过（已在 transformFor 的 v-memo 处理中处理）
         */
        if (
          exp &&
          exp.type === NodeTypes.SIMPLE_EXPRESSION &&
          !(dir.name === 'on' && arg) &&
          !(
            memo &&
            context.vForMemoKeyedNodes.has(node) &&
            arg &&
            arg.type === NodeTypes.SIMPLE_EXPRESSION &&
            arg.content === 'key'
          )
        ) {
          dir.exp = processExpression(
            exp,
            context,
            // v-slot 的参数作为函数参数处理
            dir.name === 'slot',
          )
        }

        // 处理动态指令参数（如 :arg 中的 arg）
        if (arg && arg.type === NodeTypes.SIMPLE_EXPRESSION && !arg.isStatic) {
          dir.arg = processExpression(arg, context)
        }
      }
    }
  }
}

/**
 * 前缀元数据
 *
 * 记录标识符的前缀信息：
 * - prefix: 前缀字符串（如对象简写展开的 "foo: "）
 * - isConstant: 该标识符是否为常量
 * - scopeIds: 作用域标识符集合
 */
interface PrefixMeta {
  prefix?: string
  isConstant: boolean
  start: number
  end: number
  scopeIds?: Set<string>
}

/**
 * 表达式处理核心函数
 *
 * 这是整个前缀化系统的核心。它：
 * 1. 使用 babel parser 解析表达式为 AST
 * 2. 遍历 AST 中的所有标识符
 * 3. 根据 bindingMetadata 决定每个标识符的前缀
 * 4. 将表达式拆分为复合表达式（字符串 + 子表达式的交替序列）
 *
 * @param node            - 原始简单表达式
 * @param context         - 转换上下文
 * @param asParams        - 是否作为函数参数处理（v-slot props, v-for aliases）
 * @param asRawStatements - 是否作为原始语句处理（v-on 多语句 handler）
 * @param localVars       - 局部变量集合
 * @returns 处理后的表达式（简单表达式或复合表达式）
 */
export function processExpression(
  node: SimpleExpressionNode,
  context: TransformContext,
  asParams = false,
  asRawStatements = false,
  localVars: Record<string, number> = Object.create(context.identifiers),
): ExpressionNode {
  // 浏览器构建：只做简单验证，不做前缀转换
  if (__BROWSER__) {
    if (__DEV__) {
      validateBrowserExpression(node, context, asParams, asRawStatements)
    }
    return node
  }

  // 未开启前缀模式 / 空表达式 → 直接返回
  if (!context.prefixIdentifiers || !node.content.trim()) {
    return node
  }

  const { inline, bindingMetadata } = context

  /**
   * 标识符重写函数
   *
   * 对 AST 中每个标识符，根据其绑定类型决定如何改写。
   * 这是整个表达式系统最核心的函数。
   */
  const rewriteIdentifier = (
    raw: string,
    parent?: Node | null,
    id?: Identifier,
  ) => {
    const type = hasOwn(bindingMetadata, raw) && bindingMetadata[raw]

    if (inline) {
      /**
       * inline 模式（<script setup>）
       *
       * 精确判断标识符的上下文：
       * - AssignmentExpression 左侧 → 写入位置
       * - UpdateExpression 的参数 → 自增/自减
       * - DestructureAssignment → 解构赋值
       * - NewExpression → new 调用
       */

      const isAssignmentLVal =
        parent && parent.type === 'AssignmentExpression' && parent.left === id
      const isUpdateArg =
        parent && parent.type === 'UpdateExpression' && parent.argument === id
      const isDestructureAssignment =
        parent && isInDestructureAssignment(parent, parentStack)
      const isNewExpression = parent && isInNewExpression(parentStack)

      // unref 包装辅助函数
      const wrapWithUnref = (raw: string) => {
        const wrapped = `${context.helperString(UNREF)}(${raw})`
        // new 表达式需要额外括号保证优先级
        return isNewExpression ? `(${wrapped})` : wrapped
      }

      if (
        isConst(type) ||
        type === BindingTypes.SETUP_REACTIVE_CONST ||
        localVars[raw]
      ) {
        /**
         * 常量绑定 → 不做任何处理
         * - SETUP_CONST：const 声明的
         * - LITERAL_CONST：字面量常量
         * - SETUP_REACTIVE_CONST：reactive() 包装的常量
         * - localVars：局部作用域变量（v-for 迭代变量等）
         */
        return raw
      } else if (type === BindingTypes.SETUP_REF) {
        // 已知 ref：访问时自动展开 .value
        return `${raw}.value`
      } else if (type === BindingTypes.SETUP_MAYBE_REF) {
        /**
         * 可能是 ref 的绑定
         *
         * 写入位置（赋值/自增/解构）：
         *   直接写 .value（如果不是 ref 这个操作无意义）
         *
         * 读取位置：
         *   unref(raw) → 运行时判断并展开
         */
        return isAssignmentLVal || isUpdateArg || isDestructureAssignment
          ? `${raw}.value`
          : wrapWithUnref(raw)
      } else if (type === BindingTypes.SETUP_LET) {
        /**
         * let 绑定：最复杂的场景
         *
         * 需要区分写入和读取：
         * - 读取：unref(raw)
         * - 写入：isRef(raw) ? raw.value = newValue : raw = newValue
         *
         * 因为 let 可以是普通值也可以是 ref，运行时检查。
         */
        if (isAssignmentLVal) {
          /**
           * 赋值表达式：x = y
           *
           * 生成的代码：
           *   isRef(x) ? x.value = y : x = y
           *
           * y 也需要经过 processExpression 处理（递归前缀化）
           */
          const { right: rVal, operator } = parent as AssignmentExpression
          const rExp = rawExp.slice(rVal.start! - 1, rVal.end! - 1)
          const rExpString = stringifyExpression(
            processExpression(
              createSimpleExpression(rExp, false),
              context,
              false,
              false,
              knownIds,
            ),
          )
          return `${context.helperString(IS_REF)}(${raw})${
            context.isTS ? ` //@ts-ignore\n` : ``
          } ? ${raw}.value ${operator} ${rExpString} : ${raw}`
        } else if (isUpdateArg) {
          /**
           * 自增/自减：x++ 或 ++x
           *
           * 生成的代码：
           *   isRef(x) ? x.value++ : x++
           */
          // 扩展 id 的 range 以覆盖整个运算符，这样在生成复合表达式时能被移除
          id!.start = parent!.start
          id!.end = parent!.end
          const { prefix: isPrefix, operator } = parent as UpdateExpression
          const prefix = isPrefix ? operator : ``
          const postfix = isPrefix ? `` : operator
          return `${context.helperString(IS_REF)}(${raw})${
            context.isTS ? ` //@ts-ignore\n` : ``
          } ? ${prefix}${raw}.value${postfix} : ${prefix}${raw}${postfix}`
        } else if (isDestructureAssignment) {
          // 解构赋值中的 let：目前直接返回原始名称
          // TODO: 这很难在不改变原始代码结构的情况下正确处理
          return raw
        } else {
          return wrapWithUnref(raw)
        }
      } else if (type === BindingTypes.PROPS) {
        // Props：通过 __props 访问（compileScript 生成的辅助变量）
        return genPropsAccessExp(raw)
      } else if (type === BindingTypes.PROPS_ALIASED) {
        // Props 别名（从 defineProps() 解构后的别名）
        return genPropsAccessExp(bindingMetadata.__propsAliases![raw])
      }
    } else {
      /**
       * 非 inline 模式（Options API）
       *
       * setup 绑定 → `$setup.xxx`
       * props → `$props.xxx`
       * data → `$data.xxx`
       * 等等
       */
      if (
        (type && type.startsWith('setup')) ||
        type === BindingTypes.LITERAL_CONST
      ) {
        return `$setup.${raw}`
      } else if (type === BindingTypes.PROPS_ALIASED) {
        return `$props['${bindingMetadata.__propsAliases![raw]}']`
      } else if (type) {
        return `$${type}.${raw}`
      }
    }

    // 未知绑定 → 默认 _ctx.xxx
    return `_ctx.${raw}`
  }

  // ============================================================
  // 快速路径：简单标识符
  // ============================================================

  const rawExp = node.content
  let ast = node.ast

  // ast 为 false 表示解析阶段已经出错，跳过处理
  if (ast === false) {
    return node
  }

  if (ast === null || (!ast && isSimpleIdentifier(rawExp))) {
    /**
     * 表达式是单个简单标识符（如 `count`、`$ref`）
     *
     * 不需要 babel 解析，直接根据 bindingMetadata 判断前缀。
     *
     * 三种情况：
     * 1. 需要前缀化 → 改写标识符，标记 constType
     * 2. 是字面量 → 标记 CAN_STRINGIFY
     * 3. 是允许的全局变量 → 标记 CAN_CACHE
     */
    const isScopeVarReference = context.identifiers[rawExp]
    const isAllowedGlobal = isGloballyAllowed(rawExp)
    const isLiteral = isLiteralWhitelisted(rawExp)

    if (
      !asParams &&
      !isScopeVarReference &&
      !isLiteral &&
      (!isAllowedGlobal || bindingMetadata[rawExp])
    ) {
      // 需要前缀化的标识符
      if (isConst(bindingMetadata[rawExp])) {
        // setup 暴露的 const 绑定可以跳过 patch 但不能提升到模块范围
        node.constType = ConstantTypes.CAN_SKIP_PATCH
      }
      node.content = rewriteIdentifier(rawExp)
    } else if (!isScopeVarReference) {
      // 字面量或全局变量 → 标记常量类型
      if (isLiteral) {
        node.constType = ConstantTypes.CAN_STRINGIFY
      } else {
        node.constType = ConstantTypes.CAN_CACHE
      }
    }
    return node
  }

  // ============================================================
  // 完整路径：babel 解析 + AST 遍历
  // ============================================================

  if (!ast) {
    /**
     * 使用 @babel/parser 解析表达式
     *
     * 三种解析模式：
     * 1. asRawStatements (v-on 多语句 handler)：直接包空格解析
     *    需要空格确保位置偏移正确
     * 2. asParams (v-for/v-slot 参数)：包括号 + 箭头函数体
     *    确保标识符被解析为函数参数
     * 3. 普通表达式：包括号
     *    确保对象字面量等被正确解析为表达式
     */
    const source = asRawStatements
      ? ` ${rawExp} `
      : `(${rawExp})${asParams ? `=>{}` : ``}`
    try {
      ast = parseExpression(source, {
        sourceType: 'module',
        plugins: context.expressionPlugins,
      })
    } catch (e: any) {
      context.onError(
        createCompilerError(
          ErrorCodes.X_INVALID_EXPRESSION,
          node.loc,
          undefined,
          e.message,
        ),
      )
      return node
    }
  }

  type QualifiedId = Identifier & PrefixMeta
  const ids: QualifiedId[] = []
  const parentStack: Node[] = []
  const knownIds: Record<string, number> = Object.create(context.identifiers)

  /**
   * 遍历 AST 中的所有标识符
   *
   * 对每个标识符：
   * 1. 静态属性 key 跳过（不需要前缀化）
   * 2. 需要引用且可前缀化 → rewriteIdentifier 改写
   * 3. 不需要前缀化 → 标记 isConstant，用于源映射优化
   * 4. 所有标识符都加入 ids 列表（用于构建复合表达式）
   */
  walkIdentifiers(
    ast,
    (node, parent, _, isReferenced, isLocal) => {
      // 静态属性 key 不处理
      if (isStaticPropertyKey(node, parent!)) {
        return
      }

      // Vue 2 filter 兼容
      if (__COMPAT__ && node.name.startsWith('_filter_')) {
        return
      }

      const needPrefix = isReferenced && canPrefix(node)

      if (needPrefix && !isLocal) {
        // 需要前缀化的标识符
        if (isStaticProperty(parent!) && parent.shorthand) {
          /**
           * 对象属性简写：{ foo } → { foo: _ctx.foo }
           *
           * 当值被改写为 _ctx.foo 后，key 也必须显式写出来。
           * 所以记录 "foo: " 作为 prefix。
           */
          ;(node as QualifiedId).prefix = `${node.name}: `
        }
        node.name = rewriteIdentifier(node.name, parent, node)
        ids.push(node as QualifiedId)
      } else {
        /**
         * 不需要前缀化的标识符
         *
         * 标记为常量的条件：
         * - 不是需要前缀的局部变量
         * - 不在 CallExpression/NewExpression/MemberExpression 的 callee/object 位置
         *
         * 仍然加入 ids 列表，用于构建复合表达式（改善源映射）
         */
        if (
          !(needPrefix && isLocal) &&
          (!parent ||
            (parent.type !== 'CallExpression' &&
              parent.type !== 'NewExpression' &&
              parent.type !== 'MemberExpression'))
        ) {
          ;(node as QualifiedId).isConstant = true
        }
        ids.push(node as QualifiedId)
      }
    },
    true, // 遍历所有标识符（包括 object key 位置的）
    parentStack,
    knownIds,
  )

  /**
   * 构建复合表达式
   *
   * 将原始表达式字符串拆分为交替的 "字符串片段 + 子表达式" 序列。
   *
   * 例如 `foo + bar`，经过前缀化 `foo` → `_ctx.foo`，`bar` → `_ctx.bar`：
   * children = [
   *   createSimpleExpression("_ctx.foo"),  // 带 source map 位置
   *   " + ",                               // 原始字符串片段
   *   createSimpleExpression("_ctx.bar"),
   * ]
   *
   * 这样 codegen 时可以给每个标识符精确的 source map 位置，
   * 同时整体表达式的语义也保持不变。
   */
  const children: CompoundExpressionNode['children'] = []
  ids.sort((a, b) => a.start - b.start)
  ids.forEach((id, i) => {
    // -1 因为 babel 解析时源码被括号包裹
    const start = id.start - 1
    const end = id.end - 1
    const last = ids[i - 1]
    const leadingText = rawExp.slice(last ? last.end - 1 : 0, start)

    if (leadingText.length || id.prefix) {
      children.push(leadingText + (id.prefix || ``))
    }

    const source = rawExp.slice(start, end)
    children.push(
      createSimpleExpression(
        id.name,
        false,
        {
          start: advancePositionWithClone(node.loc.start, source, start),
          end: advancePositionWithClone(node.loc.start, source, end),
          source,
        },
        id.isConstant
          ? ConstantTypes.CAN_STRINGIFY
          : ConstantTypes.NOT_CONSTANT,
      ),
    )

    // 尾部剩余文本
    if (i === ids.length - 1 && end < rawExp.length) {
      children.push(rawExp.slice(end))
    }
  })

  let ret: ExpressionNode
  if (children.length) {
    // 有子表达式 → 创建复合表达式
    ret = createCompoundExpression(children, node.loc)
    ret.ast = ast
  } else {
    // 没有标识符（纯字面量/常量）→ 使用原始节点并标记 CAN_STRINGIFY
    ret = node
    ret.constType = ConstantTypes.CAN_STRINGIFY
  }
  ret.identifiers = Object.keys(knownIds)
  return ret
}

/**
 * 判断标识符是否可以添加前缀
 *
 * 跳过全局白名单中的标识符（如 Math、console），
 * 以及 webpack 的 require（特殊兼容处理）。
 */
function canPrefix(id: Identifier) {
  if (isGloballyAllowed(id.name)) return false
  if (id.name === 'require') return false
  return true
}

/**
 * 将表达式序列化为字符串
 *
 * 递归展开复合表达式，拼接所有子节点。
 * 用于 let 绑定赋值的右侧表达式处理。
 */
export function stringifyExpression(exp: ExpressionNode | string): string {
  if (isString(exp)) {
    return exp
  } else if (exp.type === NodeTypes.SIMPLE_EXPRESSION) {
    return exp.content
  } else {
    return (exp.children as (ExpressionNode | string)[])
      .map(stringifyExpression)
      .join('')
  }
}

/**
 * 判断绑定类型是否为常量
 */
function isConst(type: unknown) {
  return (
    type === BindingTypes.SETUP_CONST || type === BindingTypes.LITERAL_CONST
  )
}
