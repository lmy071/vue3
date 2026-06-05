/**
 * vOn 转换器 —— v-on 指令的编译时转换
 *
 * ## 功能概述
 * 处理 `v-on:event="handler"` 或 `@event="handler"` 形式的 DOM 事件绑定。
 * 注意：不带参数的 `v-on="obj"` 由 transformElement.ts 统一处理。
 * 本转换器仅处理 **带参数** 的 v-on 用法。
 *
 * ## 核心处理逻辑
 * 1. **事件名规范化**：将原始事件名转为运行时使用的 key（如 click → onClick）
 * 2. **handler 表达式处理**：区分成员表达式、内联语句、函数表达式
 * 3. **handler 缓存优化**：对于可缓存的 handler，避免每次渲染创建新函数
 * 4. **修饰符支持**：通过运行时辅助函数处理（此处只解析不处理修饰符）
 *
 * ## 设计要点
 * - 成员表达式 handler 会被包裹为调用形式 `handler && handler(...args)` 以保持 arity
 * - 内联语句包装为 `$event => (表达式)` 函数
 * - handler 缓存通过 `context.cache()` 实现
 * - augmentor 模式允许上层编译器（如 DOM compiler）注入额外处理
 */

import type { DirectiveTransform, DirectiveTransformResult } from '../transform'
import {
  type DirectiveNode,
  ElementTypes,
  type ExpressionNode,
  NodeTypes,
  type SimpleExpressionNode,
  createCompoundExpression,
  createObjectProperty,
  createSimpleExpression,
} from '../ast'
import { camelize, toHandlerKey } from '@vue/shared'
import { ErrorCodes, createCompilerError } from '../errors'
import { processExpression } from './transformExpression'
import { validateBrowserExpression } from '../validateExpression'
import { hasScopeRef, isFnExpression, isMemberExpression } from '../utils'
import { TO_HANDLER_KEY } from '../runtimeHelpers'

/**
 * v-on 指令节点的类型增强
 *
 * 保证 arg 和 exp 的存在性和类型：
 * - arg 必然存在（带参数 v-on 的前提）
 * - exp 在带参数 v-on 中被 transformExpression 跳过，
 *   所以在这里是 SimpleExpressionNode 类型
 */
export interface VOnDirectiveNode extends DirectiveNode {
  // 不带参数的 v-on="obj" 由 transformElement.ts 统一处理
  // 这个转换器只处理带参数的情况
  arg: ExpressionNode
  // 带参数的 v-on 在 transformExpression 中被跳过（特殊处理）
  // 因此 exp 在这里保证是 SimpleExpressionNode 类型
  exp: SimpleExpressionNode | undefined
}

/**
 * v-on 指令的转换器
 *
 * @param dir       - 指令节点
 * @param node      - 当前元素节点
 * @param context   - 转换上下文
 * @param augmentor - 扩展增强函数（DOM compiler 用于注入事件修饰符处理）
 */
