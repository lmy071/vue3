/**
 * noopDirectiveTransform —— 空操作指令转换器
 *
 * ## 功能概述
 * 这是一个"无操作"的指令转换器，返回空的 props 数组。
 * 它作为一个占位符，用于那些不需要编译时特殊处理的指令。
 *
 * ## 使用场景
 * 在 Vue 编译器中，每个内置指令都需要有一个对应的 DirectiveTransform。
 * 某些指令在运行时已经能完全处理，编译阶段不需要生成任何额外的 props 或代码，
 * 此时就使用 noopDirectiveTransform 作为其转换器。
 *
 * ## 设计要点
 * - 返回 `{ props: [] }` 空 props，表示该指令不产生任何额外的 vnode props
 * - 作为一个类型安全的占位符，符合 DirectiveTransform 接口契约
 */

import type { DirectiveTransform } from '../transform'

/**
 * 空操作指令转换器
 *
 * 总是返回空的 props 数组，不产生任何副作用。
 * 用于那些在编译阶段无需处理的指令。
 */
export const noopDirectiveTransform: DirectiveTransform = () => ({ props: [] })
