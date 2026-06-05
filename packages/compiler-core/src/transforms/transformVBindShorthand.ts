/**
 * transformVBindShorthand —— v-bind 同名简写转换器
 *
 * ## 功能概述
 * Vue 3.4+ 支持 v-bind 的同名简写语法：当属性名和变量名相同时，
 * 可以省略属性值。例如 `:id` 等价于 `:id="id"`。
 * 这个转换器在编译阶段将简写形式展开为完整的绑定表达式。
 *
 * ## 使用示例
 * ```html
 * <!-- 简写形式 -->
 * <div :id :class="{ active }" />
 *
 * <!-- 等价于 -->
 * <div :id="id" :class="{ active }" />
 * ```
 *
 * ## 转换流程
 * 1. 遍历元素的所有 props，找到 v-bind 指令
 * 2. 检查该指令是否没有显式的表达式（即简写形式）
 * 3. 验证指令参数是合法的静态标识符
 * 4. 将参数名（camelized 后）作为表达式创建
 *
 * ## 设计要点
 * - 只处理静态参数（`isStatic === true`），动态参数不支持简写
 * - 参数名会经过 camelize 处理，`:my-prop` 展开为 `:my-prop="myProp"`
 * - 浏览器模式下需处理空字符串表达式（#13930）
 * - 非法参数会触发编译错误 X_V_BIND_INVALID_SAME_NAME_ARGUMENT
 */

import { camelize } from '@vue/shared'
import {
  NodeTypes,
  type SimpleExpressionNode,
  createSimpleExpression,
} from '../ast'
import type { NodeTransform } from '../transform'
import { ErrorCodes, createCompilerError } from '../errors'
import { validFirstIdentCharRE } from '../utils'

/**
 * v-bind 同名简写的节点转换器
 *
 * 将 `:arg` 形式的简写展开为 `:arg="arg"` 的完整形式。
 * 这是一个纯语法糖转换，不影响运行时的行为。
 */
export const transformVBindShorthand: NodeTransform = (node, context) => {
  // 只处理元素节点
  if (node.type === NodeTypes.ELEMENT) {
    // 遍历元素的所有属性/指令
    for (const prop of node.props) {
      /**
       * 检测 v-bind 同名简写：:arg 展开为 :arg="arg"
       *
       * 满足以下全部条件才算简写：
       * 1. prop.type === NodeTypes.DIRECTIVE   —— 是一个指令
       * 2. prop.name === 'bind'                —— 是 v-bind 指令
       * 3. (!prop.exp || ...)                  —— 没有显式的表达式（简写标志）
       * 4. prop.arg                            —— 有参数（才有展开的基础）
       *
       * 关于条件 3 的补充（浏览器模式兼容 #13930）：
       *   在浏览器内解析 in-DOM 模板时，`:foo` 可能被浏览器解析为 `:foo=""`，
       *   导致 prop.exp 是一个内容为空字符串的 SIMPLE_EXPRESSION。
       *   此时应该识别为简写形式而非空字符串绑定。
       *   所以额外检查：浏览器模式下如果表达式内容 trim 后为空，也视为简写。
       */
      if (
        prop.type === NodeTypes.DIRECTIVE &&
        prop.name === 'bind' &&
        (!prop.exp ||
          // #13930 浏览器内解析 in-DOM 模板时 :foo 变成 :foo=""
          (__BROWSER__ &&
            prop.exp.type === NodeTypes.SIMPLE_EXPRESSION &&
            !prop.exp.content.trim())) &&
        prop.arg
      ) {
        const arg = prop.arg

        /**
         * 参数合法性校验
         *
         * 简写只支持静态的、简单的参数表达式。
         * 动态参数（如 :[key]）或用复杂表达式计算的参数无法做简写展开。
         */
        if (arg.type !== NodeTypes.SIMPLE_EXPRESSION || !arg.isStatic) {
          // 非法参数：报告编译错误
          context.onError(
            createCompilerError(
              ErrorCodes.X_V_BIND_INVALID_SAME_NAME_ARGUMENT,
              arg.loc,
            ),
          )
          // 回退：设置一个空的静态表达式，避免后续阶段崩溃
          prop.exp = createSimpleExpression('', true, arg.loc)
        } else {
          /**
           * 合法参数：展开简写
           *
           * 1. 对参数名进行 camelize：`my-prop` → `myProp`
           * 2. 验证首字符是合法的标识符字符
           *
           * 首字符校验说明：
           * - validFirstIdentCharRE 匹配 JS 合法的标识符首字符（字母、_、$）
           * - 额外允许连字符 `-` 开头（为 vuejs/language-tools#3424 兼容）
           * - 如果首字符不合法，则不创建表达式（保持无 exp 状态）
           */
          const propName = camelize((arg as SimpleExpressionNode).content)
          if (
            validFirstIdentCharRE.test(propName[0]) ||
            // 允许连字符开头，兼容 language-tools 扩展
            // https://github.com/vuejs/language-tools/pull/3424
            propName[0] === '-'
          ) {
            /**
             * 创建展开后的表达式
             *
             * createSimpleExpression(content, isStatic, loc)
             * - content: camelized 后的属性名作为绑定变量名
             * - isStatic: false，因为这是一个变量引用，不是字面量
             * - loc: 使用参数的源码位置，便于错误报告定位
             */
            prop.exp = createSimpleExpression(propName, false, arg.loc)
          }
        }
      }
    }
  }
}