export const transformOn: DirectiveTransform = (
  dir,
  node,
  context,
  augmentor,
) => {
  const { loc, modifiers, arg } = dir as VOnDirectiveNode

  /**
   * 错误检查：v-on 没有表达式也没有修饰符
   *
   * `<button @click></button>` 是合法简写，但没有任何作用
   * `<button @click.stop></button>` 没有 handler 但有修饰符，也不算错
   */
  if (!dir.exp && !modifiers.length) {
    context.onError(createCompilerError(ErrorCodes.X_V_ON_NO_EXPRESSION, loc))
  }

  // ============================================================
  // 事件名处理
  // ============================================================

  let eventName: ExpressionNode

  if (arg.type === NodeTypes.SIMPLE_EXPRESSION) {
    if (arg.isStatic) {
      /**
       * 静态事件名 → 编译期确定
       *
       * 命名规则：
       * 1. vnode 钩子前缀检查（开发模式）：`vnode` 开头的有特殊警告
       * 2. vue: 前缀转换：`vue:xxx` → `vnode-xxx`（组件事件钩子）
       * 3. 非原生元素 / vnode 事件 / 不含大写字母 → toHandlerKey(camelize)
       *    例如 `my-event` → `onMyEvent`
       * 4. 原生元素且含大写字母（自定义事件） → 保持原样
       *    例如 `myEvent` → `on:myEvent`
       */
      let rawName = arg.content

      if (__DEV__ && rawName.startsWith('vnode')) {
        context.onError(createCompilerError(ErrorCodes.X_VNODE_HOOKS, arg.loc))
      }

      // vue: 命名空间转换
      if (rawName.startsWith('vue:')) {
        rawName = `vnode-${rawName.slice(4)}`
      }

      const eventString =
        node.tagType !== ElementTypes.ELEMENT ||
        rawName.startsWith('vnode') ||
        !/[A-Z]/.test(rawName)
          ? // 非元素或 vnode 生命周期事件：自动转 camelCase 后调用 toHandlerKey
            // https://github.com/vuejs/core/issues/2249
            toHandlerKey(camelize(rawName))
          : // 原生元素且含大写字母：保持原始大小写
            // 可能是自定义元素的 custom event，如 myEvent
            `on:${rawName}`

      eventName = createSimpleExpression(eventString, true, arg.loc)
    } else {
      /**
       * 动态事件名（SimpleExpression 类型但非静态）
       *
       * 例如：`@[eventName]="handler"`
       * 需要运行时调用 toHandlerKey 来转换事件名
       * https://github.com/vuejs/core/issues/2388
       */
      eventName = createCompoundExpression([
        `${context.helperString(TO_HANDLER_KEY)}(`,
        arg,
        `)`,
      ])
    }
  } else {
    /**
     * 动态事件名（CompoundExpression 类型）
     *
     * 更复杂的动态表达式，包裹为 TO_HANDLER_KEY(expr)
     */
    eventName = arg
    eventName.children.unshift(`${context.helperString(TO_HANDLER_KEY)}(`)
    eventName.children.push(`)`)
  }

  // ============================================================
  // Handler 表达式处理
  // ============================================================

  let exp: ExpressionNode | undefined = dir.exp as
    | SimpleExpressionNode
    | undefined

  // 空表达式处理（如 @click=""）→ 忽略为空
  if (exp && !exp.content.trim()) {
    exp = undefined
  }

  /**
   * 是否应该缓存 handler
   *
   * 初始判断：
   * - context.cacheHandlers 开启（编译选项）
   * - 没有显式表达式（意味着是 cacheHandlers 自动生成的 handler）
   * - 不在 v-once 作用域内（v-once 已有自己的缓存机制）
   */
  let shouldCache: boolean = context.cacheHandlers && !exp && !context.inVOnce

  if (exp) {
    // 表达式类型判断
    const isMemberExp = isMemberExpression(exp, context)           // 如 obj.method
    const isInlineStatement = !(isMemberExp || isFnExpression(exp, context)) // 内联语句
    const hasMultipleStatements = exp.content.includes(`;`)       // 多语句

    /**
     * 非浏览器构建：处理表达式（此前被 transformExpression 跳过）
     *
     * - 内联语句添加 `$event` 标识符（用于 scope 分析）
     * - 调用 processExpression 做前缀转换和作用域分析
     * - 多语句内联用 `{}` 包裹，单语句用 `()` 包裹
     */
    if (!__BROWSER__ && context.prefixIdentifiers) {
      isInlineStatement && context.addIdentifiers(`$event`)
      exp = dir.exp = processExpression(
        exp,
        context,
        false,                // 不是 v-for 的 source
        hasMultipleStatements, // 多语句模式
      )
      isInlineStatement && context.removeIdentifiers(`$event`)

      /**
       * handler 缓存的条件判断（更精确的二次判断）
       *
       * 以下情况不缓存：
       * 1. !context.cacheHandlers          —— 未开启 handler 缓存
       * 2. context.inVOnce                 —— v-once 内已有缓存
       * 3. exp 是运行时常量（constType > 0） —— 不需要缓存
       * 4. 成员表达式传给组件（#1541）       —— 需保持函数 arity
       * 5. 引用了闭包变量（v-for, v-slot）   —— 必须传新引用避免过期值
       */
      shouldCache =
        context.cacheHandlers &&
        !context.inVOnce &&
        !(exp.type === NodeTypes.SIMPLE_EXPRESSION && exp.constType > 0) &&
        !(isMemberExp && node.tagType === ElementTypes.COMPONENT) &&
        !hasScopeRef(exp, context.identifiers)

      /**
       * 成员表达式的调用包装
       *
       * 当 handler 是成员表达式且应该被缓存时：
       * `obj.method` → `obj.method && obj.method(...args)`
       *
       * 为什么要转成调用形式？
       * - 缓存的是箭头函数，不是方法引用本身
       * - 箭头函数内部通过成员表达式访问方法，始终拿到最新引用
       * - 避免将方法引用作为 prop 传入，那样会出现闭包过期问题
       */
      if (shouldCache && isMemberExp) {
        if (exp.type === NodeTypes.SIMPLE_EXPRESSION) {
          exp.content = `${exp.content} && ${exp.content}(...args)`
        } else {
          exp.children = [...exp.children, ` && `, ...exp.children, `(...args)`]
        }
      }
    }

    // 浏览器构建：验证表达式安全性
    if (__DEV__ && __BROWSER__) {
      validateBrowserExpression(
        exp as SimpleExpressionNode,
        context,
        false,
        hasMultipleStatements,
      )
    }

    /**
     * 将表达式包裹为函数
     *
     * 内联语句：
     *   `count++` → `$event => (count++)`
     *   多语句：`$event => { count++; foo($event) }`
     *   TS 模式：`($event: any) => (...)`
     *
     * 成员表达式且需缓存：
     *   `obj.method && obj.method(...args)` → `(...args) => (obj.method && obj.method(...args))`
     *   TS 模式加上 `@ts-ignore`（因为 args 类型可能不匹配）
     */
    if (isInlineStatement || (shouldCache && isMemberExp)) {
      exp = createCompoundExpression([
        `${isInlineStatement
            ? !__BROWSER__ && context.isTS
              ? `($event: any)`
              : `$event`
            : `${!__BROWSER__ && context.isTS ? `\n//@ts-ignore\n` : ``}(...args)`
        } => ${hasMultipleStatements ? `{` : `(`}`,
        exp,
        hasMultipleStatements ? `}` : `)`,
      ])
    }
  }

  // 构建转化结果
  let ret: DirectiveTransformResult = {
    props: [
      createObjectProperty(
        eventName,
        // 没有 handler 时生成空函数，避免 undefined 作为事件处理器
        exp || createSimpleExpression(`() => {}`, false, loc),
      ),
    ],
  }

  /**
   * Augmentor 机制
   *
   * 允许上层编译器（如 DOM compiler）注入额外的转换逻辑。
   * DOM compiler 通过 augmentor 添加事件修饰符的运行时处理代码。
   * 这使得 compiler-core 保持平台无关，修饰符处理由平台层负责。
   */
  if (augmentor) {
    ret = augmentor(ret)
  }

  /**
   * Handler 缓存
   *
   * 通过 context.cache() 包裹 handler，确保每次渲染传递的是同一个函数引用。
   * 这避免了组件因为接收内联 handler 而不断重新渲染。
   *
   * 缓存的 handler 在 patchFlag 机制下能正确跳过无变化组件的更新。
   */
  if (shouldCache) {
    ret.props[0].value = context.cache(ret.props[0].value)
  }

  /**
   * 标记为 handler key
   *
   * 用于 props 规范化检查——
   * 运行时 patchFlag 检查会依赖 isHandlerKey 判断是否需要比较 handler 引用。
   */
  ret.props.forEach(p => (p.key.isHandlerKey = true))
  return ret
}
