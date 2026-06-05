/**
 * vBind 转换器 —— v-bind 指令（带参数）的编译时转换
 *
 * ## 功能概述
 * 处理 v-bind:arg="expr" 形式的属性绑定指令。
 * 注意：不带参数的 v-bind（即 v-bind="obj"）在 transformElement.ts 中处理，
 * 因为它影响整个 props 对象的代码生成。
 * 本转换器仅处理 **带参数** 的 v-bind 用法。
 *
 * ## 处理的修饰符
 * - `.camel`  —— 将属性名转为驼峰形式
 * - `.prop`   —— 作为 DOM property 而非 attribute 绑定（. 前缀）
 * - `.attr`   —— 强制作为 HTML attribute 绑定（^ 前缀）
 *
 * ## 设计要点
 * - 空表达式在非浏览器构建中报错，浏览器构建中忽略（#10280 / #13930）
 * - 动态参数会添加 || "" 安全回退，避免 undefined 作为属性名
 * - .prop 和 .attr 修饰符在 SSR 模式下被忽略（SSR 只输出 attribute）
 */

import type { DirectiveTransform } from '../transform'
import {
  type ExpressionNode,
  NodeTypes,
  createObjectProperty,
  createSimpleExpression,
} from '../ast'
import { ErrorCodes, createCompilerError } from '../errors'
import { camelize } from '@vue/shared'
import { CAMELIZE } from '../runtimeHelpers'

/**
 * v-bind 指令转换器（仅处理带参数的情况）
 *
 * 不带参数的 v-bind="obj" 由 transformElement.ts 统一处理，
 * 因为它需要影响整个 props 对象的代码生成策略。
 */
export const transformBind: DirectiveTransform = (dir, _node, context) => {
  const { modifiers, loc } = dir
  const arg = dir.arg! // 带参数场景下 arg 必定存在

  let { exp } = dir

  // ============================================================
  // 空表达式处理
  // ============================================================

  /**
   * 处理空表达式（如 :foo=""）
   *
   * 非浏览器构建：
   *   空表达式是用户的错误写法，报告编译错误 X_V_BIND_NO_EXPRESSION。
   *   但为了不中断编译流程，仍生成一个空字符串的静态绑定。
   *
   * 浏览器构建（__BROWSER__）：
   *   浏览器在解析 in-DOM 模板时，会把 :foo 解析为 :foo=""（#10280）。
   *   这是浏览器行为导致的，不应报错。
   *   将 exp 设为 undefined，让后续的同名简写逻辑处理。
   */
  if (exp && exp.type === NodeTypes.SIMPLE_EXPRESSION && !exp.content.trim()) {
    if (!__BROWSER__) {
      // 非浏览器构建：空表达式报错
      // #10280 只有非浏览器构建才对空表达式报错
      // 因为浏览器内解析 in-DOM 模板时 :foo 会被浏览器解析为 :foo=""
      context.onError(
        createCompilerError(ErrorCodes.X_V_BIND_NO_EXPRESSION, loc),
      )
      return {
        props: [
          createObjectProperty(arg, createSimpleExpression('', true, loc)),
        ],
      }
    } else {
      // 浏览器构建：忽略空表达式，交由同名简写逻辑
      exp = undefined
    }
  }

  // ============================================================
  // 动态参数的安全回退
  // ============================================================

  /**
   * 为动态参数添加 || "" 安全回退
   *
   * 当参数是动态表达式时（如 :[key]="value"），
   * 运行时 key 可能是 undefined 或 null，直接用它作为属性名会导致异常。
   * 添加 `` || "" `` 确保始终有一个合法的字符串作为回退值。
   *
   * 静态动态参数（如 :[true ? 'id' : 'name']）：
   *   类型为 SIMPLE_EXPRESSION 但 isStatic = false 的复合表达式也需处理
   */
  if (arg.type !== NodeTypes.SIMPLE_EXPRESSION) {
    // 复合表达式：包裹为 `(expr) || ""`
    arg.children.unshift(`(`)
    arg.children.push(`) || ""`)
  } else if (!arg.isStatic) {
    // 简单表达式（非静态）：追加 ` || ""`
    arg.content = arg.content ? `${arg.content} || ""` : `""`
  }

  // ============================================================
  // .camel 修饰符
  // ============================================================

  /**
   * 处理 .camel 修饰符
   *
   * .camel 将属性名强制转为驼峰格式。
   * .sync 修饰符已被 v-model:arg 替代，这里仅处理 .camel。
   *
   * 静态参数：直接在编译期 camelize
   * 动态参数：注入运行时 CAMELIZE 函数调用
   * 复合表达式：包裹为 CAMELIZE(expr) 调用
   */
  if (modifiers.some(mod => mod.content === 'camel')) {
    if (arg.type === NodeTypes.SIMPLE_EXPRESSION) {
      if (arg.isStatic) {
        // 静态参数：编译期转换，零运行时开销
        arg.content = camelize(arg.content)
      } else {
        // 动态参数：注入运行时 camelize 调用
        arg.content = `${context.helperString(CAMELIZE)}(${arg.content})`
      }
    } else {
      // 复合表达式：包裹为 CAMELIZE(expr) 调用
      arg.children.unshift(`${context.helperString(CAMELIZE)}(`)
      arg.children.push(`)`)
    }
  }

  // ============================================================
  // .prop / .attr 修饰符（非 SSR 模式）
  // ============================================================

  /**
   * 处理 .prop 和 .attr 修饰符
   *
   * .prop：作为 DOM property 绑定，属性名前加 . 前缀
   * .attr：强制作为 HTML attribute 绑定，属性名前加 ^ 前缀
   *
   * 在 SSR 模式下忽略这两个修饰符，因为：
   * - SSR 只输出 HTML attribute，property 绑定无意义
   * - 服务端没有 DOM API
   */
  if (!context.inSSR) {
    if (modifiers.some(mod => mod.content === 'prop')) {
      // .prop 修饰符 → . 前缀（property 绑定）
      injectPrefix(arg, '.')
    }
    if (modifiers.some(mod => mod.content === 'attr')) {
      // .attr 修饰符 → ^ 前缀（attribute 绑定）
      injectPrefix(arg, '^')
    }
  }

  // 返回 v-bind 生成的 props
  return {
    props: [createObjectProperty(arg, exp!)],
  }
}

/**
 * 向参数表达式注入前缀
 *
 * 不同表达式类型的注入方式：
 *
 * 静态简单表达式：
 *   "id" + "." → ".id"  （直接拼接）
 *
 * 动态简单表达式：
 *   idExpr + "." → `.\${idExpr}`  （模板字符串）
 *
 * 复合表达式：
 *   [expr] → '.' + (expr)  （字符串拼接）
 *
 * @param arg    - 参数表达式节点
 * @param prefix - 要注入的前缀字符串（. 或 ^）
 */
const injectPrefix = (arg: ExpressionNode, prefix: string) => {
  if (arg.type === NodeTypes.SIMPLE_EXPRESSION) {
    if (arg.isStatic) {
      // 静态：直接拼接字符串，编译时即确定
      arg.content = prefix + arg.content
    } else {
      // 动态：使用模板字符串注入前缀
      arg.content = `\`${prefix}\${${arg.content}}\``
    }
  } else {
    // 复合表达式：在前面插入前缀字符串拼接
    arg.children.unshift(`'${prefix}' + (`)
    arg.children.push(`)`)
  }
}
