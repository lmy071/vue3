/**
 * warning.ts —— 响应式系统的警告/日志输出工具
 *
 * 简单的 warn 函数封装，统一日志格式前缀 `[Vue warn]`。
 * 在 prod 构建中会被 tree-shake（通过 __DEV__ 条件分支）。
 */

export function warn(msg: string, ...args: any[]): void {
  console.warn(`[Vue warn] ${msg}`, ...args)
}
