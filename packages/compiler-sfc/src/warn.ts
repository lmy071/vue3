/**
 * warn.ts —— SFC 编译器警告输出
 *
 * ## 功能概述
 * 提供 @vue/compiler-sfc 包的警告日志工具。
 *
 * ## warnOnce
 * 防重复机制：同一消息只警告一次（通过 hasWarned 记录）。
 *
 * ## warn
 * 输出带颜色标记的警告，格式：
 *   `[@vue/compiler-sfc] <message>`
 * 前景色黄色（ANSI 33），包名加粗。
 */

const hasWarned: Record<string, boolean> = {}

export function warnOnce(msg: string): void {
  const isNodeProd =
    typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
  if (!isNodeProd && !__TEST__ && !hasWarned[msg]) {
    hasWarned[msg] = true
    warn(msg)
  }
}

export function warn(msg: string): void {
  console.warn(
    `\x1b[1m\x1b[33m[@vue/compiler-sfc]\x1b[0m\x1b[33m ${msg}\x1b[0m\n`,
  )
}
